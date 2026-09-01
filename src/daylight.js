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
 * Which label a phase gets on the "time left" line. The three twilights share
 * one: the bar and the table already say which twilight it is, and the line is
 * answering "how long until this changes", where they are one answer.
 */
const REMAINING_KEY = {
    day: 'remaining.day',
    night: 'remaining.night',
    civil: 'remaining.twilight',
    nautical: 'remaining.twilight',
    astronomical: 'remaining.twilight',
};

/**
 * Local minutes since midnight, keeping the fraction — the countdown is worth
 * rounding to the nearest minute rather than truncating to it.
 *
 * The epoch was midnight UTC, so minutes-since-epoch modulo a day is already
 * minutes-since-UTC-midnight; the zone offset carries it the rest of the way.
 *
 * @param {Date} date
 * @param {number} offsetMin
 * @returns {number}
 */
export function localMinutes(date, offsetMin) {
    return (((date.getTime() / 60000 + offsetMin) % MIN_PER_DAY) + MIN_PER_DAY) % MIN_PER_DAY;
}

/**
 * Which segment of the day the clock is in.
 *
 * One definition, used by the line that counts the phase down and by the row
 * bolded under it, so the two can never name different phases.
 *
 * The segments cover the axis exactly once, so a miss is floating-point dust
 * at a boundary rather than a gap, and the last segment is the only one that
 * can hold the far edge.
 *
 * @param {{startMin: number, endMin: number}[]} segments
 * @param {number} nowMin - local minutes since midnight
 * @returns {number} index into `segments`, or -1 when there are none
 */
export function currentIndex(segments, nowMin) {
    const found = segments.findIndex((s) => nowMin >= s.startMin && nowMin < s.endMin);
    return found === -1 ? segments.length - 1 : found;
}

/**
 * How much of the current phase is left, and which phase that is.
 *
 * Night is the case this exists for. On the 24-hour axis it is two segments —
 * one running into midnight and one out of it — but it is a single stretch of
 * darkness. At 21:00 the answer has to reach into tomorrow's small hours; at
 * 02:00 it must not, because the date has already turned and the night now
 * ends inside the day being drawn. Both fall out of one rule: a phase that
 * touches midnight continues into the next day's first segment when that is
 * the same phase.
 *
 * Returns `null` when the phase does not end within reach — a polar day or
 * night runs for weeks, and no number of hours would be an honest answer.
 *
 * @param {{id: string, startMin: number, endMin: number}[]} segments - today
 * @param {{id: string, startMin: number, endMin: number}[]} tomorrow
 * @param {number} nowMin - local minutes since midnight
 * @returns {{id: string, minutes: number}|null}
 */
