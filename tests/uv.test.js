import { describe, expect, it, vi, afterEach } from 'vitest';

import { UV_BANDS, bandRanges, fetchUv, formatUv, roundUv, uvBand } from '../src/uv.js';

describe('roundUv', () => {
    it('reports one decimal', () => {
        expect(roundUv(4)).toBe(4);
        expect(roundUv(4.04)).toBe(4);
        expect(roundUv(4.05)).toBe(4.1);
        expect(roundUv(2.94)).toBe(2.9);
    });
});

describe('formatUv', () => {
    it('always shows the decimal, so the number never changes width', () => {
        expect(formatUv(4, 'en')).toBe('4.0');
        expect(formatUv(11, 'en')).toBe('11.0');
    });

    it('uses the locale separator', () => {
        expect(formatUv(4.2, 'ru')).toBe('4,2');
        expect(formatUv(4.2, 'es')).toBe('4,2');
        expect(formatUv(4.2, 'en')).toBe('4.2');
    });

    it('formats the rounded value, matching what the band was picked from', () => {
        expect(formatUv(2.94, 'en')).toBe('2.9');
        expect(formatUv(2.95, 'en')).toBe('3.0');
    });
});

describe('bandRanges', () => {
    it('reads back the bands the product was specified with', () => {
        expect(bandRanges('en')).toEqual(['0–2.9', '3–5.9', '6–7.9', '8–10.9', '11+']);
    });

    it('uses the locale separator, like the reading on the card', () => {
        expect(bandRanges('ru')).toEqual(['0–2,9', '3–5,9', '6–7,9', '8–10,9', '11+']);
    });

    it('covers every band, and every range ends where the next begins', () => {
        const ranges = bandRanges('en');
        expect(ranges).toHaveLength(UV_BANDS.length);

        // The label of a band must classify back into that same band: the help
        // legend and the map cannot be allowed to disagree.
        ranges.forEach((range, i) => {
            const [from, to] = range.replace('+', '').split('–').map(Number);
            expect(uvBand(from).id).toBe(UV_BANDS[i].id);
            if (!Number.isNaN(to)) expect(uvBand(to).id).toBe(UV_BANDS[i].id);
        });
    });
});

describe('uvBand', () => {
    // The bands as the product defines them: 0–2.9 green, 3–5.9 yellow,
    // 6–7.9 orange, 8–10.9 red, 11+ violet.
    it.each([
        [0, 'low'],
        [1.5, 'low'],
        [2.9, 'low'],
        [3, 'moderate'],
        [4.7, 'moderate'],
        [5.9, 'moderate'],
        [6, 'high'],
        [7.9, 'high'],
        [8, 'veryHigh'],
        [10.9, 'veryHigh'],
        [11, 'extreme'],
        [16.4, 'extreme'],
    ])('puts %s in the %s band', (uv, id) => {
        expect(uvBand(uv).id).toBe(id);
    });

    it('classifies the rounded value, so the colour never contradicts the number', () => {
        // 2.94 displays as "2.9" and must stay green; 2.95 displays as "3.0"
        // and must already be yellow.
        expect(uvBand(2.94).id).toBe('low');
        expect(uvBand(2.95).id).toBe('moderate');
        expect(uvBand(5.95).id).toBe('high');
        expect(uvBand(7.95).id).toBe('veryHigh');
        expect(uvBand(10.95).id).toBe('extreme');
    });

    it('clamps a nonsensical negative reading into the lowest band', () => {
        expect(uvBand(-1).id).toBe('low');
    });

    it('gives every band a distinct fill and a distinct ink', () => {
        expect(new Set(UV_BANDS.map((b) => b.fill)).size).toBe(UV_BANDS.length);
        expect(new Set(UV_BANDS.map((b) => b.ink)).size).toBe(UV_BANDS.length);
    });

    it('washes harder as the reading climbs, and never past half', () => {
        const alphas = UV_BANDS.map((b) => b.alpha);
        expect(alphas).toEqual([...alphas].sort((a, b) => a - b));
        expect(Math.min(...alphas)).toBeGreaterThan(0);
        expect(Math.max(...alphas)).toBeLessThanOrEqual(0.5);
    });
});

