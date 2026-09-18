import { describe, expect, it } from 'vitest';

import { renderHourAxis } from '../src/axis.js';

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
