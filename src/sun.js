/**
 * The sun's day at a coordinate, computed on the device.
 *
 * NOAA's solar-position algorithm (the one behind their online calculator):
 * minute-level accuracy for the latitudes people live at, degrading gracefully
 * towards the poles, where the answers become "polar day" and "polar night"
 * rather than times anyway. Pure arithmetic — no network call, nothing to go
 * stale, and the numbers roll over at midnight without asking a server.
 *
 * The calendar date is taken from the Date's LOCAL fields — the device clock,
 * which is what the product asks for.
 */

const DEG = Math.PI / 180;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Half a day, in minutes: the widest an interval centred on noon can be. */
const HALF_DAY_MIN = 720;

/**
 * The sun's altitude at each boundary, from darkest to brightest. The last is
 * sunrise/sunset: 16′ for the solar disc's radius plus 34′ of atmospheric
 * refraction, the moment the top edge touches the horizon. The twilights are
 * the standard −18/−12/−6 definitions.
 *
 * Order matters — each interval contains the next, which is what lets the
 * phases be built by subtraction rather than by case analysis.
 */
const THRESHOLDS = [
    { id: 'astronomical', altitudeDeg: -18 },
    { id: 'nautical', altitudeDeg: -12 },
    { id: 'civil', altitudeDeg: -6 },
    { id: 'day', altitudeDeg: -0.833 },
];

/**
 * The nine phases of a day, in order. Symmetric about solar noon: the same
 * twilight ladder climbed in the morning and descended in the evening.
 */
const PHASE_ORDER = [
    'night',
    'astronomical',
    'nautical',
    'civil',
    'day',
    'civil',
    'nautical',
    'astronomical',
    'night',
];

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
 * Half the width, in minutes, of the interval around solar noon during which
 * the sun is above `altitudeDeg`. Zero when it never gets that high all day,
 * a full 720 when it never drops that low.
 *
 * Expressing every threshold this way is what removes the case analysis: the
 * polar day is simply an interval of 720, the polar night an interval of 0,
 * and the phases in between are differences of neighbouring half-widths.
 *
 * @returns {number} 0…720
 */
function halfWidthMin(latDeg, declinationDeg, altitudeDeg) {
    const cosHa =
        (Math.sin(altitudeDeg * DEG) - Math.sin(latDeg * DEG) * Math.sin(declinationDeg * DEG)) /
        (Math.cos(latDeg * DEG) * Math.cos(declinationDeg * DEG));
    if (cosHa > 1) return 0;
    if (cosHa < -1) return HALF_DAY_MIN;
    return 4 * (Math.acos(cosHa) / DEG);
}

/**
 * The whole day as an ordered run of phases, from midnight to midnight.
 *
 * Times are minutes from 00:00 UTC of the calendar date, which the caller
 * shifts into whatever zone it means to display. Phases that do not occur —
 * most of them, at the poles — come back with zero length rather than being
 * absent, so the run always covers the day exactly once and the caller can
 * filter rather than reconstruct.
 *
 * @param {Date} date - only its local calendar date is used
 * @param {number} lat
 * @param {number} lon - positive east
 * @returns {{
 *   dayStartUtc: number,
 *   noonMin: number,
 *   phases: {id: string, startMin: number, endMin: number}[],
 *   halfWidths: Record<string, number>,
 * }}
 */
export function sunPhases(date, lat, lon) {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();

    const { declinationDeg, eqTimeMin } = solarParameters(julianDayNumber(year, month, day));
    const noonMin = HALF_DAY_MIN - 4 * lon - eqTimeMin;

    const halves = THRESHOLDS.map((threshold) =>
        halfWidthMin(lat, declinationDeg, threshold.altitudeDeg),
    );

    // Boundaries, earliest to latest: down the ladder to solar noon and back
    // up. Darkest threshold first, so `halves` is descending and the list is
    // already sorted.
    const bounds = [
        ...halves.map((h) => noonMin - h),
        ...[...halves].reverse().map((h) => noonMin + h),
    ];

    const phases = PHASE_ORDER.map((id, i) => ({
        id,
        startMin: i === 0 ? noonMin - HALF_DAY_MIN : bounds[i - 1],
        endMin: i === PHASE_ORDER.length - 1 ? noonMin + HALF_DAY_MIN : bounds[i],
    }));

    const halfWidths = Object.fromEntries(THRESHOLDS.map((t, i) => [t.id, halves[i]]));
    return { dayStartUtc: Date.UTC(year, month - 1, day), noonMin, phases, halfWidths };
}

/**
 * The headline facts of the sun's day: when it rises and sets, how long the
 * light lasts, and how long one civil twilight runs.
 *
 * `twilightMs` is the length of ONE civil twilight — dawn to sunrise; the
 * evening one is its mirror. In a polar night that still gets civil light it
 * becomes the length of that midday glow instead. Where the sky never leaves
 * civil twilight (white nights) or never reaches it, it is `null` — no number
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
    const { dayStartUtc, noonMin, halfWidths } = sunPhases(date, lat, lon);
    const at = (min) => new Date(dayStartUtc + min * 60000);

    const dayHalf = halfWidths.day;
    const civilHalf = halfWidths.civil;

    // A threshold the sun never crosses has no moment to report: 0 means it
    // stayed below all day, 720 that it stayed above.
    const hasSunEvents = dayHalf > 0 && dayHalf < HALF_DAY_MIN;
    const hasCivilEvents = civilHalf > 0 && civilHalf < HALF_DAY_MIN;

    const sunrise = hasSunEvents ? at(noonMin - dayHalf) : null;
    const sunset = hasSunEvents ? at(noonMin + dayHalf) : null;
    const dawn = hasCivilEvents ? at(noonMin - civilHalf) : null;
    const dusk = hasCivilEvents ? at(noonMin + civilHalf) : null;

    const polar = dayHalf === HALF_DAY_MIN ? 'day' : dayHalf === 0 ? 'night' : null;

    // Durations come from the constructed Dates, not the raw half-widths:
    // Dates hold whole milliseconds, so the identities a caller may rely on
    // (twilight = sunrise − dawn) are exact rather than float-close.
    let twilightMs = null;
    if (hasCivilEvents) twilightMs = sunrise ? sunrise - dawn : dusk - dawn;
    else if (polar === 'night' && civilHalf === HALF_DAY_MIN) twilightMs = DAY_MS;

    return {
        sunrise,
        sunset,
        dawn,
        dusk,
        daylightMs: sunset ? sunset - sunrise : dayHalf === HALF_DAY_MIN ? DAY_MS : 0,
        twilightMs,
        polar,
    };
}
