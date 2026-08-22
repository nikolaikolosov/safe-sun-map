/**
 * Copy in three languages with a tiny runtime — no framework.
 *
 * English is the base language and the fallback for any missing key; the
 * dictionary-completeness test keeps all three in sync, so the fallback only
 * ever covers programmer error and never ships silently.
 *
 * The Spanish register is Uruguayan (voseo: `necesitás`, `Buscá`, `Quedate`),
 * matching the studio's other project. It reads slightly local elsewhere in the
 * Spanish-speaking world but is understood everywhere.
 */

export const LANGS = ['en', 'es', 'ru'];

/** BCP-47 tags for the Intl APIs — the clock and the decimal separator. */
export const LOCALE_TAGS = { en: 'en', es: 'es', ru: 'ru' };

const STORAGE_KEY = 'ssm-lang';

export const STRINGS = {
    en: {
        'band.low': 'Low',
        'band.moderate': 'Moderate',
        'band.high': 'High',
        'band.veryHigh': 'Very high',
        'band.extreme': 'Extreme',
        'advice.low': 'Safe. No protection needed.',
        'advice.moderate': 'Seek shade around midday. SPF 30.',
        'advice.high': 'Cover up: hat, sunglasses, SPF 30+.',
        'advice.veryHigh': 'Avoid the sun 11:00–16:00. SPF 50+.',
        'advice.extreme': 'Stay indoors. Unprotected skin burns in minutes.',
        'status.locating': 'Finding your location…',
        'status.loading': 'Reading the UV index…',
        'status.denied': 'Location is off. Allow it to see your UV index.',
        'status.unavailable': 'Location unavailable on this device.',
        'status.offline': 'No UV data — check your connection.',
        'status.retry': 'Retry',
        'label.uv': 'UV index',
        'lang.groupAria': 'Change language',
        'a11y.map': 'World map showing your location',
        'a11y.recentre': 'Centre the map on my location',
        'help.open': 'About the UV index',
        'help.close': 'Close',
        'help.title': 'The UV index',
        'help.what':
            "Shows the level of the sun's ultraviolet radiation at ground level. It starts " +
            'at 0 and has no upper limit. It is highest around midday. It rises in summer, ' +
            'closer to the equator, and out in the open near reflective surfaces such as ' +
            'water, sand or mountains. Light cloud barely lowers the UV index.',
        'help.levels': 'Levels',
        'help.effect':
            'Ultraviolet causes burns and, over the years, ageing of the skin and a raised ' +
            'risk of melanoma. It harms the eyes too. The higher the number, the less time ' +
            'unprotected skin can take: at 11 and above, a few minutes are enough to burn.',
        'help.source': 'Readings from Open-Meteo. Scale: the WHO/WMO Global Solar UV Index.',
        'support.label': 'Support the author',
        'support.aria': 'Support the author on Ko-fi (opens in a new tab)',
    },
    es: {
        'band.low': 'Bajo',
        'band.moderate': 'Moderado',
        'band.high': 'Alto',
        'band.veryHigh': 'Muy alto',
        'band.extreme': 'Extremo',
        'advice.low': 'Seguro. No necesitás protección.',
        'advice.moderate': 'Buscá sombra al mediodía. SPF 30.',
        'advice.high': 'Cubrite: gorro, lentes y SPF 30+.',
        'advice.veryHigh': 'Evitá el sol de 11 a 16. SPF 50+.',
        'advice.extreme': 'Quedate bajo techo. La piel se quema en minutos.',
        'status.locating': 'Buscando tu ubicación…',
        'status.loading': 'Leyendo el índice UV…',
        'status.denied': 'La ubicación está apagada. Activala para ver tu índice UV.',
        'status.unavailable': 'Ubicación no disponible en este dispositivo.',
        'status.offline': 'Sin datos UV — revisá tu conexión.',
        'status.retry': 'Reintentá',
        'label.uv': 'Índice UV',
        'lang.groupAria': 'Cambiar idioma',
        'a11y.map': 'Mapa del mundo con tu ubicación',
        'a11y.recentre': 'Centrar el mapa en mi ubicación',
        'help.open': 'Sobre el índice UV',
        'help.close': 'Cerrar',
        'help.title': 'El índice UV',
        'help.what':
            'Muestra el nivel de radiación ultravioleta del sol a nivel del suelo. Arranca ' +
            'en 0 y no tiene límite superior. Alcanza su máximo cerca del mediodía. Sube en ' +
            'verano, al acercarse al ecuador, y en espacios abiertos cerca de superficies ' +
            'reflectantes como el agua, la arena o la montaña. Una nubosidad liviana casi no ' +
            'baja el índice UV.',
        'help.levels': 'Niveles',
        'help.effect':
            'El ultravioleta provoca quemaduras y, con los años, envejecimiento de la piel y ' +
            'un mayor riesgo de melanoma. También daña los ojos. Cuanto más alto el número, ' +
            'menos aguanta la piel sin protección: con 11 o más, bastan unos pocos minutos ' +
            'para quemarse.',
        'help.source': 'Datos de Open-Meteo. Escala: Índice UV Solar Mundial de la OMS/OMM.',
        'support.label': 'Apoyar al autor',
        'support.aria': 'Apoyá al autor en Ko-fi (se abre en otra pestaña)',
    },
    ru: {
        'band.low': 'Низкий',
        'band.moderate': 'Умеренный',
        'band.high': 'Высокий',
        'band.veryHigh': 'Очень высокий',
        'band.extreme': 'Экстремальный',
        'advice.low': 'Безопасно. Защита не нужна.',
        'advice.moderate': 'В полдень — в тень. Крем SPF 30.',
        'advice.high': 'Защищайтесь: головной убор, очки, SPF 30+.',
        'advice.veryHigh': 'С 11:00 до 16:00 лучше не выходить. SPF 50+.',
        'advice.extreme': 'Оставайтесь дома. Кожа сгорает за минуты.',
        'status.locating': 'Определяем ваше местоположение…',
        'status.loading': 'Запрашиваем УФ-индекс…',
        'status.denied': 'Геолокация выключена. Разрешите её, чтобы увидеть УФ-индекс.',
        'status.unavailable': 'Геолокация недоступна на этом устройстве.',
        'status.offline': 'Нет данных об УФ — проверьте соединение.',
        'status.retry': 'Повторить',
        'label.uv': 'УФ-индекс',
        'lang.groupAria': 'Сменить язык',
        'a11y.map': 'Карта мира с вашим местоположением',
        'a11y.recentre': 'Показать моё местоположение',
        'help.open': 'Об УФ-индексе',
        'help.close': 'Закрыть',
        'help.title': 'УФ-индекс',
        'help.what':
            'Показывает уровень ультрафиолетового излучения Солнца у поверхности земли. ' +
            'Начинается с 0, верхней границы нет. Максимальное значение около полудня. ' +
            'Повышается летом, при приближении к экватору, а также на открытом пространстве ' +
            'рядом с отражающими поверхностями, такими как водная гладь, песок или горы. ' +
            'Лёгкая облачность почти не снижает УФ-индекс.',
        'help.levels': 'Уровни',
        'help.effect':
            'Ультрафиолет вызывает ожоги, а с годами — старение кожи и повышенный риск ' +
            'меланомы. Также вредит глазам. Чем выше число, тем меньше времени выдерживает ' +
            'незащищённая кожа: при 11 и выше достаточно нескольких минут для ожога.',
        'help.source': 'Данные: Open-Meteo. Шкала: глобальный солнечный УФ-индекс ВОЗ/ВМО.',
        'support.label': 'Поддержать автора',
        'support.aria': 'Поддержать автора на Ko-fi (откроется в новой вкладке)',
    },
};

