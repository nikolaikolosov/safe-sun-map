/**
 * The help sheet behind the ⓘ button: what the UV index is, the five levels,
 * and what it does to you. General knowledge only — anyone who wants the
 * details is better served by their health service than by a map.
 *
 * Built on the native `<dialog>`, which brings focus trapping, Esc-to-close and
 * inertness of the page behind it for free. Reimplementing those is where a
 * "small" modal stops being small.
 */

import { UV_BANDS, bandRanges } from './uv.js';
import { localeTag, onLangChange, t } from './i18n.js';

/** @type {HTMLDialogElement} */
let dialog;

/**
 * Wires the dialog and returns the opener for the map control to call.
 *
 * @returns {() => void}
 */
export function initHelp() {
    dialog = document.getElementById('help');

    renderLevels();
    // The rows are generated, so `applyTranslations` cannot reach them — the
    // band names AND the ranges (whose decimal separator is locale-dependent)
    // have to be rebuilt here.
    onLangChange(renderLevels);

    document.getElementById('help-close').addEventListener('click', () => dialog.close());

    // Click outside to dismiss. The dialog element's own box covers the whole
    // viewport when the backdrop is showing, so a click that lands on the
    // dialog ITSELF rather than on a child is a click on the backdrop.
    dialog.addEventListener('click', (event) => {
        if (event.target === dialog) dialog.close();
    });

    return () => dialog.showModal();
}

/** Rebuilds the colour legend from the band table. */
function renderLevels() {
    const list = document.getElementById('help-levels');
    if (!list) return;

    const ranges = bandRanges(localeTag());
    list.replaceChildren(
        ...UV_BANDS.map((band, i) => {
            const row = document.createElement('li');

            const swatch = document.createElement('span');
            swatch.className = 'help-swatch';
            swatch.style.backgroundColor = band.fill;
            swatch.setAttribute('aria-hidden', 'true');

            const range = document.createElement('span');
            range.className = 'help-range';
            range.textContent = ranges[i];

            const name = document.createElement('span');
            name.className = 'help-band';
            name.textContent = t('band.' + band.id);

            row.append(swatch, range, name);
            return row;
        }),
    );
}
