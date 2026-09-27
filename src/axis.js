/**
 * The time scale under the two strips.
 *
 * When there is a UV forecast, both strips are drawn against the same scale:
 * the hours the sun puts UV into (src/forecast.js decides which), handed to
 * the daylight card as well, so the two sit one above the other at the same
 * width, each hour labelled under both, and their lines at "now" meet. The
 * night is left off both — nothing on either strip happens in it.
 *
 * Without a forecast there is no UV strip to agree with, and the daylight bar
 * falls back to the whole day under a ruler of round hours.
 */

/**
 * The fallback ruler's ticks, every three hours: a phase boundary is read to
 * the hour, and with a tick only every six the eye had to count to find it.
 * Nine two-digit labels fit the card's width with room between them.
 */
const AXIS_HOURS = [0, 3, 6, 9, 12, 15, 18, 21, 24];

/**
 * @typedef {object} HourScale
 * @property {number} from - epoch seconds: the start of the first hour
 * @property {number} to - epoch seconds: the end of the last hour
 * @property {number[]} times - epoch seconds: the start of each hour
 */

/**
 * How far an instant is along a scale: 0 at the start of its first hour, 1
 * at the end of its last, below or above that when the instant is off it.
 *
 * The one function both lines at "now" are placed by, so the two can only
 * ever sit at the same fraction of the same width.
 *
 * @param {HourScale} scale
 * @param {number} nowSec - epoch seconds
 * @returns {number}
 */
export function scaleFraction(scale, nowSec) {
    return (nowSec - scale.from) / (scale.to - scale.from);
}

/**
 * A scale's hours as two-digit labels in the location's clock — "07". h23
 * rather than hour12:false, which some engines render midnight as 24 under.
 *
 * @param {number[]} times - epoch seconds
 * @param {string} timeZone
 * @param {string} locale
 * @returns {string[]}
 */
export function hourLabels(times, timeZone, locale) {
    const format = new Intl.DateTimeFormat(locale, {
        hour: '2-digit',
        hourCycle: 'h23',
        timeZone,
    }).format;
    return times.map((time) => format(new Date(time * 1000)));
}

/**
 * One label per hour of a scale, in a flex row whose gap is the UV bars' gap:
 * each label sits under its own bar, and one card down, under the same slice
 * of the daylight bar.
 *
 * @param {Element} target
 * @param {string[]} labels
 */
export function renderHourRow(target, labels) {
    target.className = 'hour-row';
    target.replaceChildren(
        ...labels.map((text) => {
            const label = document.createElement('span');
            label.className = 'hour-label';
            label.textContent = text;
            return label;
        }),
    );
}

/**
 * The fallback ruler under a whole day: ticks positioned by their real place
 * on the axis rather than distributed, so they line up with the bands above.
 *
 * @param {Element} target
 */
export function renderHourAxis(target) {
    target.className = 'hour-axis';
    target.replaceChildren(
        ...AXIS_HOURS.map((hour) => {
            const tick = document.createElement('span');
            tick.className = 'hour-tick';
            tick.style.left = `${(hour / 24) * 100}%`;
            tick.textContent = String(hour).padStart(2, '0');
            return tick;
        }),
    );
}
