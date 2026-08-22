import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        // The i18n runtime touches `document` and `localStorage`, and the
        // switcher is only meaningful against a DOM.
        environment: 'jsdom',
    },
});