/**
 * The language in force. English until `initLang` runs, so importing this
 * module never depends on a browser being present.
 */
let current = 'en';

/** @type {Set<(lang: string) => void>} Notified after every switch. */
const listeners = new Set();

/** @returns {'en'|'es'|'ru'} */
export function getLang() {
    return current;
}

/** The BCP-47 tag for the current language, for `Intl`. */
export function localeTag() {
    return LOCALE_TAGS[current];
}

/**
 * First supported language among a list of preferences, else English.
 * Matches on the primary subtag, so `ru-BY` and `es-UY` resolve like `ru`/`es`.
 *
 * @param {readonly string[]} preferences
 * @returns {'en'|'es'|'ru'}
 */
export function resolveLang(preferences) {
    for (const tag of preferences) {
        const primary = String(tag).toLowerCase().split('-')[0];
        // `includes` rather than `primary in STRINGS`: `in` also matches
        // Object.prototype keys, so a tag of "constructor" would resolve to a
        // language that does not exist.
        if (LANGS.includes(primary)) return primary;
    }
    return 'en';
}

/**
 * Switches language and tells everyone who asked.
 *
 * @param {string} lang
 * @param {{persist?: boolean}} [options] - `persist: false` for the initial
 *   resolution, which must not write back a choice the visitor never made
 */
