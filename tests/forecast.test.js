import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { barHeightPct, hourAt, peakOf, refreshForecast, renderForecast } from '../src/forecast.js';
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

    it('never runs off the top', () => {
        expect(barHeightPct(14, 11)).toBe(100);
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
            '<div id="forecast-axis"></div>',
            '</div>',
        ].join('');
    });

    afterEach(() => {
        vi.useRealTimers();
        setLang('en', { persist: false });
    });

    const block = () => document.getElementById('forecast');
    const bars = () => [...document.querySelectorAll('.forecast-bar')];
    const line = () => document.querySelector('.now-line');

    /** Pins the device clock to a Montevideo wall-clock time and draws. */
    const drawAt = (h, m = 0, lang = 'en') => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(at(h, m) * 1000));
        setLang(lang, { persist: false });
        renderForecast(DAY, 'America/Montevideo');
    };

    it('draws one bar per hour, in the band colour of that hour', () => {
        drawAt(12);
        expect(block().hidden).toBe(false);
        expect(bars()).toHaveLength(24);

        const fillOf = (id) => UV_BANDS.find((b) => b.id === id).fill;
        const rgb = (hex) => {
            const n = parseInt(hex.slice(1), 16);
            return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`;
        };
        // 12:00 is 5.95, which rounds to 6.0 and is therefore HIGH — the bar is
        // classified from the rounded value, like the wash, so it can never
        // be a colour its own label contradicts. 09:00 is 1.9 → low.
        expect(bars()[12].style.backgroundColor).toBe(rgb(fillOf('high')));
        expect(bars()[9].style.backgroundColor).toBe(rgb(fillOf('low')));
    });

    it('draws heights against a fixed ceiling of 11, so a day reads the same as the next', () => {
        drawAt(12);
        expect(bars()[12].style.height).toBe(`${(5.95 / 11) * 100}%`);
        expect(bars()[2].style.height).toBe('0%');
    });

    it("labels every bar with its hour in the LOCATION's clock, its value and its band", () => {
        drawAt(12);
        expect(bars()[12].title).toBe('12:00 · 6.0 · High');
        expect(bars()[0].title).toBe('00:00 · 0.0 · Low');
    });

    it('names the peak next to the title, in the language in force', () => {
        drawAt(12, 0, 'ru');
        expect(document.getElementById('forecast-peak').textContent).toBe('пик 6,0 · 12:00');
        expect(bars()[12].title).toBe('12:00 · 6,0 · Высокий');
    });

    it('gives the chart one sentence for a screen reader', () => {
        drawAt(12);
        expect(document.getElementById('forecast-chart').getAttribute('aria-label')).toBe(
            'Today by hour: peak 6.0 · 12:00',
        );
    });

    it('dims the hours that have passed and none that have not', () => {
        drawAt(14, 30);
        const past = bars().map((b) => b.classList.contains('is-past'));
        expect(past.slice(0, 14).every(Boolean)).toBe(true);
        expect(past.slice(14).some(Boolean)).toBe(false);
    });

    it('puts the line at "now", to the minute', () => {
        drawAt(14, 30);
        expect(line().hidden).toBe(false);
        expect(line().style.left).toBe(`${(14.5 / 24) * 100}%`);
    });

    it('moves the line on the tick without redrawing a bar', () => {
        drawAt(14, 30);
        const before = bars();

        vi.setSystemTime(new Date(at(15, 15) * 1000));
        refreshForecast(DAY);

        expect(bars()).toEqual(before);
        expect(line().style.left).toBe(`${(15.25 / 24) * 100}%`);
        expect(bars()[14].classList.contains('is-past')).toBe(true);
        expect(bars()[15].classList.contains('is-past')).toBe(false);
    });

    it('hides the line, and dims everything, once the series is yesterday', () => {
        // Ten past midnight, before the fetch that brings the new day.
        drawAt(24, 10);
        expect(line().hidden).toBe(true);
        expect(bars().every((b) => b.classList.contains('is-past'))).toBe(true);
    });

    it('hides the strip when there is no series, leaving the reading to itself', () => {
        drawAt(12);
        renderForecast([], 'America/Montevideo');
        expect(block().hidden).toBe(true);
    });

    it('names no peak on a day without sun', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(at(12) * 1000));
        renderForecast(
            DAY.map((h) => ({ ...h, uv: 0 })),
            'America/Montevideo',
        );
        expect(document.getElementById('forecast-peak').textContent).toBe('');
        expect(document.getElementById('forecast-chart').getAttribute('aria-label')).toBe(
            'Today by hour',
        );
    });
});
