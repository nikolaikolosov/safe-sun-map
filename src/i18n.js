/**
 * Copy in the three languages this studio ships (en/es/ru), picked from the
 * browser and never switchable.
 *
 * No language switcher on purpose: the answer this page gives is a colour, and
 * a chooser would be the second-largest control on a screen whose whole point
 * is that it has almost none. Anything the wash cannot say is one short line.
 */

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
        'a11y.map': 'World map showing your location',
        'a11y.recentre': 'Centre the map on my location',
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
        'a11y.map': 'Mapa del mundo con tu ubicación',
        'a11y.recentre': 'Centrar el mapa en mi ubicación',
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
        'a11y.map': 'Карта мира с вашим местоположением',
        'a11y.recentre': 'Показать моё местоположение',
    },
};

/**
 * The language actually in use, resolved once at load.
 *
 * Read through `globalThis` so the module can be imported by the test runner,
 * which has no browser `navigator` worth speaking of.
 */
export const LANG = resolveLang(
    globalThis.navigator?.languages ?? [globalThis.navigator?.language ?? 'en'],
);

/**
 * First supported language among the browser's preferences, else English.
 * Matches on the primary subtag, so `ru-BY` and `es-UY` resolve like `ru`/`es`.
 *
 * @param {readonly string[]} preferences
 * @returns {'en'|'es'|'ru'}
 */
export function resolveLang(preferences) {
    for (const tag of preferences) {
        const primary = String(tag).toLowerCase().split('-')[0];
        if (Object.hasOwn(STRINGS, primary)) return primary;
    }
    return 'en';
}

/**
 * Look up a string. Missing keys fall back to English and then to the key
 * itself — a visible key in the UI is a bug report; a blank space is not.
 *
 * @param {string} key
 * @returns {string}
 */
export function t(key) {
    return STRINGS[LANG][key] ?? STRINGS.en[key] ?? key;
}
