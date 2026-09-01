import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    currentIndex,
    initDaylight,
    localMinutes,
    localSegments,
    refreshRemaining,
    remainingPhase,
    renderDaylight,
    zoneOffsetMin,
} from '../src/daylight.js';
import { sunPhases } from '../src/sun.js';

const MIN_PER_DAY = 1440;

const on = (y, m, d) => new Date(y, m - 1, d, 12, 0);
const clock = (min) =>
    `${String(Math.floor(Math.round(min) / 60)).padStart(2, '0')}:` +
    `${String(Math.round(min) % 60).padStart(2, '0')}`;

/** The card's own pipeline: phases → local axis. */
const axis = (date, lat, lon, zone) =>
    localSegments(sunPhases(date, lat, lon).phases, zoneOffsetMin(date, zone));

const MONTEVIDEO = [-34.9011, -56.1645, 'America/Montevideo'];
const LONGYEARBYEN = [78.2232, 15.6267, 'Arctic/Longyearbyen'];
// Kashgar: the far west of China, kept on Beijing time. Solar noon lands
// around 15:00 local, which is what pushes the phase run off the axis.
const KASHGAR = [39.4704, 75.9898, 'Asia/Shanghai'];

describe('zoneOffsetMin', () => {
    it('reads a fixed offset', () => {
        expect(zoneOffsetMin(new Date(Date.UTC(2026, 7, 31, 12)), 'America/Montevideo')).toBe(-180);
        expect(zoneOffsetMin(new Date(Date.UTC(2026, 7, 31, 12)), 'UTC')).toBe(0);
    });

    it('follows a zone across its own DST change', () => {
        const winter = zoneOffsetMin(new Date(Date.UTC(2026, 0, 15, 12)), 'Europe/Madrid');
        const summer = zoneOffsetMin(new Date(Date.UTC(2026, 6, 15, 12)), 'Europe/Madrid');
        expect(winter).toBe(60);
        expect(summer).toBe(120);
    });
});

