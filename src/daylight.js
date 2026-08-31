/**
 * The daylight card: a 24-hour bar of the day's phases with the times under
 * it, in the shape timeanddate.com uses for "Night, Twilight, and Daylight
 * Times".
 *
 * All of it is arithmetic from `sun.js` — the date off the device clock, the
 * coordinate from geolocation. Nothing here asks the network.
 */

import { sunPhases, sunTimes } from './sun.js';
import { localeTag, t } from './i18n.js';

const MIN_PER_DAY = 1440;

/** Where the phase table's open/closed state is kept, next to `ssm-lang`. */
const PHASES_KEY = 'ssm-phases';

/** Ticks under the bar. Every six hours is enough to read it by. */
const AXIS_HOURS = [0, 6, 12, 18, 24];

let dom = null;

/** Caches the card's elements once the DOM exists. */
function elements() {
    if (!dom) {
        dom = {
            card: document.getElementById('daylight'),
            place: document.getElementById('daylight-place'),
            summary: document.getElementById('daylight-summary'),
            bar: document.getElementById('daylight-bar'),
            axis: document.getElementById('daylight-axis'),
            phases: document.getElementById('daylight-phases'),
        };
    }
    return dom;
}

/**
 * Restores the phase table's open/closed state and keeps it up to date.
 *
 * Someone who opened the table meant to see it, and a card that folds itself
 * shut on every visit is the same argument the language switcher already
 * settled once.
 *
 * Nothing is written for a visitor who never touched it: setting `open` to the
 * false it already holds fires no `toggle`, so a default is never mistaken for
 * a choice.
 *
 * @param {ParentNode} [root]
 */
export function initDaylight(root = document) {
    const details = root.querySelector('.daylight-details');
    if (!details) return;

    try {
        details.open = localStorage.getItem(PHASES_KEY) === 'open';
    } catch {
        // Private mode, or storage disabled — the table just starts closed.
    }

    details.addEventListener('toggle', () => {
        try {
            localStorage.setItem(PHASES_KEY, details.open ? 'open' : 'closed');
        } catch {
            // The choice just won't stick.
        }
    });
}

/**
 * The y of the card's bottom edge as it would be with the phase table closed,
 * or `null` when the card is not on screen.
 *
 * Measured from the disclosure's own row rather than from the card, because
 * the marker's place on the map is anchored to this and must NOT move when
 * someone opens the table. The table is the only thing that grows the card, so
 * the summary row's bottom plus the card's padding is where the card ends in
 * the closed state — a number that stays the same whether it is open or shut.
 *
 * @returns {number|null}
 */
export function collapsedBottomPx() {
    const el = elements();
    if (!el.card || el.card.hidden) return null;

    const toggle = el.card.querySelector('.daylight-toggle');
    if (!toggle) return el.card.getBoundingClientRect().bottom;

    const padding = parseFloat(getComputedStyle(el.card).paddingBottom) || 0;
    return toggle.getBoundingClientRect().bottom + padding;
}

/**
 * How far a zone is from UTC, in minutes, at a given instant.
 *
 * Read back out of `Intl` rather than assumed: it is the only way to get a
 * zone's offset for a date including whichever side of a DST change it falls
 * on, and the bar is laid out in the LOCATION's local hours.
 *
 * @param {Date} date
 * @param {string} timeZone
 * @returns {number}
 */
export function zoneOffsetMin(date, timeZone) {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hour12: false,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
    }).formatToParts(date);

    const f = Object.fromEntries(parts.map((p) => [p.type, p.value]));
    // `hour` comes back as 24 for midnight in some engines under hour12:false.
    const asUtc = Date.UTC(+f.year, +f.month - 1, +f.day, +f.hour % 24, +f.minute, +f.second);
    return (asUtc - date.getTime()) / 60000;
}

/**
 * The day's phases as segments of the LOCAL 00:00–24:00 axis.
 *
 * Solar noon is not local noon — a zone can sit hours off its longitude — so
 * the run of phases lands offset from the axis, hanging over one end and
 * leaving the other bare. The fix is to accept that a day is periodic: each
 * phase is also drawn shifted a day earlier and a day later, everything is
 * clipped to the axis, and touching segments of the same phase are merged. The
 * axis ends up covered exactly once.
 *
 * @param {{id: string, startMin: number, endMin: number}[]} phases
 * @param {number} offsetMin - UTC minutes to add to reach local time
 * @returns {{id: string, startMin: number, endMin: number}[]}
 */
export function localSegments(phases, offsetMin) {
    const clipped = [];
    for (const shift of [-MIN_PER_DAY, 0, MIN_PER_DAY]) {
        for (const phase of phases) {
            const start = Math.max(0, phase.startMin + offsetMin + shift);
            const end = Math.min(MIN_PER_DAY, phase.endMin + offsetMin + shift);
            if (end > start) clipped.push({ id: phase.id, startMin: start, endMin: end });
        }
    }

    clipped.sort((a, b) => a.startMin - b.startMin);

    const merged = [];
    for (const segment of clipped) {
        const last = merged[merged.length - 1];
        if (
            last &&
            last.id === segment.id &&
            Math.round(last.endMin) >= Math.round(segment.startMin)
        ) {
            last.endMin = Math.max(last.endMin, segment.endMin);
        } else {
            merged.push({ ...segment });
        }
    }

    // A phase shorter than the display's own resolution is not a phase anyone
    // can read; dropping it keeps the table honest.
    return merged.filter((s) => Math.round(s.endMin) > Math.round(s.startMin));
}

