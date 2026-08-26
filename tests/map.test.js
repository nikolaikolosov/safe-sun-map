import { describe, expect, it } from 'vitest';

import { TILE_ATTRIBUTION, TILE_URL } from '../src/map.js';

/**
 * The basemap is the one dependency that can fail without failing: CARTO began
 * answering with an "API KEY REQUIRED" watermark under HTTP 200, and the app
 * had no way to notice. These do not test that the tiles are alive — nothing
 * offline can — they pin the terms the current server is used under, so a
 * future edit cannot quietly drop out of compliance.
 *
 * @see https://operations.osmfoundation.org/policies/tiles/
 */
describe('basemap', () => {
    it('uses the exact host the OSM tile policy names', () => {
        expect(TILE_URL).toBe('https://tile.openstreetmap.org/{z}/{x}/{y}.png');
    });

    it('does not rotate subdomains', () => {
        // `{s}` spreads load across a.,b.,c. hostnames that this server does not
        // publish; the policy asks for the single host above.
        expect(TILE_URL).not.toContain('{s}');
    });

    it('asks only for tiles the server actually has', () => {
        // No `{r}` — there is no @2x variant, and requesting one is a 404 per
        // tile on every retina phone.
        expect(TILE_URL).not.toContain('{r}');
    });

    it('is fetched over HTTPS', () => {
        expect(TILE_URL.startsWith('https://')).toBe(true);
    });

    it('credits OpenStreetMap, which the licence requires', () => {
        expect(TILE_ATTRIBUTION).toContain('OpenStreetMap');
        expect(TILE_ATTRIBUTION).toContain('https://www.openstreetmap.org/copyright');
    });
});
