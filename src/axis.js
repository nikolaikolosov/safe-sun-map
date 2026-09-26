/**
 * Hour ticks under the daylight bar's 24 hours.
 *
 * The UV strip used to share this ruler, one card up at the same width. It
 * now spans only the sunlit hours, to give each hour room for its value
 * upright, and labels every bar with its own hour instead.
 */

/**
 * Every three hours: a phase boundary is read to the hour, and with a tick
 * only every six the eye had to count to find it. Nine two-digit labels fit
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
