import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import {
    alternateQuiet,
    barHeightPct,
    fitForecast,
    hourAt,
    peakOf,
    refreshForecast,
    renderForecast,
    sunlitWindow,
} from '../src/forecast.js';
import { UV_BANDS } from '../src/uv.js';
import { setLang } from '../src/i18n.js';

/** Midnight in Montevideo (UTC-3) on 18 Sep 2026, then the day as Open-Meteo gave it. */
const MIDNIGHT = 1789700400;
const VALUES = [0, 0, 0, 0, 0, 0, 0, 0.1, 0.65, 1.9, 3.5, 5.05, 5.95, 5.8, 4.6, 2.9, 1.4, 0.45];
while (VALUES.length < 24) VALUES.push(0);
const DAY = VALUES.map((uv, h) => ({ time: MIDNIGHT + h * 3600, uv }));

/** Epoch seconds of a Montevideo wall-clock time on that day. */
const at = (h, m = 0) => MIDNIGHT + h * 3600 + m * 60;

describe('hourAt', () => {
    it('finds the hour an instant falls in', () => {
        expect(hourAt(DAY, at(12))).toBe(12);
        expect(hourAt(DAY, at(12, 59))).toBe(12);
        expect(hourAt(DAY, at(13))).toBe(13);
    });

    it('covers the first and the last minute of the day', () => {
        expect(hourAt(DAY, at(0))).toBe(0);
        expect(hourAt(DAY, at(23, 59))).toBe(23);
    });

    it('has no hour for an instant the series does not cover', () => {
        // Tomorrow, before the fetch that will bring tomorrow.
        expect(hourAt(DAY, at(24, 5))).toBe(-1);
        expect(hourAt(DAY, at(-1))).toBe(-1);
        expect(hourAt([], at(12))).toBe(-1);
    });
});

describe('peakOf', () => {
    it('names the highest hour', () => {
        expect(peakOf(DAY)).toEqual({ time: at(12), uv: 5.95 });
    });

    it('takes the first of a plateau, so it is named by when it starts', () => {
        const flat = [
            { time: at(11), uv: 4 },
            { time: at(12), uv: 4 },
            { time: at(13), uv: 3 },
        ];
        expect(peakOf(flat).time).toBe(at(11));
    });

    it('has nothing to say about an empty series', () => {
        expect(peakOf([])).toBeNull();
    });
});

describe('barHeightPct', () => {
    it('fills the chart at the scale value and scales linearly under it', () => {
        expect(barHeightPct(11, 11)).toBe(100);
        expect(barHeightPct(5.5, 11)).toBe(50);
    });

    it('keeps a whisper of sun visible, and a dead night invisible', () => {
        expect(barHeightPct(0.1, 11)).toBe(5);
        expect(barHeightPct(0, 11)).toBe(0);
    });

    it('draws no bar for an hour that rounds to 0.0, so no bar can be labelled "0.0"', () => {
        expect(barHeightPct(0.04, 11)).toBe(0);
        // 0.05 rounds up to 0.1, and is drawn.
        expect(barHeightPct(0.05, 11)).toBe(5);
    });

    it('never runs off the top', () => {
        expect(barHeightPct(14, 11)).toBe(100);
    });
});

describe('sunlitWindow', () => {
    it('spans the first to the last hour with a value above 0.0', () => {
        // The fixture's sun runs 07:00–17:00.
        expect(sunlitWindow(DAY)).toEqual({ start: 7, end: 17 });
    });

    it('decides on the rounded value, like the bars and the numbers', () => {
        // 0.04 is "0.0" wherever it is written, so it does not open the window.
        const edged = DAY.map((h, i) => (i === 6 || i === 18 ? { ...h, uv: 0.04 } : h));
        expect(sunlitWindow(edged)).toEqual({ start: 7, end: 17 });
    });

    it('keeps an hour inside the window even if it rounds to zero', () => {
        const dipped = [0, 1, 0, 2, 0].map((uv, i) => ({ time: i, uv }));
        expect(sunlitWindow(dipped)).toEqual({ start: 1, end: 3 });
    });

    it('has no window for a day without sun', () => {
        expect(sunlitWindow(DAY.map((h) => ({ ...h, uv: 0 })))).toBeNull();
        expect(sunlitWindow([])).toBeNull();
    });
});

