import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';

import {
    LANGS,
    STRINGS,
    applyTranslations,
    getLang,
    initLang,
    localeTag,
    onLangChange,
    resolveLang,
    setLang,
    t,
} from '../src/i18n.js';

beforeEach(() => {
    localStorage.clear();
    setLang('en', { persist: false });
});

afterEach(() => {
    vi.unstubAllGlobals();
    // The storage-failure test spies on Storage.prototype; without this the
    // mock leaks and every later localStorage write throws.
    vi.restoreAllMocks();
});

describe('resolveLang', () => {
    it('matches on the primary subtag', () => {
        expect(resolveLang(['ru-RU'])).toBe('ru');
        expect(resolveLang(['es-UY'])).toBe('es');
        expect(resolveLang(['en-GB'])).toBe('en');
    });

    it('takes the first supported preference', () => {
        expect(resolveLang(['de', 'ru', 'en'])).toBe('ru');
    });

    it('falls back to English', () => {
        expect(resolveLang(['de'])).toBe('en');
        expect(resolveLang([])).toBe('en');
        // `in` would have matched these off Object.prototype and returned a
        // language that does not exist.
        expect(resolveLang(['constructor'])).toBe('en');
        expect(resolveLang(['toString'])).toBe('en');
    });
});

describe('setLang', () => {
    it('switches the language the strings come from', () => {
        setLang('ru');
        expect(getLang()).toBe('ru');
        expect(t('band.extreme')).toBe(STRINGS.ru['band.extreme']);
        expect(localeTag()).toBe('ru');
    });

    it('declares the language on the document, for screen readers', () => {
        setLang('es');
        expect(document.documentElement.lang).toBe('es');
    });

    it('ignores a language it does not have', () => {
        setLang('es');
        setLang('de');
        expect(getLang()).toBe('es');
    });

    it('remembers the choice, but not the initial resolution', () => {
        setLang('ru');
        expect(localStorage.getItem('ssm-lang')).toBe('ru');

        localStorage.clear();
        setLang('es', { persist: false });
        expect(localStorage.getItem('ssm-lang')).toBeNull();
    });

    it('survives storage being unavailable', () => {
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('QuotaExceededError');
        });
        expect(() => setLang('ru')).not.toThrow();
        expect(getLang()).toBe('ru');
    });

    it('notifies listeners', () => {
        const seen = [];
        onLangChange((lang) => seen.push(lang));
        setLang('es');
        setLang('ru');
        expect(seen).toEqual(['es', 'ru']);
    });
});

describe('initLang', () => {
    it('prefers a stored choice over the browser', () => {
        localStorage.setItem('ssm-lang', 'ru');
        vi.stubGlobal('navigator', { languages: ['es-UY', 'es'] });
        initLang();
        expect(getLang()).toBe('ru');
    });

    it('falls back to the browser when nothing was chosen', () => {
        vi.stubGlobal('navigator', { languages: ['es-UY', 'en'] });
        initLang();
        expect(getLang()).toBe('es');
    });

    it('ignores a stored value that is not a language we have', () => {
        localStorage.setItem('ssm-lang', 'klingon');
        vi.stubGlobal('navigator', { languages: ['ru-RU'] });
        initLang();
        expect(getLang()).toBe('ru');
    });

    it('does not write back a language the visitor never chose', () => {
        vi.stubGlobal('navigator', { languages: ['ru'] });
        initLang();
        expect(localStorage.getItem('ssm-lang')).toBeNull();
    });
});

describe('applyTranslations', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <p data-i18n="label.uv">UV index</p>
            <div data-i18n-aria="a11y.map" aria-label="World map showing your location"></div>
            <a data-i18n-title="a11y.recentre" title="Centre the map on my location">◎</a>
        `;
    });

    it('rewrites text, aria-labels and titles from their keys', () => {
        setLang('ru');
        applyTranslations();

        expect(document.querySelector('[data-i18n]').textContent).toBe(STRINGS.ru['label.uv']);
        expect(document.querySelector('[data-i18n-aria]').getAttribute('aria-label')).toBe(
            STRINGS.ru['a11y.map'],
        );
        expect(document.querySelector('[data-i18n-title]').title).toBe(STRINGS.ru['a11y.recentre']);
    });

    it('goes back again on a second switch', () => {
        setLang('ru');
        applyTranslations();
        setLang('en');
        applyTranslations();
        expect(document.querySelector('[data-i18n]').textContent).toBe(STRINGS.en['label.uv']);
    });
});

describe('copy', () => {
    it('says the same things in every language', () => {
        expect(Object.keys(STRINGS).sort()).toEqual([...LANGS].sort());

        const reference = Object.keys(STRINGS.en).sort();
        for (const [lang, strings] of Object.entries(STRINGS)) {
            expect(Object.keys(strings).sort(), `${lang} key set`).toEqual(reference);
            for (const [key, text] of Object.entries(strings)) {
                expect(text.trim(), `${lang}/${key}`).not.toBe('');
            }
        }
    });
});