describe('fetchUv', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    const respondWith = (body, ok = true) =>
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({ ok, status: ok ? 200 : 503, json: async () => body }),
        );

    /** Midnight in Montevideo on 18 Sep 2026, then 24 hours of a spring day. */
    const MIDNIGHT = 1789700400;
    const times = Array.from({ length: 24 }, (_, h) => MIDNIGHT + h * 3600);
    const values = [0, 0, 0, 0, 0, 0, 0, 0.1, 0.65, 1.9, 3.5, 5.05, 5.95, 5.8, 4.6, 2.9, 1.4];
    while (values.length < 24) values.push(0);

    it('returns the reading, the zone of the coordinate, and the day hour by hour', async () => {
        respondWith({
            timezone: 'America/Montevideo',
            current: { time: MIDNIGHT + 12 * 3600, uv_index: 4.2 },
            hourly: { time: times, uv_index: values },
        });

        const reading = await fetchUv(-34.9, -56.16);
        expect(reading.uv).toBe(4.2);
        expect(reading.timezone).toBe('America/Montevideo');
        expect(reading.hourly).toHaveLength(24);
        expect(reading.hourly[12]).toEqual({ time: MIDNIGHT + 12 * 3600, uv: 5.95 });
    });

    it('asks for today by the hour, in epoch seconds', async () => {
        respondWith({
            timezone: 'UTC',
            current: { time: 0, uv_index: 1 },
            hourly: { time: times, uv_index: values },
        });
        await fetchUv(0, 0);

        const url = new URL(fetch.mock.calls[0][0]);
        expect(url.searchParams.get('hourly')).toBe('uv_index');
        expect(url.searchParams.get('forecast_days')).toBe('1');
        expect(url.searchParams.get('timezone')).toBe('auto');
        expect(url.searchParams.get('timeformat')).toBe('unixtime');
    });

    it('rejects an HTTP failure', async () => {
        respondWith({}, false);
        await expect(fetchUv(0, 0)).rejects.toThrow('503');
    });

    it('rejects a 200 that carries no reading, rather than painting the map green', async () => {
        respondWith({
            timezone: 'UTC',
            current: { time: 0, uv_index: null },
            hourly: { time: times, uv_index: values },
        });
        await expect(fetchUv(0, 0)).rejects.toThrow('no reading');
    });

    it('keeps the reading when the hourly series is missing — the strip is the bonus', async () => {
        respondWith({ timezone: 'UTC', current: { time: 0, uv_index: 2.5 } });
        await expect(fetchUv(0, 0)).resolves.toMatchObject({ uv: 2.5, hourly: [] });
    });

    it('drops the whole series over one missing hour, rather than drawing it as zero', async () => {
        const holed = [...values];
        holed[15] = null;
        respondWith({
            timezone: 'UTC',
            current: { time: 0, uv_index: 2.5 },
            hourly: { time: times, uv_index: holed },
        });
        await expect(fetchUv(0, 0)).resolves.toMatchObject({ uv: 2.5, hourly: [] });
    });

    it('drops a series whose times and values do not line up', async () => {
        respondWith({
            timezone: 'UTC',
            current: { time: 0, uv_index: 2.5 },
            hourly: { time: times.slice(0, 23), uv_index: values },
        });
        await expect(fetchUv(0, 0)).resolves.toMatchObject({ hourly: [] });
    });

    it('clamps a negative hour into zero, like the reading', async () => {
        const dipped = [...values];
        dipped[3] = -0.2;
        respondWith({
            timezone: 'UTC',
            current: { time: 0, uv_index: 2.5 },
            hourly: { time: times, uv_index: dipped },
        });
        const reading = await fetchUv(0, 0);
        expect(reading.hourly[3].uv).toBe(0);
    });
});
