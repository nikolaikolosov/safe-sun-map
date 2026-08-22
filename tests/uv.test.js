import { describe, expect, it, vi, afterEach } from 'vitest';

import { UV_BANDS, fetchUv, formatUv, roundUv, uvBand } from '../src/uv.js';

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

    it('returns the reading and the zone of the coordinate', async () => {
        respondWith({
            timezone: 'America/Montevideo',
            current: { time: '2026-08-22T12:00', uv_index: 4.2 },
        });

        await expect(fetchUv(-34.9, -56.16)).resolves.toEqual({
            uv: 4.2,
            timezone: 'America/Montevideo',
            observedAt: '2026-08-22T12:00',
        });
    });

    it('rejects an HTTP failure', async () => {
        respondWith({}, false);
        await expect(fetchUv(0, 0)).rejects.toThrow('503');
    });

    it('rejects a 200 that carries no reading, rather than painting the map green', async () => {
        respondWith({ timezone: 'UTC', current: { time: '2026-08-22T12:00', uv_index: null } });
        await expect(fetchUv(0, 0)).rejects.toThrow('no reading');
    });
});
