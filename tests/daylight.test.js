import { describe, expect, it } from 'vitest';

import { localSegments, zoneOffsetMin } from '../src/daylight.js';
import { sunPhases } from '../src/sun.js';

const MIN_PER_DAY = 1440;

const on = (y, m, d) => new Date(y, m - 1, d, 12, 0);
const clock = (min) =>
    `${String(Math.floor(Math.round(min) / 60)).padStart(2, '0')}:` +
    `${String(Math.round(min) % 60).padStart(2, '0')}`;

/** The card's own pipeline: phases → local axis. */
const axis = (date, lat, lon, zone) =>
    localSegments(sunPhases(date, lat, lon).phases, zoneOffsetMin(date, zone));

const MONTEVIDEO = [-34.9011, -56.1645, 'America/Montevideo'];
const LONGYEARBYEN = [78.2232, 15.6267, 'Arctic/Longyearbyen'];
// Kashgar: the far west of China, kept on Beijing time. Solar noon lands
// around 15:00 local, which is what pushes the phase run off the axis.
const KASHGAR = [39.4704, 75.9898, 'Asia/Shanghai'];

describe('zoneOffsetMin', () => {
    it('reads a fixed offset', () => {
        expect(zoneOffsetMin(new Date(Date.UTC(2026, 7, 31, 12)), 'America/Montevideo')).toBe(-180);
        expect(zoneOffsetMin(new Date(Date.UTC(2026, 7, 31, 12)), 'UTC')).toBe(0);
    });

    it('follows a zone across its own DST change', () => {
        const winter = zoneOffsetMin(new Date(Date.UTC(2026, 0, 15, 12)), 'Europe/Madrid');
        const summer = zoneOffsetMin(new Date(Date.UTC(2026, 6, 15, 12)), 'Europe/Madrid');
        expect(winter).toBe(60);
        expect(summer).toBe(120);
    });
});

describe('localSegments', () => {
    it('covers the axis exactly once, in order, with no gaps', () => {
        const segments = axis(on(2026, 8, 31), ...MONTEVIDEO);
        expect(segments[0].startMin).toBe(0);
        expect(segments[segments.length - 1].endMin).toBe(MIN_PER_DAY);
        for (let i = 1; i < segments.length; i++) {
            expect(segments[i].startMin).toBeCloseTo(segments[i - 1].endMin, 6);
        }
    });

    it('lays out the full twilight ladder for a mid-latitude day', () => {
        const segments = axis(on(2026, 8, 31), ...MONTEVIDEO);
        expect(segments.map((s) => s.id)).toEqual([
            'night',
            'astronomical',
            'nautical',
            'civil',
            'day',
            'civil',
            'nautical',
            'astronomical',
            'night',
        ]);
    });

    it('agrees with the published Montevideo times for the day', () => {
        // timeanddate.com for 31 Aug 2026: night→05:41, astro→06:10,
        // nautical→06:39, civil→07:05, daylight→18:25, and back down.
        const segments = axis(on(2026, 8, 31), ...MONTEVIDEO);
        const day = segments.find((s) => s.id === 'day');
        expect(clock(day.startMin)).toBe('07:05');
        expect(clock(day.endMin)).toBe('18:25');

        const bounds = segments.slice(0, 4).map((s) => clock(s.endMin));
        expect(bounds).toEqual(['05:41', '06:10', '06:39', '07:05']);
    });

    it('never merges the night before dawn with the night after dusk', () => {
        // They are the same phase and both touch an edge of the axis, but they
        // are different rows on the card and must not collapse into one.
        const nights = axis(on(2026, 8, 31), ...MONTEVIDEO).filter((s) => s.id === 'night');
        expect(nights).toHaveLength(2);
        expect(nights[0].startMin).toBe(0);
        expect(nights[1].endMin).toBe(MIN_PER_DAY);
    });

    it('still covers the axis where solar noon is hours from local noon', () => {
        // The phase run hangs off one end of the day and leaves the other bare;
        // the wrap is what fills it back in.
        const segments = axis(on(2026, 8, 31), ...KASHGAR);
        expect(segments[0].startMin).toBe(0);
        expect(segments[segments.length - 1].endMin).toBe(MIN_PER_DAY);
        for (let i = 1; i < segments.length; i++) {
            expect(segments[i].startMin).toBeCloseTo(segments[i - 1].endMin, 6);
        }
        // Kashgar's day genuinely runs late on the clock it keeps.
        const day = segments.find((s) => s.id === 'day');
        expect(day.startMin).toBeGreaterThan(7 * 60);
        expect(day.endMin).toBeGreaterThan(20 * 60);
    });

    it('fills the whole bar with daylight under the midnight sun', () => {
        const segments = axis(on(2026, 6, 21), ...LONGYEARBYEN);
        expect(segments).toHaveLength(1);
        expect(segments[0].id).toBe('day');
        expect(segments[0].startMin).toBe(0);
        expect(segments[0].endMin).toBe(MIN_PER_DAY);
    });

    it('tops the polar-night bar out at whatever twilight the sun reaches', () => {
        // Longyearbyen on the solstice: the sun peaks near −11.7°, so the day
        // climbs to nautical twilight and no further — no daylight, no civil.
        const segments = axis(on(2026, 12, 21), ...LONGYEARBYEN);
        const ids = segments.map((s) => s.id);
        expect(ids).toEqual(['night', 'astronomical', 'nautical', 'astronomical', 'night']);
        expect(ids).not.toContain('civil');
        expect(ids).not.toContain('day');
    });

    it('fills the whole bar with night where the sun never even nears the horizon', () => {
        // The pole on the solstice: peak altitude about −23°, under every
        // twilight threshold there is.
        const segments = axis(on(2026, 12, 21), 90, 0, 'UTC');
        expect(segments).toHaveLength(1);
        expect(segments[0].id).toBe('night');
        expect(segments[0].endMin - segments[0].startMin).toBe(MIN_PER_DAY);
    });

    it('shows a polar night that has civil light as a band around noon', () => {
        const segments = axis(on(2026, 2, 5), ...LONGYEARBYEN);
        expect(segments.map((s) => s.id)).toContain('civil');
        expect(segments.some((s) => s.id === 'day')).toBe(false);
        // Symmetric ladder up to civil and back down, bracketed by night.
        expect(segments[0].id).toBe('night');
        expect(segments[segments.length - 1].id).toBe('night');
    });

    it('drops phases too short to show a distinct minute', () => {
        for (const date of [on(2026, 6, 21), on(2026, 12, 21), on(2026, 3, 20)]) {
            for (const segment of axis(date, ...MONTEVIDEO)) {
                expect(Math.round(segment.endMin)).toBeGreaterThan(Math.round(segment.startMin));
            }
        }
    });
});
