import { describe, expect, it } from 'vitest';

import { TILE_ATTRIBUTION, TILE_URL } from '../src/map.js';

/**
 * The basemap is the one dependency that can fail without failing: CARTO began
 * answering with an "API KEY REQUIRED" watermark under HTTP 200, and the app
 * had no way to notice. These do not test that the tiles are alive — nothing
 * offline can — they pin the shape of the request and the credit it carries, so
 * a future edit cannot silently break either.
 */
describe('basemap', () => {
    it('points at Esri World Light Gray Base, the same tiles as the Montevideo map', () => {
        expect(TILE_URL).toBe(
            'https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/' +
                'World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
        );
    });

    it('keeps Esri’s row-before-column axis order', () => {
        // The single easiest thing to get wrong here. Esri's MapServer is
        // {z}/{y}/{x}; the usual tile template is {z}/{x}/{y}, and swapping
        // them returns real-looking tiles of entirely the wrong places.
        expect(TILE_URL.endsWith('/{z}/{y}/{x}')).toBe(true);
        expect(TILE_URL).not.toContain('{z}/{x}/{y}');
    });

    it('asks one host for tiles it actually has', () => {
        // No `{s}`: Esri publishes no rotation subdomains. No `{r}`: no @2x
        // variant, so retina phones would take a 404 per tile.
        expect(TILE_URL).not.toContain('{s}');
        expect(TILE_URL).not.toContain('{r}');
    });

    it('is fetched over HTTPS', () => {
        expect(TILE_URL.startsWith('https://')).toBe(true);
    });

    it('credits both Esri and OpenStreetMap, as the terms require', () => {
        expect(TILE_ATTRIBUTION).toContain('Esri');
        expect(TILE_ATTRIBUTION).toContain('OpenStreetMap');
        expect(TILE_ATTRIBUTION).toContain('https://www.openstreetmap.org/copyright');
    });
});
