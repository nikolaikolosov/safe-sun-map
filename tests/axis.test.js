import { describe, expect, it } from 'vitest';

import { hourLabels, renderHourAxis, renderHourRow, scaleFraction } from '../src/axis.js';

describe('renderHourAxis', () => {
    const draw = () => {
        const target = document.createElement('div');
        renderHourAxis(target);
        return [...target.children];
    };

    it('marks every three hours, midnight to midnight', () => {
        expect(draw().map((tick) => tick.textContent)).toEqual([
            '00',
            '03',
            '06',
            '09',
            '12',
            '15',
            '18',
            '21',
            '24',
        ]);
    });

    it('places each tick by its real share of the day, so it lines up with the bars', () => {
        const lefts = draw().map((tick) => parseFloat(tick.style.left));
        expect(lefts).toEqual([0, 12.5, 25, 37.5, 50, 62.5, 75, 87.5, 100]);
    });

    it('redraws in place rather than appending', () => {
        const target = document.createElement('div');
        renderHourAxis(target);
        renderHourAxis(target);
        expect(target.children).toHaveLength(9);
    });
});

describe('scaleFraction', () => {
    const SCALE = { from: 1000, to: 1000 + 12 * 3600, times: [] };

    it('runs from 0 at the first hour to 1 at the end of the last', () => {
        expect(scaleFraction(SCALE, 1000)).toBe(0);
        expect(scaleFraction(SCALE, 1000 + 6 * 3600)).toBe(0.5);
        expect(scaleFraction(SCALE, 1000 + 12 * 3600)).toBe(1);
    });

    it('falls outside 0 to 1 off the scale, which is what hides a line', () => {
        expect(scaleFraction(SCALE, 999)).toBeLessThan(0);
        expect(scaleFraction(SCALE, 1000 + 13 * 3600)).toBeGreaterThan(1);
    });
});

describe('hourLabels', () => {
    it("writes each hour in the location's clock, not the device's", () => {
        // 10:00 UTC is 07:00 in Montevideo and 18:00 in Singapore.
        const tenUtc = Date.UTC(2026, 8, 26, 10) / 1000;
        expect(hourLabels([tenUtc], 'America/Montevideo', 'ru')).toEqual(['07']);
        expect(hourLabels([tenUtc], 'Asia/Singapore', 'en')).toEqual(['18']);
    });

    it('writes midnight as 00, not 24', () => {
        const midnightUtc = Date.UTC(2026, 8, 26) / 1000;
        expect(hourLabels([midnightUtc], 'UTC', 'en')).toEqual(['00']);
    });
});

describe('renderHourRow', () => {
    it('lays one label per hour in a row, replacing the ruler if one was there', () => {
        const target = document.createElement('div');
        renderHourAxis(target);
        renderHourRow(target, ['07', '08', '09']);
        expect(target.className).toBe('hour-row');
        expect([...target.children].map((el) => [el.className, el.textContent])).toEqual([
            ['hour-label', '07'],
            ['hour-label', '08'],
            ['hour-label', '09'],
        ]);
    });

    it('gives the ruler back its own class when the forecast goes', () => {
        const target = document.createElement('div');
        renderHourRow(target, ['07']);
        renderHourAxis(target);
        expect(target.className).toBe('hour-axis');
    });
});
