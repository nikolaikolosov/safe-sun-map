/**
 * The hourly strip on the UV card: today's index for each hour the sun is up,
 * as bars in the band colours with the hour's value on top and the hour
 * itself underneath, the hours already gone dimmed, and a line at "now".
 *
 * It answers the question the single number cannot — not "is it safe" but
 * "when". Whether to wait an hour, or go now before it climbs, is read off the
 * shape of the day in the same five colours the map is washed with, and off
 * the numbers when the shape is not precise enough to plan by.
 */

import { formatUv, roundUv, uvBand } from './uv.js';
import { localeTag, t } from './i18n.js';

/**
 * The chart's full height, in index points.
 *
 * Fixed rather than fitted to the day, so the same height means the same
 * index tomorrow and in another place: 11 is where the scale's own top band
 * begins, so a bar touching the top of the chart means "extreme" everywhere.
 * A winter day is a row of small green bars, which is what a winter day is.
 * A day that beats 11 — the tropics do — is drawn against its own peak
 * instead of running off the chart.
 */
const SCALE_UV = 11;

/**
 * The floor for a bar that is not zero, as a share of the chart. Two pixels
 * of a forty-pixel chart: enough that an index of 0.1 at dawn is a mark
 * rather than nothing, which is the difference between "the sun is up" and
 * "the data ends here".
 */
const MIN_BAR_PCT = 5;

/**
 * The least clear space between two values' boxes, in pixels. With the 1px of
 * padding each box has, that is 4px between the digits of neighbours — more
 * than a word space, so "12,8 12,1" still reads as two numbers.
 */
const VALUE_GAP_PX = 2;

const HOUR_S = 3600;

let dom = null;

/** @type {ResizeObserver|null} Refits the values whenever the strip's width changes. */
let watcher = null;

/** Caches the strip's elements once the DOM exists. */
function elements() {
    if (!dom) {
        dom = {
            block: document.getElementById('forecast'),
            peak: document.getElementById('forecast-peak'),
            chart: document.getElementById('forecast-chart'),
            times: document.getElementById('forecast-times'),
        };
    }
    return dom;
}

/**
 * Index of the hour that contains an instant, or -1 when the series does not
 * cover it — which is what the series looks like just after midnight, until
 * the next fetch replaces yesterday with today.
 *
 * @param {{time: number}[]} hourly - epoch seconds, ascending
 * @param {number} nowSec - epoch seconds
 * @returns {number}
 */
export function hourAt(hourly, nowSec) {
    return hourly.findIndex((h) => nowSec >= h.time && nowSec < h.time + HOUR_S);
}

/**
 * The day's highest hour. The first of equal values, so a plateau is named by
 * when it starts.
 *
 * @param {{time: number, uv: number}[]} hourly
 * @returns {{time: number, uv: number}|null}
 */
export function peakOf(hourly) {
    if (!hourly.length) return null;
    return hourly.reduce((best, h) => (h.uv > best.uv ? h : best));
}

/**
 * A bar's height as a share of the chart.
 *
 * Zero is decided on the ROUNDED value, like the band and the number: an hour
 * of 0.04 is "0.0" wherever it is written, so it gets no bar — a bar with
 * "0.0" printed on top of it would be a picture contradicting its own label.
 *
 * @param {number} uv
 * @param {number} scaleUv - the index drawn at full height
 * @returns {number} 0–100
 */
export function barHeightPct(uv, scaleUv) {
    if (roundUv(uv) <= 0) return 0;
    return Math.max(MIN_BAR_PCT, Math.min(100, (uv / scaleUv) * 100));
}

/**
 * The hours the strip draws: from the first whose value rounds above 0.0 to
 * the last, inclusive, or `null` for a day the sun puts no UV into at all.
 *
 * The night is left off rather than drawn as empty slots. Twenty-four slots
 * across a phone are 11–14px each, and a value like "7,5" set upright is
 * about 14px wide, so a whole day's values could only be read turned on end.
 * The sunlit hours are half the day or less almost everywhere, and every
 * night hour dropped is width handed to an hour that has something to say.
 *
 * @param {{uv: number}[]} hourly
 * @returns {{start: number, end: number}|null} indices into `hourly`
 */
