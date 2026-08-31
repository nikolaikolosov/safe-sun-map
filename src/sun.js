/**
 * Sunrise, sunset and civil twilight, computed on the device.
 *
 * NOAA's solar-position algorithm (the one behind their online calculator):
 * minute-level accuracy for the latitudes people live at, degrading gracefully
 * towards the poles, where the answers become "polar day" and "polar night"
 * rather than times anyway. Pure arithmetic — no network call, nothing to go
 * stale, and the numbers roll over at midnight without asking a server.
 *
 * The calendar date is taken from the Date's LOCAL fields — the device clock,
 * which is what the product asks for. The returned instants are absolute
 * (`Date`s); the caller decides which timezone to display them in.
 */

const DEG = Math.PI / 180;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The sun's centre at sunrise/sunset: 16′ for the solar disc's radius plus 34′
 * of atmospheric refraction. The moment the top edge touches the horizon.
 */
const SUN_ALTITUDE_DEG = -0.833;

/** Civil twilight ends with the sun 6° down — the "too dark to read" line. */
const CIVIL_ALTITUDE_DEG = -6;

/**
 * Julian day number of a calendar date. The number itself corresponds to noon
 * UTC of that date, which is exactly the reference NOAA's coefficients want.
 *
 * @param {number} year
 * @param {number} month - 1-based
 * @param {number} day
 * @returns {number}
 */
function julianDayNumber(year, month, day) {
    const a = Math.floor((14 - month) / 12);
    const y = year + 4800 - a;
    const m = month + 12 * a - 3;
    return (
        day +
        Math.floor((153 * m + 2) / 5) +
        365 * y +
        Math.floor(y / 4) -
        Math.floor(y / 100) +
        Math.floor(y / 400) -
        32045
    );
}

/**
 * Solar declination and the equation of time for a date (NOAA, via Meeus).
 * Evaluated once at noon UTC — the sub-minute drift across the day is beneath
 * the display's resolution.
 *
 * @param {number} jdn
 * @returns {{declinationDeg: number, eqTimeMin: number}}
 */
function solarParameters(jdn) {
    const T = (jdn - 2451545) / 36525;

    const meanLong = (280.46646 + T * (36000.76983 + 0.0003032 * T)) % 360;
    const meanAnom = 357.52911 + T * (35999.05029 - 0.0001537 * T);
    const eccentricity = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);

    const centre =
        Math.sin(meanAnom * DEG) * (1.914602 - T * (0.004817 + 0.000014 * T)) +
        Math.sin(2 * meanAnom * DEG) * (0.019993 - 0.000101 * T) +
        Math.sin(3 * meanAnom * DEG) * 0.000289;

    const omega = 125.04 - 1934.136 * T;
    const apparentLong = meanLong + centre - 0.00569 - 0.00478 * Math.sin(omega * DEG);

    const obliquity =
        23 +
        (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60 +
        0.00256 * Math.cos(omega * DEG);

    const declinationDeg =
        Math.asin(Math.sin(obliquity * DEG) * Math.sin(apparentLong * DEG)) / DEG;

    const y = Math.tan((obliquity / 2) * DEG) ** 2;
    const eqTimeMin =
        (4 / DEG) *
        (y * Math.sin(2 * meanLong * DEG) -
            2 * eccentricity * Math.sin(meanAnom * DEG) +
            4 * eccentricity * y * Math.sin(meanAnom * DEG) * Math.cos(2 * meanLong * DEG) -
            0.5 * y * y * Math.sin(4 * meanLong * DEG) -
            1.25 * eccentricity * eccentricity * Math.sin(2 * meanAnom * DEG));

    return { declinationDeg, eqTimeMin };
}

/**
 * Half the sun's arc above `altitudeDeg`, in degrees of hour angle.
 *
 * @returns {number|null|Infinity} `null` when the sun never gets that high
 *   today, `Infinity` when it never gets that low.
 */
function hourAngleDeg(latDeg, declinationDeg, altitudeDeg) {
    const cosHa =
        (Math.sin(altitudeDeg * DEG) - Math.sin(latDeg * DEG) * Math.sin(declinationDeg * DEG)) /
        (Math.cos(latDeg * DEG) * Math.cos(declinationDeg * DEG));
    if (cosHa > 1) return null;
    if (cosHa < -1) return Infinity;
    return Math.acos(cosHa) / DEG;
}

/**
 * The sun's day at a coordinate, for the calendar date the device says it is.
 *
 * `twilightMs` is the length of ONE civil twilight — dawn to sunrise; the
 * evening one is its mirror. In a polar night that still gets civil light it
 * becomes the length of that midday glow instead, and where the sky never
 * leaves twilight (white nights) or never reaches it, it is `null` — no number
 * would mean anything.
 *
 * @param {Date} date - only its local calendar date is used
 * @param {number} lat
 * @param {number} lon - positive east
 * @returns {{
 *   sunrise: Date|null, sunset: Date|null,
 *   dawn: Date|null, dusk: Date|null,
 *   daylightMs: number, twilightMs: number|null,
 *   polar: 'day'|'night'|null,
 * }}
 */
export function sunTimes(date, lat, lon) {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();

    const { declinationDeg, eqTimeMin } = solarParameters(julianDayNumber(year, month, day));
    const noonMin = 720 - 4 * lon - eqTimeMin;
    const dayStartUtc = Date.UTC(year, month - 1, day);
    const at = (min) => new Date(dayStartUtc + min * 60000);

    const haSun = hourAngleDeg(lat, declinationDeg, SUN_ALTITUDE_DEG);
    const haCivil = hourAngleDeg(lat, declinationDeg, CIVIL_ALTITUDE_DEG);

    // Polar day: the sun never touches the horizon.
    if (haSun === Infinity) {
        return {
            sunrise: null,
            sunset: null,
            dawn: null,
            dusk: null,
            daylightMs: DAY_MS,
            twilightMs: null,
            polar: 'day',
        };
    }

    // Polar night: the sun never clears it. Civil twilight may still happen —
    // a midday glow (haCivil finite), all-day dusk (Infinity), or nothing.
    // Durations are derived from the constructed Dates, not from the raw hour
    // angles — Dates hold whole milliseconds, and the identities the caller
    // may rely on (twilight = dusk − dawn) must be exact, not float-close.
    if (haSun === null) {
        const dawn = Number.isFinite(haCivil) ? at(noonMin - 4 * haCivil) : null;
        const dusk = Number.isFinite(haCivil) ? at(noonMin + 4 * haCivil) : null;
        return {
            sunrise: null,
            sunset: null,
            dawn,
            dusk,
            daylightMs: 0,
            twilightMs: dawn ? dusk - dawn : haCivil === Infinity ? DAY_MS : null,
            polar: 'night',
        };
    }

    // An ordinary day. haCivil is finite unless the sky never leaves civil
    // twilight overnight (high-latitude white nights) — then dawn and dusk do
    // not exist as moments and a per-side length would be arbitrary.
    const sunrise = at(noonMin - 4 * haSun);
    const sunset = at(noonMin + 4 * haSun);
    const dawn = haCivil === Infinity ? null : at(noonMin - 4 * haCivil);
    return {
        sunrise,
        sunset,
        dawn,
        dusk: haCivil === Infinity ? null : at(noonMin + 4 * haCivil),
        daylightMs: sunset - sunrise,
        twilightMs: dawn ? sunrise - dawn : null,
        polar: null,
    };
}
