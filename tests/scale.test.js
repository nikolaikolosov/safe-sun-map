import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { forecastScale, refreshForecast, renderForecast } from '../src/forecast.js';
import { refreshRemaining, renderDaylight } from '../src/daylight.js';

/**
 * The two strips together, as the page has them: the UV strip, and the
 * daylight bar drawn against the scale the UV strip hands over. What this file
 * holds them to is the promise of that scale — same hours, same labels, and
 * the two lines at "now" on the same spot.
 */

/** 26 Sep 2026 in Montevideo (UTC-3), as Open-Meteo gave it: sun 07:00–18:00 by the hour. */
const MIDNIGHT = Date.UTC(2026, 8, 26, 3) / 1000;
const UV = [0, 0, 0, 0, 0, 0, 0, 0.2, 0.8, 2.3, 4.3, 6.3, 7.5, 7.4, 6.2, 4.1, 2.2, 0.8, 0.1];
while (UV.length < 24) UV.push(0);
const DAY = UV.map((uv, h) => ({ time: MIDNIGHT + h * 3600, uv }));

const POSITION = { lat: -34.9011, lon: -56.1645 };
const ZONE = 'America/Montevideo';

describe('the two strips', () => {
    // Both cards' elements, mounted once: each module caches its own on first use.
    beforeAll(() => {
        document.body.innerHTML = [
            '<div id="forecast" hidden>',
            '<p id="forecast-peak"></p>',
            '<div id="forecast-chart"></div>',
            '<div id="forecast-times"></div>',
            '</div>',
            '<section id="daylight" hidden>',
            '<p id="daylight-place"></p>',
            '<p id="daylight-summary"></p>',
            '<div class="daylight-track">',
            '<div id="daylight-bar"></div>',
            '<span id="daylight-now" class="now-line" hidden></span>',
            '</div>',
            '<div id="daylight-axis"></div>',
            '<details class="daylight-details">',
            '<summary class="daylight-toggle"></summary>',
            '<ul id="daylight-phases"></ul>',
            '</details>',
            '</section>',
        ].join('');
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    /** Both cards drawn at a Montevideo wall-clock time, the way `render()` draws them. */
    const drawAt = (h, m = 0) => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date((MIDNIGHT + h * 3600 + m * 60) * 1000));
        renderForecast(DAY, ZONE);
        renderDaylight(POSITION, ZONE, forecastScale(DAY));
    };

    const uvLine = () => document.querySelector('#forecast-chart .now-line');
    const dayLine = () => document.getElementById('daylight-now');
    const labelsOf = (id) =>
        [...document.querySelectorAll(`#${id} .hour-label`)].map((el) => el.textContent);

    it('label the same hours, the sunlit ones', () => {
        drawAt(12);
        expect(labelsOf('forecast-times')).toEqual([
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
            '18',
        ]);
        expect(labelsOf('daylight-axis')).toEqual(labelsOf('forecast-times'));
    });

    it.each([
        [7, 0],
        [9, 41],
        [12, 0],
        [14, 30],
        [18, 59],
    ])('put their lines at "now" on the same spot at %i:%i', (h, m) => {
        drawAt(h, m);
        expect(uvLine().hidden).toBe(false);
        expect(dayLine().hidden).toBe(false);
        expect(dayLine().style.left).toBe(uvLine().style.left);
    });

    it('keep the lines together as the clock ticks', () => {
        drawAt(10);
        vi.setSystemTime(new Date((MIDNIGHT + 16 * 3600 + 20 * 60) * 1000));
        refreshForecast(DAY);
        refreshRemaining(POSITION, ZONE);
        expect(parseFloat(uvLine().style.left)).toBeCloseTo(((9 + 20 / 60) / 12) * 100, 9);
        expect(dayLine().style.left).toBe(uvLine().style.left);
    });

    it('hide both lines before the sunlit hours and after them', () => {
        for (const [h, m] of [
            [5, 30],
            [20, 0],
        ]) {
            drawAt(h, m);
            expect(uvLine().hidden).toBe(true);
            expect(dayLine().hidden).toBe(true);
        }
    });
});
