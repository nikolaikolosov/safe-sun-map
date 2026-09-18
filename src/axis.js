/**
 * Hour ticks under a 24-hour strip.
 *
 * Shared by the UV chart and the daylight bar, which sit one above the other
 * at the same width: the same ruler under both is what lets the eye carry a
 * time from one to the other.
 */

/**
 * Every three hours. Six was enough to read the daylight bar by, but the UV
 * strip is read for an hour — "until 15", "after 16" — and with a tick only
 * every six the eye had to count bars to find it. Nine two-digit labels fit
 * the card's width with room between them; twenty-five would not.
 */
const AXIS_HOURS = [0, 3, 6, 9, 12, 15, 18, 21, 24];

/**
 * Ticks positioned by their real place on the axis rather than distributed,
 * so they line up with whatever is drawn above them.
 *
 * @param {Element} target
 */
export function renderHourAxis(target) {
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
