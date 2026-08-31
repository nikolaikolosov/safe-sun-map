import { describe, expect, it } from 'vitest';

import { sunTimes } from '../src/sun.js';

const HOUR = 3600000;
const MIN = 60000;

// Local-date constructor: sunTimes reads the device's calendar date, so tests
// build Dates from local fields and assert against absolute UTC instants —
// the same numbers on any CI timezone.
const on = (y, m, d) => new Date(y, m - 1, d, 12, 0);

const MONTEVIDEO = { lat: -34.9011, lon: -56.1645 };
const MADRID = { lat: 40.4168, lon: -3.7038 };
const REYKJAVIK = { lat: 64.1466, lon: -21.9426 };
const LONGYEARBYEN = { lat: 78.2232, lon: 15.6267 };
const ARKHANGELSK = { lat: 64.5401, lon: 40.5433 };

describe('sunTimes', () => {
    it('lands on the published times for Montevideo in late winter', () => {
        const sun = sunTimes(on(2026, 8, 26), MONTEVIDEO.lat, MONTEVIDEO.lon);
        // Sunrise ~07:05 local (UTC-3) → ~10:05 UTC; a ±15 min window keeps
        // the test about the algorithm, not about arc-second astronomy.
        const sunriseUtc = Date.UTC(2026, 7, 26, 10, 5);
        const sunsetUtc = Date.UTC(2026, 7, 26, 21, 20); // ~18:20 local
        expect(Math.abs(sun.sunrise - sunriseUtc)).toBeLessThan(15 * MIN);
        expect(Math.abs(sun.sunset - sunsetUtc)).toBeLessThan(15 * MIN);
        expect(sun.polar).toBeNull();
    });

    it('orders the day: dawn, sunrise, sunset, dusk', () => {
        const sun = sunTimes(on(2026, 8, 26), MADRID.lat, MADRID.lon);
        expect(sun.dawn < sun.sunrise).toBe(true);
        expect(sun.sunrise < sun.sunset).toBe(true);
        expect(sun.sunset < sun.dusk).toBe(true);
    });

    it('gives the equator its almost-exactly-twelve-hour day at the equinox', () => {
        const sun = sunTimes(on(2026, 3, 20), 0, 0);
        // Slightly OVER 12h — refraction and the disc's radius stretch the day.
        expect(sun.daylightMs).toBeGreaterThan(12 * HOUR);
        expect(sun.daylightMs).toBeLessThan(12 * HOUR + 20 * MIN);
        expect(sun.daylightMs).toBe(sun.sunset - sun.sunrise);
    });

    it('gives a mid-latitude city a half-hour-ish civil twilight', () => {
        const sun = sunTimes(on(2026, 8, 26), MADRID.lat, MADRID.lon);
        expect(sun.twilightMs).toBeGreaterThan(20 * MIN);
        expect(sun.twilightMs).toBeLessThan(45 * MIN);
        expect(sun.twilightMs).toBe(sun.sunrise - sun.dawn);
    });

    it('stretches and crushes the Reykjavík day across the year', () => {
        const june = sunTimes(on(2026, 6, 21), REYKJAVIK.lat, REYKJAVIK.lon);
        expect(june.daylightMs).toBeGreaterThan(20 * HOUR);
        expect(june.polar).toBeNull();

        const december = sunTimes(on(2026, 12, 21), REYKJAVIK.lat, REYKJAVIK.lon);
        expect(december.daylightMs).toBeGreaterThan(3 * HOUR);
        expect(december.daylightMs).toBeLessThan(5 * HOUR);
    });

    it('declares the polar day: sun up around the clock, no events, no twilight', () => {
        const sun = sunTimes(on(2026, 6, 21), LONGYEARBYEN.lat, LONGYEARBYEN.lon);
        expect(sun.polar).toBe('day');
        expect(sun.sunrise).toBeNull();
        expect(sun.sunset).toBeNull();
        expect(sun.daylightMs).toBe(24 * HOUR);
        expect(sun.twilightMs).toBeNull();
    });

    it('declares the deep polar night: no sun, no civil light at all', () => {
        const sun = sunTimes(on(2026, 12, 21), LONGYEARBYEN.lat, LONGYEARBYEN.lon);
        expect(sun.polar).toBe('night');
        expect(sun.sunrise).toBeNull();
        expect(sun.daylightMs).toBe(0);
        // Midwinter at 78°N the sun peaks below -6°: not even civil twilight.
        expect(sun.twilightMs).toBeNull();
    });

    it('finds the midday glow of a late polar night', () => {
        // Early February at 78°N: the sun still never rises, but it gets close
        // enough for a stretch of civil twilight around noon.
        const sun = sunTimes(on(2026, 2, 5), LONGYEARBYEN.lat, LONGYEARBYEN.lon);
        expect(sun.polar).toBe('night');
        expect(sun.sunrise).toBeNull();
        expect(sun.dawn).not.toBeNull();
        expect(sun.dusk).not.toBeNull();
        expect(sun.twilightMs).toBeGreaterThan(0);
        expect(sun.twilightMs).toBe(sun.dusk - sun.dawn);
    });

    it('reports white nights as a day whose twilight has no length', () => {
        // Arkhangelsk at midsummer: the sun sets, but the sky never leaves
        // civil twilight — dusk and dawn do not exist as moments.
        const sun = sunTimes(on(2026, 6, 21), ARKHANGELSK.lat, ARKHANGELSK.lon);
        expect(sun.polar).toBeNull();
        expect(sun.sunrise).not.toBeNull();
        expect(sun.sunset).not.toBeNull();
        expect(sun.daylightMs).toBeGreaterThan(21 * HOUR);
        expect(sun.dawn).toBeNull();
        expect(sun.twilightMs).toBeNull();
    });

    it('answers for the device-clock calendar date, whatever the hour', () => {
        const lateEvening = sunTimes(new Date(2026, 7, 26, 23, 59), MONTEVIDEO.lat, MONTEVIDEO.lon);
        const earlyMorning = sunTimes(new Date(2026, 7, 26, 0, 1), MONTEVIDEO.lat, MONTEVIDEO.lon);
        expect(lateEvening.sunrise.getTime()).toBe(earlyMorning.sunrise.getTime());
        expect(lateEvening.sunset.getTime()).toBe(earlyMorning.sunset.getTime());
    });
});