describe('localSegments', () => {
    it('covers the axis exactly once, in order, with no gaps', () => {
        const segments = axis(on(2026, 8, 31), ...MONTEVIDEO);
        expect(segments[0].startMin).toBe(0);
        expect(segments[segments.length - 1].endMin).toBe(MIN_PER_DAY);
        for (let i = 1; i < segments.length; i++) {
            expect(segments[i].startMin).toBeCloseTo(segments[i - 1].endMin, 6);
        }
    });

    it('lays out the full twilight ladder for a mid-latitude day', () => {
        const segments = axis(on(2026, 8, 31), ...MONTEVIDEO);
        expect(segments.map((s) => s.id)).toEqual([
            'night',
            'astronomical',
            'nautical',
            'civil',
            'day',
            'civil',
            'nautical',
            'astronomical',
            'night',
        ]);
    });

    it('agrees with the published Montevideo times for the day', () => {
        // timeanddate.com for 31 Aug 2026: night→05:41, astro→06:10,
        // nautical→06:39, civil→07:05, daylight→18:25, and back down.
        const segments = axis(on(2026, 8, 31), ...MONTEVIDEO);
        const day = segments.find((s) => s.id === 'day');
        expect(clock(day.startMin)).toBe('07:05');
        expect(clock(day.endMin)).toBe('18:25');

        const bounds = segments.slice(0, 4).map((s) => clock(s.endMin));
        expect(bounds).toEqual(['05:41', '06:10', '06:39', '07:05']);
    });

    it('never merges the night before dawn with the night after dusk', () => {
        // They are the same phase and both touch an edge of the axis, but they
        // are different rows on the card and must not collapse into one.
        const nights = axis(on(2026, 8, 31), ...MONTEVIDEO).filter((s) => s.id === 'night');
        expect(nights).toHaveLength(2);
        expect(nights[0].startMin).toBe(0);
        expect(nights[1].endMin).toBe(MIN_PER_DAY);
    });

    it('still covers the axis where solar noon is hours from local noon', () => {
        // The phase run hangs off one end of the day and leaves the other bare;
        // the wrap is what fills it back in.
        const segments = axis(on(2026, 8, 31), ...KASHGAR);
        expect(segments[0].startMin).toBe(0);
        expect(segments[segments.length - 1].endMin).toBe(MIN_PER_DAY);
        for (let i = 1; i < segments.length; i++) {
            expect(segments[i].startMin).toBeCloseTo(segments[i - 1].endMin, 6);
        }
        // Kashgar's day genuinely runs late on the clock it keeps.
        const day = segments.find((s) => s.id === 'day');
        expect(day.startMin).toBeGreaterThan(7 * 60);
        expect(day.endMin).toBeGreaterThan(20 * 60);
    });

    it('fills the whole bar with daylight under the midnight sun', () => {
        const segments = axis(on(2026, 6, 21), ...LONGYEARBYEN);
        expect(segments).toHaveLength(1);
        expect(segments[0].id).toBe('day');
        expect(segments[0].startMin).toBe(0);
        expect(segments[0].endMin).toBe(MIN_PER_DAY);
    });

    it('tops the polar-night bar out at whatever twilight the sun reaches', () => {
        // Longyearbyen on the solstice: the sun peaks near −11.7°, so the day
        // climbs to nautical twilight and no further — no daylight, no civil.
        const segments = axis(on(2026, 12, 21), ...LONGYEARBYEN);
        const ids = segments.map((s) => s.id);
        expect(ids).toEqual(['night', 'astronomical', 'nautical', 'astronomical', 'night']);
        expect(ids).not.toContain('civil');
        expect(ids).not.toContain('day');
    });

    it('fills the whole bar with night where the sun never even nears the horizon', () => {
        // The pole on the solstice: peak altitude about −23°, under every
        // twilight threshold there is.
        const segments = axis(on(2026, 12, 21), 90, 0, 'UTC');
        expect(segments).toHaveLength(1);
        expect(segments[0].id).toBe('night');
        expect(segments[0].endMin - segments[0].startMin).toBe(MIN_PER_DAY);
    });

    it('shows a polar night that has civil light as a band around noon', () => {
        const segments = axis(on(2026, 2, 5), ...LONGYEARBYEN);
        expect(segments.map((s) => s.id)).toContain('civil');
        expect(segments.some((s) => s.id === 'day')).toBe(false);
        // Symmetric ladder up to civil and back down, bracketed by night.
        expect(segments[0].id).toBe('night');
        expect(segments[segments.length - 1].id).toBe('night');
    });

    it('drops phases too short to show a distinct minute', () => {
        for (const date of [on(2026, 6, 21), on(2026, 12, 21), on(2026, 3, 20)]) {
            for (const segment of axis(date, ...MONTEVIDEO)) {
                expect(Math.round(segment.endMin)).toBeGreaterThan(Math.round(segment.startMin));
            }
        }
    });
});

describe('initDaylight', () => {
    /** The disclosure on its own — the rest of the card plays no part here. */
    const mount = () => {
        document.body.innerHTML = '<details class="daylight-details"><summary></summary></details>';
        return document.querySelector('.daylight-details');
    };

    /** `toggle` is queued rather than dispatched inline, so let it land. */
    const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

    beforeEach(() => {
        localStorage.clear();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        document.body.innerHTML = '';
    });

    it('starts closed when nothing was ever chosen', () => {
        const details = mount();
        initDaylight();
        expect(details.open).toBe(false);
    });

    it('reopens a table that was left open', () => {
        localStorage.setItem('ssm-phases', 'open');
        const details = mount();
        initDaylight();
        expect(details.open).toBe(true);
    });

    it('remembers both directions', async () => {
        const details = mount();
        initDaylight();

        details.open = true;
        await settle();
        expect(localStorage.getItem('ssm-phases')).toBe('open');

        details.open = false;
        await settle();
        expect(localStorage.getItem('ssm-phases')).toBe('closed');
    });

    it('writes nothing for a visitor who never touched it', async () => {
        mount();
        initDaylight();
        await settle();
        expect(localStorage.getItem('ssm-phases')).toBeNull();
    });

    it('survives storage being unavailable, in both directions', async () => {
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('SecurityError');
        });
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('SecurityError');
        });

        const details = mount();
        expect(() => initDaylight()).not.toThrow();
        expect(details.open).toBe(false);

        details.open = true;
        await expect(settle()).resolves.not.toThrow();
    });

    it('does nothing when the card is not on the page', () => {
        document.body.innerHTML = '';
        expect(() => initDaylight()).not.toThrow();
    });
});

