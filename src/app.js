/**
 * Wiring: get a position, turn it into a UV reading, paint the map with it.
 *
 * The page has exactly one job — tell someone at a glance whether it is safe to
 * step outside — so there is one state machine here and no router, no settings
 * and no persisted state.
 */

import { fetchUv, roundUv, uvBand } from './uv.js';
import { initMap, recentre, showUser } from './map.js';
import { LANG, t } from './i18n.js';

/**
 * How often the reading is refreshed. The provider publishes UV hourly, so
 * anything faster only spends battery; anything slower and the number goes
 * stale across the part of the day when it changes fastest.
 */
const UV_REFRESH_MS = 10 * 60 * 1000;

/**
 * How far the visitor has to move before the reading is fetched again.
 *
 * The UV index is a broad atmospheric field — sun angle and ozone column — and
 * does not vary meaningfully across a city. Refetching on every GPS wobble
 * would hammer a free service for numbers identical to the one on screen.
 */
const UV_REFRESH_DISTANCE_M = 10000;

/** Keeps the clock within 20 s of the truth without a per-second timer. */
const CLOCK_TICK_MS = 20000;

const dom = {
    reading: document.getElementById('reading'),
    headline: document.querySelector('.card-headline'),
    value: document.getElementById('uv-value'),
    band: document.getElementById('uv-band'),
    advice: document.getElementById('uv-advice'),
    clock: document.getElementById('clock'),
    status: document.getElementById('status'),
    statusText: document.getElementById('status-text'),
    retry: document.getElementById('retry'),
    veil: document.getElementById('veil'),
};

/** @type {{lat: number, lon: number}|null} Coordinates the reading was fetched for. */
let fetchedAt = null;
/** @type {number} Timestamp of the last successful fetch. */
let fetchedWhen = 0;
/** @type {string|null} IANA zone of the current reading, for the clock. */
let timezone = null;
/** @type {AbortController|null} In-flight request, so a newer one can cancel it. */
let inFlight = null;

/**
 * Great-circle distance in metres. Small enough to inline; the alternative is a
 * dependency for one formula.
 *
 * @param {{lat: number, lon: number}} a
 * @param {{lat: number, lon: number}} b
 * @returns {number}
 */
function distanceM(a, b) {
    const R = 6371e3;
    const toRad = (deg) => (deg * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lon - a.lon);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Whether a fresh reading is warranted for these coordinates.
 *
 * @param {{lat: number, lon: number}} position
 * @returns {boolean}
 */
function needsRefresh(position) {
    if (!fetchedAt) return true;
    if (Date.now() - fetchedWhen >= UV_REFRESH_MS) return true;
    return distanceM(fetchedAt, position) >= UV_REFRESH_DISTANCE_M;
}

/**
 * Shows the reading and hides the status line.
 *
 * @param {number} uv
 */
function showReading(uv) {
    const band = uvBand(uv);

    dom.veil.style.backgroundColor = band.fill;
    dom.veil.style.opacity = String(band.alpha);
    dom.headline.style.color = band.ink;

    dom.value.textContent = roundUv(uv).toFixed(1);
    dom.band.textContent = t('band.' + band.id);
    dom.advice.textContent = t('advice.' + band.id);

    dom.reading.hidden = false;
    dom.status.hidden = true;
    updateClock();
}

/**
 * Shows a one-line status instead of a reading.
 *
 * The wash goes fully transparent while a status is up: a colour left on screen
 * next to "location is off" would be read as the answer, and a wrong answer to
 * "is it safe outside" is worse than none.
 *
 * @param {string} key - i18n key of the message
 * @param {boolean} [retryable] - whether to offer the retry button
 */
function showStatus(key, retryable = false) {
    dom.statusText.textContent = t(key);
    dom.retry.hidden = !retryable;
    dom.reading.hidden = true;
    dom.status.hidden = false;
    dom.veil.style.opacity = '0';
}

/** Renders local time at the visitor's coordinates, per the provider's zone. */
function updateClock() {
    if (!timezone) return;
    const time = new Intl.DateTimeFormat(LANG, {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: timezone,
    }).format(new Date());

    // "America/Argentina/Buenos_Aires" → "Buenos Aires". The place name is what
    // makes it obvious the clock is the LOCATION's time, not the device's.
    const place = timezone.split('/').pop().replace(/_/g, ' ');
    dom.clock.textContent = time + ' · ' + place;
}

/**
 * Fetches and renders the reading for a position, unless one is already fresh.
 *
 * @param {{lat: number, lon: number}} position
 */
async function refreshUv(position) {
    if (!needsRefresh(position)) return;

    inFlight?.abort();
    inFlight = new AbortController();
    const controller = inFlight;

    if (!fetchedAt) showStatus('status.loading');

    try {
        const reading = await fetchUv(position.lat, position.lon, controller.signal);
        timezone = reading.timezone;
        fetchedAt = position;
        fetchedWhen = Date.now();
        showReading(reading.uv);
    } catch (error) {
        if (error.name === 'AbortError') return;
        console.warn('[uv] could not read the index:', error.message);
        // A failure only takes over the card when there is nothing to replace:
        // an existing reading is minutes old at worst and still worth showing.
        if (!fetchedAt) showStatus('status.offline', true);
    } finally {
        if (inFlight === controller) inFlight = null;
    }
}

/** One position read, resolved through the map and the UV refresh. */
function readPosition() {
    if (!navigator.geolocation) {
        showStatus('status.unavailable');
        return;
    }

    navigator.geolocation.getCurrentPosition(
        ({ coords }) => {
            showUser(coords.latitude, coords.longitude, coords.accuracy);
            refreshUv({ lat: coords.latitude, lon: coords.longitude });
        },
        (error) => {
            console.warn('[geolocation] no position:', error.message);
            // Nothing on screen yet means the visitor is looking at a blank
            // world map and needs to be told why; an existing reading survives
            // a single failed re-read untouched.
            if (fetchedAt) return;
            const denied = error.code === error.PERMISSION_DENIED;
            showStatus(denied ? 'status.denied' : 'status.unavailable', true);
        },
        {
            // Deliberately coarse. The UV index is uniform over tens of
            // kilometres, so a GPS fix would buy no accuracy that changes the
            // colour — and would cost a cold-start wait plus the receiver's
            // battery on a page people open for five seconds.
            enableHighAccuracy: false,
            timeout: 15000,
            maximumAge: 5 * 60 * 1000,
        },
    );
}

function init() {
    dom.retry.textContent = t('status.retry');
    document.getElementById('uv-label').textContent = t('label.uv');
    document.getElementById('map').setAttribute('aria-label', t('a11y.map'));

    initMap(recentre);
    showStatus('status.locating');
    readPosition();

    dom.retry.addEventListener('click', () => {
        showStatus('status.locating');
        readPosition();
    });

    setInterval(readPosition, UV_REFRESH_MS);
    setInterval(updateClock, CLOCK_TICK_MS);

    // Coming back to a tab that has been parked for an hour: the reading on it
    // is from whenever it was left, and the whole promise is that the colour is
    // current.
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') readPosition();
    });
}

init();
