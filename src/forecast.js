/**
 * The hourly strip on the UV card: today's index hour by hour as bars in the
 * band colours, the hours already gone dimmed, and a line at "now".
 *
 * It answers the question the single number cannot — not "is it safe" but
 * "when". Whether to wait an hour, or go now before it climbs, is read off the
 * shape of the day in the same five colours the map is washed with.
 */

import { formatUv, uvBand } from './uv.js';
import { localeTag, t } from './i18n.js';
import { renderHourAxis } from './axis.js';

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

const HOUR_S = 3600;

let dom = null;

/** Caches the strip's elements once the DOM exists. */
function elements() {
    if (!dom) {
        dom = {
            block: document.getElementById('forecast'),
            peak: document.getElementById('forecast-peak'),
            chart: document.getElementById('forecast-chart'),
            axis: document.getElementById('forecast-axis'),
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
 * @param {number} uv
 * @param {number} scaleUv - the index drawn at full height
 * @returns {number} 0–100
 */
export function barHeightPct(uv, scaleUv) {
    if (uv <= 0) return 0;
    return Math.max(MIN_BAR_PCT, Math.min(100, (uv / scaleUv) * 100));
}

/**
 * Draws the strip for a series, or hides it when there is none.
 *
 * @param {{time: number, uv: number}[]} hourly - today, hour by hour
 * @param {string|null} timezone - IANA zone the hours are labelled in
 */
export function renderForecast(hourly, timezone) {
    const el = elements();
    if (!el.block) return;

    if (!hourly.length) {
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
    const at = (h) => clock.format(new Date(h.time * 1000));

    const top = peakOf(hourly);
    const scale = Math.max(SCALE_UV, top.uv);

    const bars = hourly.map((h) => {
        const band = uvBand(h.uv);
        const bar = document.createElement('span');
        bar.className = 'forecast-bar';
        bar.style.height = `${barHeightPct(h.uv, scale)}%`;
        // Straight from the band table, like the wash and the legend, so a bar
        // cannot be a colour the map would not turn.
        bar.style.backgroundColor = band.fill;
        bar.title = `${at(h)} · ${formatUv(h.uv, locale)} · ${t('band.' + band.id)}`;
        return bar;
    });

    const now = document.createElement('span');
    now.className = 'forecast-now';
    now.setAttribute('aria-hidden', 'true');

    el.chart.replaceChildren(...bars, now);
    renderHourAxis(el.axis);

    // A day with no sun at all has no peak worth naming.
    const peak = top.uv > 0 ? `${t('forecast.peak')} ${formatUv(top.uv, locale)} · ${at(top)}` : '';
    el.peak.textContent = peak;
    // The bars are pictures; this is the one sentence a screen reader gets.
    el.chart.setAttribute(
        'aria-label',
        peak ? `${t('forecast.title')}: ${peak}` : t('forecast.title'),
    );

    el.block.hidden = false;
    refreshForecast(hourly);
}

/**
 * Moves "now" along the strip: dims the hours that have passed and places the
 * line. Run from the clock tick, on the bars that are already there — the
 * series itself only changes when a fetch does.
 *
 * @param {{time: number, uv: number}[]} hourly - the series the strip was drawn from
 */
export function refreshForecast(hourly) {
    const el = elements();
    if (!el.block || el.block.hidden) return;

    const bars = el.chart.querySelectorAll('.forecast-bar');
    const line = el.chart.querySelector('.forecast-now');
    if (bars.length !== hourly.length || !line) return;

    const nowSec = Date.now() / 1000;
    bars.forEach((bar, i) => bar.classList.toggle('is-past', hourly[i].time + HOUR_S <= nowSec));

    const current = hourAt(hourly, nowSec);
    line.hidden = current === -1;
    if (current === -1) return;

    // Bars share the width equally, so an hour is 1/n of it and the minutes
    // into the hour are a fraction of that.
    const fraction = (nowSec - hourly[current].time) / HOUR_S;
    line.style.left = `${((current + fraction) / hourly.length) * 100}%`;
}