describe('localMinutes', () => {
    it('turns an instant into minutes since local midnight', () => {
        const noonUtc = new Date(Date.UTC(2026, 7, 31, 12, 0));
        expect(localMinutes(noonUtc, 0)).toBe(12 * 60);
        expect(localMinutes(noonUtc, -180)).toBe(9 * 60);
    });

    it('wraps rather than going negative across midnight', () => {
        const justAfterUtcMidnight = new Date(Date.UTC(2026, 7, 31, 0, 30));
        // UTC-3: still 21:30 the previous day.
        expect(localMinutes(justAfterUtcMidnight, -180)).toBe(21 * 60 + 30);
    });

    it('keeps the fraction, so a countdown rounds rather than truncates', () => {
        const withSeconds = new Date(Date.UTC(2026, 7, 31, 12, 0, 30));
        expect(localMinutes(withSeconds, 0)).toBeCloseTo(720.5, 6);
    });
});

describe('remainingPhase', () => {
    /** Montevideo, 31 Aug 2026 and the day after, as the card lays them out. */
    const today = axis(on(2026, 8, 31), ...MONTEVIDEO);
    const tomorrow = axis(on(2026, 9, 1), ...MONTEVIDEO);

    const at = (h, m = 0) => remainingPhase(today, tomorrow, h * 60 + m);

    it('counts down the daylight that is left', () => {
        // Daylight runs 07:05–18:25, so 12:00 leaves 6h25m.
        const left = at(12);
        expect(left.id).toBe('day');
        expect(Math.round(left.minutes)).toBe(6 * 60 + 25);
    });

    it('carries the evening night over midnight into tomorrow', () => {
        // Night starts 19:49 today and ends 05:40 tomorrow. At 21:00 the answer
        // is 8h40m — NOT the 3h that the segment ending at midnight would give.
        const left = at(21);
        expect(left.id).toBe('night');
        expect(left.minutes).toBeGreaterThan(8 * 60);
        expect(left.minutes).toBeLessThan(9 * 60);
        expect(Math.round(left.minutes)).not.toBe(3 * 60);
    });

    it('stops at the end of the current day once midnight has passed', () => {
        // 02:00, night ends 05:41 today: 3h41m, with nothing added from
        // tomorrow — the date change has already happened.
        const left = at(2);
        expect(left.id).toBe('night');
        expect(Math.round(left.minutes)).toBe(3 * 60 + 41);
    });

    it('meets itself across midnight: 23:59 and 00:01 differ by two minutes', () => {
        const before = remainingPhase(today, tomorrow, 23 * 60 + 59);
        // 00:01 the next day is the first minute of tomorrow's own axis, whose
        // night ends at tomorrow's dawn.
        const dayAfter = axis(on(2026, 9, 2), ...MONTEVIDEO);
        const after = remainingPhase(tomorrow, dayAfter, 1);
        expect(before.id).toBe('night');
        expect(after.id).toBe('night');
        expect(before.minutes - after.minutes).toBeCloseTo(2, 0);
    });

    it('names the twilight it is in', () => {
        // 18:35 is inside civil twilight, 18:25–18:51.
        const left = at(18, 35);
        expect(left.id).toBe('civil');
        expect(Math.round(left.minutes)).toBe(16);
    });

    it('has no answer for a polar day', () => {
        const polarToday = axis(on(2026, 6, 21), ...LONGYEARBYEN);
        const polarTomorrow = axis(on(2026, 6, 22), ...LONGYEARBYEN);
        expect(polarToday).toHaveLength(1);
        expect(remainingPhase(polarToday, polarTomorrow, 12 * 60)).toBeNull();
    });

    it('has no answer for a night that swallows the whole of tomorrow', () => {
        const polarToday = axis(on(2026, 12, 21), 90, 0, 'UTC');
        const polarTomorrow = axis(on(2026, 12, 22), 90, 0, 'UTC');
        expect(remainingPhase(polarToday, polarTomorrow, 12 * 60)).toBeNull();
    });

    it('never reports a negative or a whole-day remainder', () => {
        for (let minute = 0; minute < MIN_PER_DAY; minute += 7) {
            const left = remainingPhase(today, tomorrow, minute);
            expect(left).not.toBeNull();
            expect(left.minutes).toBeGreaterThan(0);
            expect(left.minutes).toBeLessThanOrEqual(MIN_PER_DAY);
        }
    });
});

