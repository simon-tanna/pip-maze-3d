import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { afterAll, describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../..', import.meta.url));
const outDir = mkdtempSync(join(tmpdir(), 'doom-maze-build-'));

afterAll(() => rmSync(outDir, { recursive: true, force: true }));

describe('production build', () => {
  it('ships neither the dev panel, the frame-time readout nor __game.sim', async () => {
    // Vitest sets NODE_ENV=test, which makes Vite's import.meta.env.DEV true; build as `pnpm build` does.
    const nodeEnv = process.env['NODE_ENV'];
    process.env['NODE_ENV'] = 'production';
    try {
      await build({
        root,
        mode: 'production',
        logLevel: 'silent',
        build: { outDir, emptyOutDir: true },
      });
    } finally {
      process.env['NODE_ENV'] = nodeEnv;
    }
    const js = readdirSync(join(outDir, 'assets'))
      .filter((f) => f.endsWith('.js'))
      .map((f) => readFileSync(join(outDir, 'assets', f), 'utf8'))
      .join('\n');
    expect(js).toContain('EffectComposer'); // sanity: the real bundle was read
    for (const devOnly of ['lil-gui', 'devReadout', 'log summary', '__game', 'hazardsOff']) {
      expect(js).not.toContain(devOnly);
    }
  }, 60_000);
});