export function setLang(lang, { persist = true } = {}) {
    if (!LANGS.includes(lang)) return;
    current = lang;

    if (persist) {
        try {
            localStorage.setItem(STORAGE_KEY, lang);
        } catch {
            // Private mode, or storage disabled — the choice just won't stick.
        }
    }

    // Screen readers and hyphenation both key off this; the copy on the card
    // changes language, so the document's declared language has to follow.
    if (globalThis.document) document.documentElement.lang = lang;

    for (const cb of listeners) cb(lang);
}

/**
 * Resolves the language for this visit: a previously chosen one first, then
 * the browser's preferences, English otherwise.
 *
 * A stored choice outranks the browser on purpose — someone who tapped RU on a
 * Spanish phone meant it, and having the page argue with them on every visit is
 * the whole reason the switcher exists.
 */
export function initLang() {
    let stored = null;
    try {
        stored = localStorage.getItem(STORAGE_KEY);
    } catch {
        // Storage unavailable — fall through to the browser's preferences.
    }

    if (LANGS.includes(stored)) {
        setLang(stored, { persist: false });
        return;
    }

    const preferences = globalThis.navigator?.languages ?? [globalThis.navigator?.language ?? 'en'];
    setLang(resolveLang(preferences), { persist: false });
}

/** @param {(lang: string) => void} cb - called after every language switch */
export function onLangChange(cb) {
    listeners.add(cb);
}

/**
 * Look up a string. Missing keys fall back to English and then to the key
 * itself — a visible key in the UI is a bug report; a blank space is not.
 *
 * @param {string} key
 * @returns {string}
 */
export function t(key) {
    return STRINGS[current][key] ?? STRINGS.en[key] ?? key;
}

/**
 * Re-translates the static DOM: `data-i18n` (text), `data-i18n-aria`
 * (aria-label) and `data-i18n-title` (title).
 *
 * Anything written by JS at runtime — the band name, the advice, the status
 * line — is redrawn by its own owner instead; this only covers markup that
 * carries its key with it.
 *
 * @param {ParentNode} [root]
 */
export function applyTranslations(root = document) {
    for (const el of root.querySelectorAll('[data-i18n]')) {
        el.textContent = t(el.dataset.i18n);
    }
    for (const el of root.querySelectorAll('[data-i18n-aria]')) {
        el.setAttribute('aria-label', t(el.dataset.i18nAria));
    }
    for (const el of root.querySelectorAll('[data-i18n-title]')) {
        el.title = t(el.dataset.i18nTitle);
    }
}
