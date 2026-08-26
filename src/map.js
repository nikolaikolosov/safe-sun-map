/**
 * Everything Leaflet. This module draws; it never decides — the position comes
 * from `app.js`, the colour comes from `uv.js`.
 */

import { t } from './i18n.js';

/**
 * Esri's World Light Gray Base — no key, no account, and the same basemap the
 * studio's Montevideo map runs on, so the two projects fail and get fixed
 * together instead of drifting apart.
 *
 * It replaced CARTO's Positron, which began answering with an "API KEY
 * REQUIRED" watermark image under HTTP 200. Nothing errored; the map just
 * quietly turned into grey placeholder tiles. Whatever provider sits here next,
 * that is the failure to expect: a 200 carrying the wrong picture.
 *
 * Note the axis order — Esri's MapServer is `{z}/{y}/{x}`, row before column,
 * the reverse of the usual tile template. One host, no `{s}` rotation.
 *
 * Being a grey canvas by design, it needs no desaturation to keep the five
 * washes apart, which is the property this app actually depends on.
 */
export const TILE_URL =
    'https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/' +
    'World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}';
export const TILE_ATTRIBUTION =
    'Tiles &copy; <a href="https://www.esri.com/">Esri</a> — Esri, HERE, Garmin, &copy; ' +
    '<a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/**
 * Deepest zoom Esri has data for. Past it the server returns a grey "Map data
 * not yet available" placeholder — another 200 carrying the wrong picture.
 * `LOCATED_ZOOM` and the map's own `maxZoom` are both 16 today, so this is a
 * guard rather than a fix: raise either of those and Leaflet upscales the last
 * real tiles instead of papering the screen with that text.
 */
const TILE_MAX_NATIVE_ZOOM = 16;

/**
 * The world, before we know anything about the visitor — and the view anyone
 * who refuses location permission is left with. Centred low enough that the
 * continents rather than the Arctic fill a tall phone screen.
 */
const WORLD_VIEW = { center: [10, 0], zoom: 2 };

/**
 * City scale. `app.js` asks for a coarse position on purpose, so the fix can be
 * kilometres wide; zooming past this would promise a precision the dot does not
 * have, and the accuracy halo would fill the screen.
 */
const LOCATED_ZOOM = 11;

/** @type {L.Map|null} */
let map = null;
/** @type {L.Marker|null} */
let marker = null;
/** @type {L.Circle|null} */
let accuracyCircle = null;

/** Whether the camera has already been taken to the visitor's first fix. */
let centred = false;

/**
 * Builds the map in `#map` and returns it.
 *
 * @param {{onRecentre: () => void, onHelp: () => void}} handlers
 * @returns {L.Map}
 */
export function initMap({ onRecentre, onHelp }) {
    map = L.map('map', {
        center: WORLD_VIEW.center,
        zoom: WORLD_VIEW.zoom,
        minZoom: 2,
        maxZoom: 16,
        zoomControl: false,
        worldCopyJump: true,
        attributionControl: true,
    });

    L.tileLayer(TILE_URL, {
        attribution: TILE_ATTRIBUTION,
        maxZoom: 16,
        maxNativeZoom: TILE_MAX_NATIVE_ZOOM,
    }).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    map.attributionControl.setPrefix('');

    // Leaflet PREPENDS controls in the bottom corners, so the stack reads
    // bottom-up in the order added: zoom, then recentre above it, then help on
    // top. Least-used furthest from the thumb.
    //
    // A way back to yourself after panning matters more than it looks: without
    // it the map has a dead end — scroll off to another continent on a phone
    // and the only route home is a reload, which also throws away the reading.
    addBarControl({ glyph: '◎', className: 'recentre', key: 'a11y.recentre', onClick: onRecentre });
    addBarControl({ glyph: 'i', className: 'help-open', key: 'help.open', onClick: onHelp });

    return map;
}

/**
 * One button in the bottom-right stack, styled as a Leaflet bar so it sits
 * flush with the zoom control.
 *
 * @param {{glyph: string, className: string, key: string, onClick: () => void}} spec
 */
function addBarControl({ glyph, className, key, onClick }) {
    const control = L.control({ position: 'bottomright' });

    control.onAdd = () => {
        const container = L.DomUtil.create('div', `leaflet-bar ${className}`);
        // Without this a tap on the button also reaches the map underneath and
        // is read as a double-click zoom.
        L.DomEvent.disableClickPropagation(container);

        const button = L.DomUtil.create('a', '', container);
        button.href = '#';
        button.setAttribute('role', 'button');
        button.textContent = glyph;
        // The key travels with the element so `applyTranslations` re-labels it
        // on a language switch, the same as the markup in index.html.
        button.dataset.i18nAria = key;
        button.dataset.i18nTitle = key;
        button.title = t(key);
        button.setAttribute('aria-label', t(key));

        L.DomEvent.on(button, 'click', (event) => {
            L.DomEvent.stop(event);
            onClick();
        });
        return container;
    };

    control.addTo(map);
}

/**
 * Draws (or moves) the "you are here" dot and its accuracy halo, and takes the
 * camera there once — on the FIRST fix only.
 *
 * Re-centring on every fix would fight anyone who panned away to look at where
 * they are going, and the reading on the card is theirs either way.
 *
 * @param {number} lat
 * @param {number} lon
 * @param {number} accuracy - metres
 */
export function showUser(lat, lon, accuracy) {
    const latlng = [lat, lon];

    if (marker && accuracyCircle) {
        marker.setLatLng(latlng);
        accuracyCircle.setLatLng(latlng).setRadius(accuracy);
    } else {
        accuracyCircle = L.circle(latlng, {
            radius: accuracy,
            color: '#1d4ed8',
            weight: 1,
            opacity: 0.5,
            fillColor: '#1d4ed8',
            fillOpacity: 0.1,
            interactive: false,
        }).addTo(map);

        marker = L.marker(latlng, {
            icon: L.divIcon({
                className: '',
                html: '<div class="user-dot"></div>',
                iconSize: [18, 18],
                iconAnchor: [9, 9],
            }),
            interactive: false,
            keyboard: false,
            zIndexOffset: 1000,
        }).addTo(map);
    }

    if (!centred) {
        centred = true;
        map.setView(latlng, LOCATED_ZOOM);
    }
}

/** Takes the camera back to the last known position, if there is one. */
export function recentre() {
    if (!map || !marker) return;
    map.setView(marker.getLatLng(), LOCATED_ZOOM);
}