/**
 * Minutes from local midnight as "07:05". Formatted from the same number the
 * bar is positioned by, so the two can never disagree.
 *
 * @param {number} min
 * @returns {string}
 */
function clockAt(min) {
    const total = Math.round(min) % MIN_PER_DAY;
    const h = Math.floor(total / 60);
    return `${String(h).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * A duration as "11 ч 20 мин", dropping whichever unit is zero.
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
 * Draws the card for a position, or hides it when there is nothing to draw.
 *
 * @param {{lat: number, lon: number}|null} position
 * @param {string|null} timezone - IANA zone the times are shown in
 */
export function renderDaylight(position, timezone) {
    const el = elements();
    if (!el.card) return;

    if (!position) {
        el.card.hidden = true;
        return;
    }

    const now = new Date();
    const zone = timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
    const { phases } = sunPhases(now, position.lat, position.lon);
    const summary = sunTimes(now, position.lat, position.lon);
    const segments = localSegments(phases, zoneOffsetMin(now, zone));

    el.place.textContent =
        `${zone.split('/').pop().replace(/_/g, ' ')} · ` +
        new Intl.DateTimeFormat(localeTag(), {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
        }).format(now);

    renderSummary(el.summary, summary, segments);
    renderBar(el.bar, segments);
    renderAxis(el.axis);
    renderPhases(el.phases, segments);

    el.card.hidden = false;
}

/** Sunrise, sunset and the length of the light — the line people came for. */
function renderSummary(target, summary, segments) {
    const parts = [];

    if (summary.polar) {
        parts.push(span(t(summary.polar === 'day' ? 'sun.polarDay' : 'sun.polarNight')));
    } else {
        const day = segments.find((s) => s.id === 'day');
        // Read off the drawn segment, so the headline cannot disagree with the
        // row for the same event three lines below it.
        parts.push(eventSpan('↑', 'sun.sunrise', clockAt(day.startMin)));
        parts.push(eventSpan('↓', 'sun.sunset', clockAt(day.endMin)));
    }

    parts.push(span(`${t('daylight.length')} ${formatDuration(summary.daylightMs)}`));
    target.replaceChildren(...parts);
}

/** The 24-hour bar itself: one flex child per phase, width = its share. */
function renderBar(target, segments) {
    target.replaceChildren(
        ...segments.map((segment) => {
            const band = document.createElement('span');
            band.className = `daylight-band phase-${segment.id}`;
            band.style.flexGrow = String(segment.endMin - segment.startMin);
            band.title = `${t('phase.' + segment.id)} ${clockAt(segment.startMin)}–${clockAt(segment.endMin)}`;
            return band;
        }),
    );
    target.setAttribute('aria-label', t('daylight.barAria'));
}

/** Hour ticks, spaced by their real position rather than by flex. */
function renderAxis(target) {
    target.replaceChildren(
        ...AXIS_HOURS.map((hour) => {
            const tick = document.createElement('span');
            tick.className = 'daylight-tick';
            tick.style.left = `${(hour / 24) * 100}%`;
            tick.textContent = String(hour).padStart(2, '0');
            return tick;
        }),
    );
}

/** The table under the bar: every phase the day actually has, with its hours. */
function renderPhases(target, segments) {
    target.replaceChildren(
        ...segments.map((segment) => {
            const row = document.createElement('li');
            row.className = segment.id === 'day' ? 'is-day' : '';

            const swatch = document.createElement('span');
            swatch.className = `daylight-dot phase-${segment.id}`;
            swatch.setAttribute('aria-hidden', 'true');

            const name = document.createElement('span');
            name.className = 'daylight-name';
            name.textContent = t('phase.' + segment.id);

            const range = document.createElement('span');
            range.className = 'daylight-range';
            range.textContent = `${clockAt(segment.startMin)}–${clockAt(segment.endMin)}`;

            row.append(swatch, name, range);
            return row;
        }),
    );
}

function span(text) {
    const el = document.createElement('span');
    el.textContent = text;
    return el;
}

/**
 * "↑ 07:05" with the arrow named for screen readers — it is punctuation to the
 * eye and noise to a reader, and aria-label on a bare span is not dependable.
 */
function eventSpan(mark, key, text) {
    const el = document.createElement('span');

    const glyph = document.createElement('span');
    glyph.setAttribute('aria-hidden', 'true');
    glyph.textContent = mark + ' ';

    const name = document.createElement('span');
    name.className = 'sr-only';
    name.textContent = t(key) + ' ';

    el.append(glyph, name, document.createTextNode(text));
    return el;
}
