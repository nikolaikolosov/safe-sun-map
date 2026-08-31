/**
 * Wiring: get a position, turn it into a UV reading, paint the map with it.
 *
 * The page has exactly one job — tell someone at a glance whether it is safe to
 * step outside — so there is one state machine here and no router, no settings
 * and no persisted state.
 */

import { fetchUv, formatUv, uvBand } from './uv.js';
import { sunTimes } from './sun.js';
import { initMap, recentre, showUser } from './map.js';
import { initHelp } from './help.js';
import {
    applyTranslations,
    getLang,
    initLang,
    localeTag,
    onLangChange,
    setLang,
    t,
} from './i18n.js';

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
    sunTimes: document.getElementById('sun-times'),
    sunLengths: document.getElementById('sun-lengths'),
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
 * What the card is showing, kept as data rather than only as DOM.
 *
 * A language switch has to redraw whatever is already on screen, and the band
 * name, the advice and the status line are all written by JS — there is no
 * markup carrying their keys for `applyTranslations` to find. Holding the state
 * means the switch replays it instead of the card going blank or, worse,
 * keeping the old language until the next fix arrives ten minutes later.
 *
 * @type {{kind: 'reading', uv: number, position: {lat: number, lon: number}}
 *   | {kind: 'status', key: string, retryable: boolean}}
 */
let view = { kind: 'status', key: 'status.locating', retryable: false };

/**
 * The device-clock day the sun rows were last drawn for. Sunrise and sunset
 * only change at midnight; the clock tick compares against this so the date on
 * the card does not sit yesterday's until the next fetch.
 * @type {string|null}
 */
let sunDrawnFor = null;

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
 * Shows a reading.
 *
 * @param {number} uv
 * @param {{lat: number, lon: number}} position - where it was read, for the
 *   sunrise/sunset arithmetic
 */
function showReading(uv, position) {
    view = { kind: 'reading', uv, position };
    render();
}

/**
 * Shows a one-line status instead of a reading.
 *
 * @param {string} key - i18n key of the message
 * @param {boolean} [retryable] - whether to offer the retry button
 */
function showStatus(key, retryable = false) {
    view = { kind: 'status', key, retryable };
    render();
}

/** Draws `view`. Idempotent, so a language switch can simply call it again. */
function render() {
    if (view.kind === 'reading') {
        const band = uvBand(view.uv);

        dom.veil.style.backgroundColor = band.fill;
        dom.veil.style.opacity = String(band.alpha);
        dom.headline.style.color = band.ink;

        dom.value.textContent = formatUv(view.uv, localeTag());
        dom.band.textContent = t('band.' + band.id);
        dom.advice.textContent = t('advice.' + band.id);
        renderSun(view.position);

        dom.reading.hidden = false;
        dom.status.hidden = true;
        updateClock();
        return;
    }

    dom.statusText.textContent = t(view.key);
    dom.retry.hidden = !view.retryable;
    dom.reading.hidden = true;
    dom.status.hidden = false;
    // The wash goes fully transparent while a status is up: a colour left on
    // screen next to "location is off" would be read as the answer, and a wrong
    // answer to "is it safe outside" is worse than none.
    dom.veil.style.opacity = '0';
}

/**
 * A duration as "11 ч 10 мин", dropping whichever unit is zero.
 *
 * @param {number} ms
 * @returns {string}
 */
function formatDuration(ms) {
    const totalMin = Math.round(ms / 60000);
    const h = Math.floor(totalMin / 60);
    const min = totalMin % 60;
    if (h && min) return `${h} ${t('unit.h')} ${min} ${t('unit.min')}`;
    if (h) return `${h} ${t('unit.h')}`;
    return `${min} ${t('unit.min')}`;
}

/**
 * The two sun rows: the device's date with sunrise and sunset, then the
 * daylight and twilight lengths. All arithmetic is local (src/sun.js); the
 * times are DISPLAYED in the location's zone, like the clock below them, so a
 * traveller reads the sunset of the place they are standing in.
 *
 * @param {{lat: number, lon: number}} position
 */
function renderSun(position) {
    const now = new Date();
    sunDrawnFor = now.toDateString();
    const sun = sunTimes(now, position.lat, position.lon);

    const timeFmt = new Intl.DateTimeFormat(localeTag(), {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: timezone ?? undefined,
    });

    const span = (text) => {
        const el = document.createElement('span');
        el.textContent = text;
        return el;
    };
    // The ↑/↓ marks are punctuation to the eye but noise to a screen reader;
    // each gets a hidden spoken name instead.
    const eventSpan = (mark, key, when) => {
        const el = document.createElement('span');
        const glyph = document.createElement('span');
        glyph.setAttribute('aria-hidden', 'true');
        glyph.textContent = mark + ' ';
        const name = document.createElement('span');
        name.className = 'sr-only';
        name.textContent = t(key) + ' ';
        el.append(glyph, name, document.createTextNode(timeFmt.format(when)));
        return el;
    };

    const dateText = new Intl.DateTimeFormat(localeTag(), {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
    }).format(now);

    const times = [span(dateText)];
    if (sun.polar) {
        times.push(span(t(sun.polar === 'day' ? 'sun.polarDay' : 'sun.polarNight')));
    } else {
        times.push(eventSpan('↑', 'sun.sunrise', sun.sunrise));
        times.push(eventSpan('↓', 'sun.sunset', sun.sunset));
    }
    dom.sunTimes.replaceChildren(...times);

    const lengths = [span(t('sun.daylight') + ' ' + formatDuration(sun.daylightMs))];
    if (sun.twilightMs !== null) {
        lengths.push(span(t('sun.twilight') + ' ' + formatDuration(sun.twilightMs)));
    }
    dom.sunLengths.replaceChildren(...lengths);
}

/** Renders local time at the visitor's coordinates, per the provider's zone. */
function updateClock() {
    if (!timezone) return;
    const time = new Intl.DateTimeFormat(localeTag(), {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: timezone,
    }).format(new Date());

    // "America/Argentina/Buenos_Aires" → "Buenos Aires". The place name is what
    // makes it obvious the clock is the LOCATION's time, not the device's.
    const place = timezone.split('/').pop().replace(/_/g, ' ');
    dom.clock.textContent = time + ' · ' + place;

    // Midnight on the device clock: the date and the sun times just changed,
    // and the next fetch is up to ten minutes away.
    if (view.kind === 'reading' && sunDrawnFor !== new Date().toDateString()) render();
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
        showReading(reading.uv, position);
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

/** Wires the EN | ES | RU segmented control. */
function initLangSwitcher() {
    for (const button of document.querySelectorAll('.lang-btn')) {
        button.addEventListener('click', () => setLang(button.dataset.lang));
    }
}

/** Reflects the language in force on the segmented control. */
function updateLangSwitcher() {
    const lang = getLang();
    for (const button of document.querySelectorAll('.lang-btn')) {
        const active = button.dataset.lang === lang;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
    }
}

function init() {
    initLang();
    // Before applyTranslations: the bottom-right controls carry their own keys,
    // and they do not exist until the map is built.
    initMap({ onRecentre: recentre, onHelp: initHelp() });
    applyTranslations();

    initLangSwitcher();
    updateLangSwitcher();
    onLangChange(() => {
        applyTranslations();
        updateLangSwitcher();
        render();
    });

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
