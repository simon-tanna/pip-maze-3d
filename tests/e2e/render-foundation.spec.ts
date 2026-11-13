import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { HalfFloatType, NeutralToneMapping } from 'three';

/** Shape of the dev-only `window.__game` handle this spec reads (see src/main.ts). */
interface DevGame {
  renderer: {
    toneMapping: number;
    getPixelRatio(): number;
    info: { programs: unknown[] | null };
  };
  composer: { renderTarget1: { samples: number; texture: { type: number } } };
  bloom: { threshold: number; strength: number };
  look: {
    post: { bloomThreshold: number; bloomStrength: number };
    renderer: { msaaSamples: number };
    bench: { poolsAtPeak: boolean };
    lights: { poolIntensity: number; poolPeakScale: number };
  };
  rig: { pools: { intensity: number }[] };
  guard: { violations: unknown[]; baseline: Record<string, number> | null };
}
type Win = Window & { __game: DevGame };

async function boot(page: Page, deviceScaleFactor?: number) {
  if (deviceScaleFactor) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 720,
      deviceScaleFactor,
      mobile: false,
    });
  }
  await page.goto('/');
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true', { timeout: 20_000 });
}

const frames = (page: Page, n: number) =>
  page.evaluate(
    (count) =>
      new Promise<void>((done) => {
        let left = count;
        const tick = () => (--left <= 0 ? done() : requestAnimationFrame(tick));
        requestAnimationFrame(tick);
      }),
    n,
  );

test('renderer uses NeutralToneMapping, a 4-sample HalfFloat composer and look bloom', async ({
  page,
}) => {
  await boot(page);
  const cfg = await page.evaluate(() => {
    const g = (window as unknown as Win).__game;
    return {
      toneMapping: g.renderer.toneMapping,
      samples: g.composer.renderTarget1.samples,
      type: g.composer.renderTarget1.texture.type,
      bloom: { threshold: g.bloom.threshold, strength: g.bloom.strength },
      look: { threshold: g.look.post.bloomThreshold, strength: g.look.post.bloomStrength },
      lookSamples: g.look.renderer.msaaSamples,
      antialias: (() => {
        const canvas = document.querySelector('#game canvas') as HTMLCanvasElement;
        return canvas.getContext('webgl2')?.getContextAttributes()?.antialias;
      })(),
    };
  });
  expect(cfg.toneMapping).toBe(NeutralToneMapping);
  expect(cfg.samples).toBe(4);
  expect(cfg.lookSamples).toBe(4);
  expect(cfg.type).toBe(HalfFloatType);
  expect(cfg.bloom).toEqual({ threshold: 1, strength: 0.45 });
  expect(cfg.bloom).toEqual(cfg.look);
  expect(cfg.antialias).toBe(false);
});

test('pixel ratio is capped at 2 on a DPR-3 screen', async ({ page }) => {
  await boot(page, 3);
  const dpr = await page.evaluate(() => (window as unknown as Win).__game.renderer.getPixelRatio());
  expect(dpr).toBe(2);
});

test('the light rig never changes after boot, even with the light bench on', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await boot(page);
  await frames(page, 10);

  const before = await page.evaluate(() => (window as unknown as Win).__game.guard.baseline);
  expect(before).not.toBeNull();
  expect(before?.['lights']).toBe(7);
  expect(before?.['programs']).toBeGreaterThan(0);

  await page.evaluate(() => {
    (window as unknown as Win).__game.look.bench.poolsAtPeak = true;
  });
  await frames(page, 10);
  const peak = await page.evaluate(() => {
    const g = (window as unknown as Win).__game;
    return {
      pools: g.rig.pools.map((p) => p.intensity),
      expected: g.look.lights.poolIntensity * g.look.lights.poolPeakScale,
    };
  });
  expect(peak.pools).toEqual([peak.expected, peak.expected, peak.expected, peak.expected]);

  await page.evaluate(() => {
    (window as unknown as Win).__game.look.bench.poolsAtPeak = false;
  });
  await frames(page, 10);

  const after = await page.evaluate(() => {
    const g = (window as unknown as Win).__game;
    return { violations: g.guard.violations, programs: g.renderer.info.programs?.length };
  });
  expect(after.violations).toEqual([]);
  expect(after.programs).toBe(before?.['programs']);
  expect(errors).toEqual([]);
});