export function sunlitWindow(hourly) {
    let start = -1;
    let end = -1;
    hourly.forEach((h, i) => {
        if (roundUv(h.uv) <= 0) return;
        if (start === -1) start = i;
        end = i;
    });
    return start === -1 ? null : { start, end };
}

/**
 * Which of `count` columns go quiet when there is no room for all their
 * values: every other one, counted out from `keep`, so the column at `keep`
 * — the peak — always keeps its number.
 *
 * @param {number} count
 * @param {number} keep
 * @returns {boolean[]}
 */
export function alternateQuiet(count, keep) {
    return Array.from({ length: count }, (_, i) => Math.abs(i - keep) % 2 === 1);
}

/**
 * Draws the strip for a series, or hides it when there is nothing to draw —
 * no series, or a day without sun.
 *
 * @param {{time: number, uv: number}[]} hourly - today, hour by hour
 * @param {string|null} timezone - IANA zone the hours are labelled in
 */
export function renderForecast(hourly, timezone) {
    const el = elements();
    if (!el.block) return;

    const lit = sunlitWindow(hourly);
    if (!lit) {
        el.block.hidden = true;
        return;
    }

    const zone = timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
    const locale = localeTag();
    // h23 rather than hour12:false, which some engines render midnight as 24:00 under.
    const clock = new Intl.DateTimeFormat(locale, {
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
        timeZone: zone,
    });
    const hourOnly = new Intl.DateTimeFormat(locale, {
        hour: '2-digit',
        hourCycle: 'h23',
        timeZone: zone,
    });
    const at = (h) => clock.format(new Date(h.time * 1000));

    const top = peakOf(hourly);
    const scale = Math.max(SCALE_UV, top.uv);
    const shown = hourly.slice(lit.start, lit.end + 1);

    const columns = shown.map((h) => {
        const band = uvBand(h.uv);
        const height = `${barHeightPct(h.uv, scale)}%`;

        // One column per hour holding its bar and its value, so the two dim
        // together and a hover on either names the hour.
        const column = document.createElement('span');
        column.className = 'forecast-hour';
        column.classList.toggle('is-peak', h === top);
        column.title = `${at(h)} · ${formatUv(h.uv, locale)} · ${t('band.' + band.id)}`;

        const bar = document.createElement('span');
        bar.className = 'forecast-bar';
        bar.style.height = height;
        // Straight from the band table, like the wash and the legend, so a bar
        // cannot be a colour the map would not turn.
        bar.style.backgroundColor = band.fill;
        column.append(bar);

        // The value stands on the tip of its own bar: its bottom is the bar's
        // height, so the numbers trace the same curve the bars draw. An hour
        // inside the window that rounds to zero has no bar and gets none.
        if (height !== '0%') {
            const value = document.createElement('span');
            value.className = 'forecast-value';
            value.style.bottom = height;
            value.textContent = formatUv(h.uv, locale);
            column.append(value);
        }

        return column;
    });

    // Each bar's own hour under it, in the location's clock. With the night
    // left off, the strip no longer starts at midnight, so a ruler of round
    // hours would leave the eye counting; one label per bar does not.
    const times = shown.map((h) => {
        const time = document.createElement('span');
        time.className = 'forecast-time';
        time.textContent = hourOnly.format(new Date(h.time * 1000));
        return time;
    });

    const now = document.createElement('span');
    now.className = 'now-line';
    now.setAttribute('aria-hidden', 'true');

    el.chart.replaceChildren(...columns, now);
    el.times.replaceChildren(...times);

    // Fitting depends on the strip's width, and that changes for reasons of
    // its own — a rotation, a resized window, the card appearing for the
    // first time — not all of which a window `resize` event reports.
    if (!watcher && typeof ResizeObserver === 'function') {
        watcher = new ResizeObserver(() => fitForecast());
        watcher.observe(el.chart);
    }

    const peak = `${t('forecast.peak')} ${formatUv(top.uv, locale)} · ${at(top)}`;
    el.peak.textContent = peak;
    // The bars are pictures; this is the one sentence a screen reader gets.
    el.chart.setAttribute('aria-label', `${t('forecast.title')}: ${peak}`);

    el.block.hidden = false;
    refreshForecast(hourly);
}

