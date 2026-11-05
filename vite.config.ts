/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@core': r('./src/core'),
      '@render': r('./src/render'),
      '@game': r('./src/game'),
      '@ui': r('./src/ui'),
      '@assets': r('./src/assets'),
    },
  },
  // 8080 is pip-maze-v-2's dev port; strictPort so Playwright never attaches to the wrong game.
  server: { port: 5180, strictPort: true },
  preview: { port: 5180, strictPort: true },
  build: {
    target: 'es2023',
    // three.js alone is ~620 kB minified; it lives in its own long-cached chunk.
    chunkSizeWarningLimit: 800,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [{ name: (id) => (id.includes('node_modules/three') ? 'three' : null) }],
        },
      },
    },
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