describe('alternateQuiet', () => {
    it('quiets every other column, counted out from the one to keep', () => {
        expect(alternateQuiet(5, 2)).toEqual([false, true, false, true, false]);
        expect(alternateQuiet(4, 1)).toEqual([true, false, true, false]);
    });

    it('never quiets the column it is told to keep', () => {
        for (let keep = 0; keep < 24; keep += 1) {
            expect(alternateQuiet(24, keep)[keep]).toBe(false);
        }
    });
});

describe('the strip', () => {
    // The strip's own elements, mounted once: `renderForecast` caches them on
    // first use, so a fresh body per test would leave it drawing into orphans.
    beforeAll(() => {
        document.body.innerHTML = [
            '<div id="forecast" hidden>',
            '<p id="forecast-peak"></p>',
            '<div id="forecast-chart"></div>',
            '<div id="forecast-times"></div>',
            '</div>',
        ].join('');
    });

    afterEach(() => {
        vi.useRealTimers();
        setLang('en', { persist: false });
    });

    const block = () => document.getElementById('forecast');
    const columns = () => [...document.querySelectorAll('.forecast-hour')];
    const times = () => [...document.querySelectorAll('.forecast-time')];
    const values = () => [...document.querySelectorAll('.forecast-value')];
    const line = () => document.querySelector('.now-line');
    /** The column for a wall-clock hour, found the way a reader finds it: by its time. */
    const column = (hh) => columns().find((c) => c.title.startsWith(`${hh}:00 `));
    const barOf = (hh) => column(hh).querySelector('.forecast-bar');
    const valueOf = (hh) => column(hh).querySelector('.forecast-value');

    /** Pins the device clock to a Montevideo wall-clock time and draws. */
    const drawAt = (h, m = 0, lang = 'en', day = DAY) => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(at(h, m) * 1000));
        setLang(lang, { persist: false });
        renderForecast(day, 'America/Montevideo');
    };

    it('draws a column for each sunlit hour, and leaves the night off', () => {
        drawAt(12);
        expect(block().hidden).toBe(false);
        expect(columns()).toHaveLength(11);
        expect(columns()[0].title).toBe('07:00 · 0.1 · Low');
        expect(columns()[10].title).toBe('17:00 · 0.5 · Low');
    });

    it("writes each bar's own hour under it, in the location's clock", () => {
        drawAt(12);
        expect(times().map((el) => el.textContent)).toEqual([
            '07',
            '08',
            '09',
            '10',
            '11',
            '12',
            '13',
            '14',
            '15',
            '16',
            '17',
        ]);
    });

    it('colours each bar by its band', () => {
        drawAt(12);
        const fillOf = (id) => UV_BANDS.find((b) => b.id === id).fill;
        const rgb = (hex) => {
            const n = parseInt(hex.slice(1), 16);
            return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`;
        };
        // 12:00 is 5.95, which rounds to 6.0 and is therefore HIGH — the bar is
        // classified from the rounded value, like the wash, so it can never
        // be a colour its own label contradicts. 09:00 is 1.9 → low.
        expect(barOf('12').style.backgroundColor).toBe(rgb(fillOf('high')));
        expect(barOf('09').style.backgroundColor).toBe(rgb(fillOf('low')));
    });

    it('draws heights against a fixed ceiling of 11, so a day reads the same as the next', () => {
        drawAt(12);
        expect(barOf('12').style.height).toBe(`${(5.95 / 11) * 100}%`);
    });

    it("labels every hour with its time in the LOCATION's clock, its value and its band", () => {
        drawAt(12);
        expect(column('12').title).toBe('12:00 · 6.0 · High');
    });

    it('names the peak next to the title, in the language in force', () => {
        drawAt(12, 0, 'ru');
        expect(document.getElementById('forecast-peak').textContent).toBe('пик 6,0 · 12:00');
        expect(column('12').title).toBe('12:00 · 6,0 · Высокий');
    });

    it('gives the chart one sentence for a screen reader', () => {
        drawAt(12);
        expect(document.getElementById('forecast-chart').getAttribute('aria-label')).toBe(
            'Today by hour: peak 6.0 · 12:00',
        );
    });

    it('marks the peak, so fitting can keep its number', () => {
        drawAt(12);
        const peaks = columns().filter((c) => c.classList.contains('is-peak'));
        expect(peaks).toEqual([column('12')]);
    });

    it("writes each hour's value over its bar", () => {
        drawAt(8);
        expect(values().map((v) => v.textContent)).toEqual([
            '0.1',
            '0.7',
            '1.9',
            '3.5',
            '5.1',
            '6.0',
            '5.8',
            '4.6',
            '2.9',
            '1.4',
            '0.5',
        ]);
        expect(valueOf('12').textContent).toBe('6.0');
        expect(valueOf('15').textContent).toBe('2.9');
    });

    it('stands each value on the tip of its own bar', () => {
        drawAt(8);
        for (const c of columns()) {
            expect(c.querySelector('.forecast-value').style.bottom).toBe(
                c.querySelector('.forecast-bar').style.height,
            );
        }
    });

    it('agrees with the hover label, to the digit', () => {
        drawAt(8);
        for (const c of columns()) {
            expect(c.title).toContain(` ${c.querySelector('.forecast-value').textContent} `);
        }
    });

    it('writes the values with the separator of the language in force', () => {
        drawAt(8, 0, 'ru');
        expect(valueOf('12').textContent).toBe('6,0');
        expect(valueOf('09').textContent).toBe('1,9');
        drawAt(8, 0, 'es');
        expect(valueOf('13').textContent).toBe('5,8');
    });

    it('prints no "0.0" anywhere, even beside an hour that is not quite zero', () => {
        const edged = DAY.map((h, i) => (i === 6 || i === 18 ? { ...h, uv: 0.04 } : h));
        drawAt(8, 0, 'en', edged);
        expect(columns()).toHaveLength(11);
        expect(values().some((v) => v.textContent === '0.0')).toBe(false);
    });

    it('dims the hours that have passed — bar, value and hour — and none that have not', () => {
        drawAt(14, 30);
        const past = columns().map((c) => c.classList.contains('is-past'));
        const pastTimes = times().map((el) => el.classList.contains('is-past'));
        // 07:00–13:00 are gone; 14:00 is under way.
        expect(past).toEqual([
            true,
            true,
            true,
            true,
            true,
            true,
            true,
            false,
            false,
            false,
            false,
        ]);
        expect(pastTimes).toEqual(past);
    });

    it('puts the line at "now", to the minute, on the sunlit hours\' own scale', () => {
        drawAt(14, 30);
        expect(line().hidden).toBe(false);
        // 14:30 is seven and a half hours into an eleven-hour strip.
        expect(line().style.left).toBe(`${(7.5 / 11) * 100}%`);
    });

    it('moves the line on the tick without redrawing a bar', () => {
        drawAt(14, 30);
        const before = columns();

        vi.setSystemTime(new Date(at(15, 15) * 1000));
        refreshForecast(DAY);

        expect(columns()).toEqual(before);
        expect(line().style.left).toBe(`${(8.25 / 11) * 100}%`);
        expect(column('14').classList.contains('is-past')).toBe(true);
        expect(column('15').classList.contains('is-past')).toBe(false);
    });

    it('hides the line before the sun and dims nothing: the whole day is ahead', () => {
        drawAt(5, 30);
        expect(line().hidden).toBe(true);
        expect(columns().some((c) => c.classList.contains('is-past'))).toBe(false);
    });

    it('hides the line after the sun and dims everything: the day is done', () => {
        drawAt(19, 30);
        expect(line().hidden).toBe(true);
        expect(columns().every((c) => c.classList.contains('is-past'))).toBe(true);
    });

    it('does the same once the series is yesterday, before the next fetch', () => {
        drawAt(24, 10);
        expect(line().hidden).toBe(true);
        expect(columns().every((c) => c.classList.contains('is-past'))).toBe(true);
    });

    it('hides the strip when there is no series, leaving the reading to itself', () => {
        drawAt(12);
        renderForecast([], 'America/Montevideo');
        expect(block().hidden).toBe(true);
    });

    it('hides the strip on a day without sun, rather than drawing an empty frame', () => {
        drawAt(
            12,
            0,
            'en',
            DAY.map((h) => ({ ...h, uv: 0 })),
        );
        expect(block().hidden).toBe(true);
    });

    it('leaves the values alone when there is no layout to measure', () => {
        drawAt(12);
        fitForecast();
        expect(document.querySelector('.is-compact, .is-quiet')).toBeNull();
    });
});