/**
 * Moves "now" along the strip: dims the hours that have passed — bar, value
 * and hour together — and places the line. Run from the clock tick, on the
 * columns that are already there; the series itself only changes when a
 * fetch does.
 *
 * Before the first sunlit hour and after the last, the line has nowhere to
 * go on a strip that only spans the sun's hours, so it is hidden: in the
 * morning nothing is dimmed yet, in the evening everything is.
 *
 * @param {{time: number, uv: number}[]} hourly - the series the strip was drawn from
 */
export function refreshForecast(hourly) {
    const el = elements();
    if (!el.block || el.block.hidden) return;

    const lit = sunlitWindow(hourly);
    const columns = el.chart.querySelectorAll('.forecast-hour');
    const times = el.times.querySelectorAll('.forecast-time');
    const line = el.chart.querySelector('.now-line');
    if (!lit || !line || columns.length !== lit.end - lit.start + 1) return;

    const nowSec = Date.now() / 1000;
    columns.forEach((column, i) => {
        const past = hourly[lit.start + i].time + HOUR_S <= nowSec;
        column.classList.toggle('is-past', past);
        times[i]?.classList.toggle('is-past', past);
    });

    const index = hourAt(hourly, nowSec);
    const current = index - lit.start;
    const inside = index !== -1 && current >= 0 && current < columns.length;
    line.hidden = !inside;
    if (!inside) return;

    // Bars share the width equally, so an hour is 1/n of it and the minutes
    // into the hour are a fraction of that.
    const fraction = (nowSec - hourly[lit.start + current].time) / HOUR_S;
    line.style.left = `${((current + fraction) / columns.length) * 100}%`;
}

/**
 * Makes every value fit upright, side by side, at the width the card has.
 *
 * Measured rather than predicted — the widths depend on the phone's own font.
 * The sunlit hours fit at full size nearly everywhere; when they do not, the
 * values first drop from 11px to 10px, and if that is still not enough — the
 * tropics' four-character values on the narrowest phones, or a polar
 * summer's twenty-four sunlit hours — every other value and its hour go
 * quiet, counted out from the peak so the day's highest number always stays.
 * The bars stay whole either way, and a hover still names every hour.
 *
 * It needs the strip laid out, so it runs after the card is on screen and
 * whenever the strip's width changes. Without layout — a hidden card, a
 * test's DOM — every box measures zero and it does nothing.
 */
export function fitForecast() {
    const el = elements();
    if (!el.block || el.block.hidden) return;
    if (!el.chart.getBoundingClientRect().width) return;

    const columns = [...el.chart.querySelectorAll('.forecast-hour')];
    const times = [...el.times.querySelectorAll('.forecast-time')];
    const quiet = (flags) =>
        columns.forEach((column, i) => {
            column.classList.toggle('is-quiet', flags[i]);
            times[i]?.classList.toggle('is-quiet', flags[i]);
        });

    el.chart.classList.remove('is-compact');
    quiet(columns.map(() => false));
    if (!crowded(columns)) return;

    el.chart.classList.add('is-compact');
    if (!crowded(columns)) return;

    const peak = Math.max(
        0,
        columns.findIndex((column) => column.classList.contains('is-peak')),
    );
    quiet(alternateQuiet(columns.length, peak));
}

/**
 * Whether any two neighbouring values that are showing sit closer than
 * `VALUE_GAP_PX`.
 *
 * @param {Element[]} columns
 * @returns {boolean}
 */
function crowded(columns) {
    const boxes = columns
        .filter((column) => !column.classList.contains('is-quiet'))
        .map((column) => column.querySelector('.forecast-value'))
        .filter(Boolean)
        .map((value) => value.getBoundingClientRect());
    return boxes.some((box, i) => i > 0 && boxes[i - 1].right + VALUE_GAP_PX > box.left);
}
