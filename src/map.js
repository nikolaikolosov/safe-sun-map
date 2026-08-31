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
 */
export const TILE_MAX_ZOOM = 16;

/**
 * The one scale this map is ever drawn at: four steps back from the deepest
 * tiles Esri has.
 *
 * There is no zooming here at all — no control, no pinch, no wheel, no
 * double-tap — and no panning either. A UV reading is the same number over a
 * whole city, so moving or rescaling the map offers choices that change
 * nothing about the answer while adding ways to end up looking at the wrong
 * place.
 *
 * `minZoom` and `maxZoom` are both pinned to it rather than only the handlers
 * being switched off, so every remaining route to a zoom — the keyboard's +/−,
 * an accessibility gesture, a future call to `setView` with the wrong second
 * argument — is clamped to a no-op instead of relied upon not to fire.
 */
export const FIXED_ZOOM = TILE_MAX_ZOOM - 4;

/**
 * Where the map sits before geolocation answers, and where it stays for anyone
 * who refuses it.
 *
 * It used to be the whole world at zoom 2, which a single-scale map can no
 * longer show. Any fixed coordinate is arbitrary, so this one is at least
 * legible: the prime meridian at Greenwich, land and coastline rather than the
 * blank ocean that [10, 0] would have given. The card in front of it says why
 * there is nothing better to show.
 */
const FALLBACK_CENTER = [51.4826, 0.0077];

/** @type {L.Map|null} */
let map = null;
/** @type {L.Marker|null} */
let marker = null;
/** @type {L.Circle|null} */
let accuracyCircle = null;

/**
 * Builds the map in `#map` and returns it.
 *
 * @param {{onHelp: () => void}} handlers
 * @returns {L.Map}
 */
export function initMap({ onHelp }) {
    map = L.map('map', {
        center: FALLBACK_CENTER,
        zoom: FIXED_ZOOM,
        minZoom: FIXED_ZOOM,
        maxZoom: FIXED_ZOOM,
        // Nothing the visitor can move. The map is a picture of one place at
        // one scale: the dot sits where the layout puts it, and a view that
        // could be dragged or zoomed away from that is a view that can be
        // wrong. Off at the source as well as clamped by min/max above, so no
        // single missed handler is load-bearing.
        dragging: false,
        keyboard: false,
        zoomControl: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        touchZoom: false,
        boxZoom: false,
        attributionControl: true,
    });

    L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: FIXED_ZOOM }).addTo(map);
    map.attributionControl.setPrefix('');

    // Only the help button left. The recentre control went with dragging:
    // once the map cannot be moved off the visitor, there is nowhere to come
    // back from, and a button that always did nothing would be worse than none.
    addBarControl({ glyph: 'i', className: 'help-open', key: 'help.open', onClick: onHelp });

    return map;
}

/**
 * A button in the bottom-right corner, styled as a Leaflet bar. Only the help
 * control uses it now, but it costs nothing to keep general.
 *
 * @param {{glyph: string, className: string, key: string, onClick: () => void}} spec
 */
function addBarControl({ glyph, className, key, onClick }) {
    const control = L.control({ position: 'bottomright' });

    control.onAdd = () => {
        const container = L.DomUtil.create('div', `leaflet-bar ${className}`);
        // The map ignores gestures now, but a tap that falls through still
        // lands on the container and can start a text selection over it.
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
 * Draws the "you are here" dot and its accuracy halo, and moves the map so the
 * dot lands on a given line of the screen.
 *
 * With panning gone the camera is no longer something the visitor shares, so
 * the view is set on every call rather than only on the first fix: the dot's
 * place on screen is a layout decision now, and layout changes — a rotation, a
 * language with a taller card.
 *
 * @param {number} lat
 * @param {number} lon
 * @param {number} accuracy - metres
 * @param {number} anchorY - where the dot should sit, in pixels from the top
 */
export function showUser(lat, lon, accuracy, anchorY) {
    const latlng = L.latLng(lat, lon);

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

    map.setView(centreFor(latlng, anchorY), FIXED_ZOOM, { animate: false });
}

/**
 * The centre that puts `latlng` at the middle of the screen horizontally and
 * on the line `anchorY` vertically.
 *
 * A point's screen position is `world − centreWorld + size / 2`, so pinning
 * that to the place we want and solving for the centre gives
 * `centreWorld = world + size / 2 − wanted`.
 *
 * @param {L.LatLng} latlng
 * @param {number} anchorY
 * @returns {L.LatLng}
 */
function centreFor(latlng, anchorY) {
    const size = map.getSize();
    const wanted = L.point(size.x / 2, anchorY);
    const world = map.project(latlng, FIXED_ZOOM);
    return map.unproject(world.add(size.divideBy(2)).subtract(wanted), FIXED_ZOOM);
}