export function remainingPhase(segments, tomorrow, nowMin) {
    const current = segments[currentIndex(segments, nowMin)];
    if (!current) return null;

    let end = current.endMin;
    if (Math.round(end) >= MIN_PER_DAY) {
        const next = tomorrow[0];
        // A different phase tomorrow means this one really does end at
        // midnight; the same phase filling all of tomorrow means a polar
        // stretch with no end worth printing.
        if (next && next.id === current.id) {
            if (Math.round(next.endMin) >= MIN_PER_DAY) return null;
            end += next.endMin;
        }
    }

    return { id: current.id, minutes: end - nowMin };
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
 * Everything the card shows, worked out from a position and a zone.
 *
 * Tomorrow is computed alongside today because the night on screen at 21:00
 * ends in tomorrow's small hours, and the line counting it down has to be able
 * to see there.
 *
 * @param {{lat: number, lon: number}} position
 * @param {string} zone
 */
function compute(position, zone) {
    const now = new Date();
    const nextDay = new Date(now);
    nextDay.setDate(nextDay.getDate() + 1);

    const offsetMin = zoneOffsetMin(now, zone);

    return {
        now,
        segments: localSegments(sunPhases(now, position.lat, position.lon).phases, offsetMin),
        // Tomorrow gets its own offset: the two differ across a DST change.
        tomorrow: localSegments(
            sunPhases(nextDay, position.lat, position.lon).phases,
            zoneOffsetMin(nextDay, zone),
        ),
        nowMin: localMinutes(now, offsetMin),
        sun: sunTimes(now, position.lat, position.lon),
    };
}

/**
 * Redraws the two things that move with the clock: the "time left" line and
 * which row is bold.
 *
 * They are the only parts of the card that change between position fixes, and
 * they have to agree — a boundary that advanced the countdown but left the
 * previous phase bolded would show the card contradicting itself. Rebuilding
 * the bar and the nine rows three times a minute to keep them in step would
 * rebuild the DOM inside an open phase table, so the rows are re-marked in
 * place instead.
 *
 * @param {{lat: number, lon: number}|null} position
 * @param {string|null} timezone
 */
export function refreshRemaining(position, timezone) {
    const el = elements();
    if (!el.card || el.card.hidden || !position) return;

    const zone = timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
    const state = compute(position, zone);

    renderSummary(el.summary, state);
    markCurrentPhase(el.phases, state.segments, state.nowMin);
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

    const zone = timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
    const state = compute(position, zone);
    const { now, segments } = state;

    el.place.textContent =
        `${zone.split('/').pop().replace(/_/g, ' ')} · ` +
        new Intl.DateTimeFormat(localeTag(), {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
        }).format(now);

    renderSummary(el.summary, state);
    renderBar(el.bar, segments);
    renderAxis(el.axis);
    renderPhases(el.phases, segments, state.nowMin);

    el.card.hidden = false;
}

/** Sunrise, sunset, and how long the light — or the dark — has left to run. */
function renderSummary(target, { segments, tomorrow, nowMin, sun }) {
    const parts = [];

    if (sun.polar) {
        parts.push(span(t(sun.polar === 'day' ? 'sun.polarDay' : 'sun.polarNight')));
    } else {
        const day = segments.find((s) => s.id === 'day');
        // Read off the drawn segment, so the headline cannot disagree with the
        // row for the same event three lines below it.
        parts.push(eventSpan('↑', 'sun.sunrise', clockAt(day.startMin)));
        parts.push(eventSpan('↓', 'sun.sunset', clockAt(day.endMin)));
    }

    const left = remainingPhase(segments, tomorrow, nowMin);
    if (left) {
        parts.push(span(`${t(REMAINING_KEY[left.id])} ${formatDuration(left.minutes * 60000)}`));
    }

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
function renderPhases(target, segments, nowMin) {
    target.replaceChildren(
        ...segments.map((segment) => {
            const row = document.createElement('li');

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

    markCurrentPhase(target, segments, nowMin);
}

/**
 * Bolds the row the clock is in.
 *
 * Night is two rows — one running into midnight, one out of it — and which of
 * the two you are in is the entire question at 21:27 and again at 00:30. The
 * rows are in the same order as the segments they were built from, so this
 * marks by position and can be re-run on rows that are already on screen.
 *
 * `aria-current` carries the same fact for a screen reader, which gets nothing
 * out of a font weight.
 *
 * @param {Element} target
 * @param {{startMin: number, endMin: number}[]} segments
 * @param {number} nowMin - local minutes since midnight
 */
function markCurrentPhase(target, segments, nowMin) {
    const rows = target.children;
    // Only ever false if the day rolled over between the draw and the tick,
    // which triggers a full redraw of its own a moment later.
    if (rows.length !== segments.length) return;

    const current = currentIndex(segments, nowMin);
    for (let i = 0; i < rows.length; i += 1) {
        const isNow = i === current;
        rows[i].classList.toggle('is-now', isNow);
        if (isNow) rows[i].setAttribute('aria-current', 'true');
        else rows[i].removeAttribute('aria-current');
    }
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
