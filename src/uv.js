/**
 * The whole domain model of this app: a UV index number, the band it falls in,
 * and where the number comes from. Pure functions first so the band boundaries
 * — the one piece of logic that can be silently wrong — are testable without a
 * map, a browser or a network.
 */

/**
 * The five bands, in ascending order, keyed by their EXCLUSIVE upper bound.
 *
 * The bounds come from the WHO/WMO Global Solar UV Index scale. They are
 * expressed as `< max` rather than as `0–2.9`, `3–5.9`, … because the readable
 * form is only correct for values already rounded to one decimal — which is
 * exactly what `roundUv` guarantees before this table is consulted.
 *
 * Colours: `fill` is what the map is washed with, `ink` is the same hue darkened
 * until it passes contrast on the white card. They are separate because the
 * moderate band's yellow is unreadable as text and invisible as a wash at the
 * same lightness — one hue cannot do both jobs.
 *
 * `alpha` climbs with the band on purpose. A constant opacity would make the
 * five washes equally loud, and the loudness is itself information: the safe
 * end should sit lightly over a map you can still read, and the extreme end
 * should be hard to look past. It stops at 0.5 — beyond that the basemap goes,
 * and with it any sense of where the reading applies.
 */
export const UV_BANDS = [
    { id: 'low', max: 3, fill: '#3ea72d', ink: '#2c7a1f', alpha: 0.28 },
    { id: 'moderate', max: 6, fill: '#f2c200', ink: '#8a6200', alpha: 0.4 },
    { id: 'high', max: 8, fill: '#f18b00', ink: '#a85c00', alpha: 0.44 },
    { id: 'veryHigh', max: 11, fill: '#e53210', ink: '#b3200a', alpha: 0.46 },
    { id: 'extreme', max: Infinity, fill: '#8e24aa', ink: '#6a2a96', alpha: 0.5 },
];

/**
 * One decimal, which is the resolution the bands are defined at.
 *
 * Rounding happens BEFORE classification, never after: a raw 2.97 displayed as
 * "3.0" but washed green would show a number and a colour that contradict each
 * other, and the colour is the thing people act on.
 *
 * @param {number} uv
 * @returns {number}
 */
export function roundUv(uv) {
    return Math.round(uv * 10) / 10;
}

/**
 * The band a UV index falls in. Negative values (never seen in practice, but a
 * provider glitch is not worth a crash) clamp into the lowest band.
 *
 * @param {number} uv
 * @returns {typeof UV_BANDS[number]}
 */
export function uvBand(uv) {
    const value = roundUv(uv);
    return UV_BANDS.find((band) => value < band.max) ?? UV_BANDS[UV_BANDS.length - 1];
}

/** Open-Meteo's air-quality service: no key, no quota registration, CORS open. */
const UV_ENDPOINT = 'https://air-quality-api.open-meteo.com/v1/air-quality';

/**
 * Current UV index at a coordinate, plus the IANA zone that coordinate sits in.
 *
 * `timezone=auto` is what makes the clock on the card the visitor's LOCAL time
 * rather than their device's — the two differ for anyone travelling with a
 * phone that has not caught up, which is precisely the audience for a "can I go
 * outside" answer.
 *
 * @param {number} lat
 * @param {number} lon
 * @param {AbortSignal} [signal]
 * @returns {Promise<{uv: number, timezone: string, observedAt: string}>}
 */
export async function fetchUv(lat, lon, signal) {
    const url =
        `${UV_ENDPOINT}?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}` +
        '&current=uv_index&timezone=auto&forecast_days=1';

    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`UV service responded ${response.status}`);

    const data = await response.json();
    const uv = data?.current?.uv_index;
    // A 200 carrying no number is a failure like any other — falling through
    // would paint the map green, i.e. "safe", on missing data.
    if (typeof uv !== 'number' || !Number.isFinite(uv)) {
        throw new Error('UV service returned no reading');
    }

    return {
        uv: Math.max(0, uv),
        timezone: data.timezone || 'UTC',
        observedAt: data.current.time,
    };
}
