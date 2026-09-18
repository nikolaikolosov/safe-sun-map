/**
 * Hour ticks under a 24-hour strip.
 *
 * Shared by the UV chart and the daylight bar, which sit one above the other
 * at the same width: the same ruler under both is what lets the eye carry a
 * time from one to the other.
 */

/** Every six hours is enough to read a day by. */
const AXIS_HOURS = [0, 6, 12, 18, 24];

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
