import js from '@eslint/js';
import globals from 'globals';

export default [
    js.configs.recommended,
    {
        files: ['src/**/*.js'],
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: 'module',
            globals: {
                ...globals.browser,
                // Leaflet is loaded from a <script> tag, not imported.
                L: 'readonly',
            },
        },
        rules: {
            'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
        },
    },
    {
        // Vitest runs these in jsdom, so they see both worlds.
        files: ['tests/**/*.js'],
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: 'module',
            globals: {
                ...globals.node,
                ...globals.browser,
            },
        },
    },
    {
        files: ['*.config.js'],
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: 'module',
            globals: {
                ...globals.node,
            },
        },
    },
];
