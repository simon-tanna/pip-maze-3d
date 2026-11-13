import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'playwright-report', 'test-results', 'public', 'blender'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // src/core is pure game logic: no three.js, no DOM. Keeps it unit-testable in Node.
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [{ group: ['three', 'three/*'], message: 'src/core must stay three.js-free.' }],
        },
      ],
      'no-restricted-globals': ['error', 'window', 'document', 'localStorage'],
    },
  },
  {
    // src/game orchestrates through interfaces it declares; main.ts wires render/ui in.
    files: ['src/game/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['three', 'three/*'], message: 'src/game must stay three.js-free.' },
            { group: ['@render/*', '@ui/*'], message: 'src/game may not import render or ui.' },
          ],
        },
      ],
    },
  },
  {
    // src/ui is the DOM HUD: it reacts to simulation events and gets `project()` injected.
    files: ['src/ui/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['three', 'three/*'], message: 'src/ui must stay three.js-free.' },
            { group: ['@render/*', '**/render/*'], message: 'src/ui may not import render.' },
          ],
        },
      ],
    },
  },
  {
    files: ['src/render/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['@ui/*', '**/ui/*'], message: 'src/render may not import ui.' }] },
      ],
    },
  },
  prettier,
);