describe('currentIndex', () => {
    const today = axis(on(2026, 8, 31), ...MONTEVIDEO);

    it('picks the night running INTO midnight when the evening is late', () => {
        // 21:27 in Montevideo: night since 19:49, the last row of the table.
        const i = currentIndex(today, 21 * 60 + 27);
        expect(today[i].id).toBe('night');
        expect(i).toBe(today.length - 1);
    });

    it('picks the night running OUT of midnight once the date has turned', () => {
        const i = currentIndex(today, 30);
        expect(today[i].id).toBe('night');
        expect(i).toBe(0);
    });

    it('lands inside the segment it names, right around the day', () => {
        for (let minute = 0; minute < MIN_PER_DAY; minute += 7) {
            const segment = today[currentIndex(today, minute)];
            expect(minute).toBeGreaterThanOrEqual(segment.startMin);
            expect(minute).toBeLessThan(segment.endMin);
        }
    });

    it('always names the phase the countdown is counting', () => {
        const tomorrow = axis(on(2026, 9, 1), ...MONTEVIDEO);
        for (let minute = 0; minute < MIN_PER_DAY; minute += 7) {
            expect(today[currentIndex(today, minute)].id).toBe(
                remainingPhase(today, tomorrow, minute).id,
            );
        }
    });

    it('has nothing to point at when there are no segments', () => {
        expect(currentIndex([], 720)).toBe(-1);
    });
});

describe('the row the clock is in', () => {
    const POSITION = { lat: MONTEVIDEO[0], lon: MONTEVIDEO[1] };
    const ZONE = MONTEVIDEO[2];

    // The card's own elements, mounted once: `renderDaylight` caches them on
    // first use, so a fresh body per test would leave it drawing into orphans.
    beforeAll(() => {
        document.body.innerHTML = [
            '<section id="daylight" hidden>',
            '<p id="daylight-place"></p>',
            '<p id="daylight-summary"></p>',
            '<div id="daylight-bar"></div>',
            '<div id="daylight-axis"></div>',
            '<details class="daylight-details">',
            '<summary class="daylight-toggle"></summary>',
            '<ul id="daylight-phases"></ul>',
            '</details>',
            '</section>',
        ].join('');
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    /** Montevideo is UTC-3, so local 21:27 is 00:27 UTC the next morning. */
    const pin = (hour, minute = 0) => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(Date.UTC(2026, 7, 31, hour + 3, minute)));
    };

    const rows = () => [...document.querySelectorAll('#daylight-phases li')];
    const marked = () => rows().filter((row) => row.classList.contains('is-now'));

    const drawAt = (hour, minute = 0) => {
        pin(hour, minute);
        renderDaylight(POSITION, ZONE);
        return rows();
    };

    it('bolds exactly one row, whatever the hour', () => {
        for (let hour = 0; hour < 24; hour += 1) {
            drawAt(hour, 13);
            expect(marked()).toHaveLength(1);
            vi.useRealTimers();
        }
    });

    it('bolds the LAST Night at 21:27', () => {
        const all = drawAt(21, 27);
        expect(marked()).toEqual([all[all.length - 1]]);
        // The last row's end renders as 00:00 — midnight named the way a clock does.
        expect(marked()[0].textContent).toContain('19:49–00:00');
    });

    it('bolds the FIRST Night after midnight', () => {
        const all = drawAt(0, 30);
        expect(marked()).toEqual([all[0]]);
        expect(marked()[0].textContent).toContain('00:00–');
    });

    it('bolds Daylight at noon, and only then', () => {
        drawAt(12);
        expect(marked()[0].querySelector('.daylight-dot').className).toContain('phase-day');
    });

    it('names the current row for a screen reader too', () => {
        drawAt(12);
        expect(rows().filter((row) => row.hasAttribute('aria-current'))).toEqual(marked());
    });

    it('moves the mark on the clock tick without rebuilding the table', () => {
        // 18:20 is daylight; sunset is 18:25 and civil twilight follows.
        const before = drawAt(18, 20);
        const wasMarked = marked()[0];

        pin(18, 30);
        refreshRemaining(POSITION, ZONE);

        expect(rows()).toEqual(before);
        expect(marked()).toHaveLength(1);
        expect(marked()[0]).not.toBe(wasMarked);
        expect(wasMarked.hasAttribute('aria-current')).toBe(false);
        expect(marked()[0].querySelector('.daylight-dot').className).toContain('phase-civil');
    });
});
