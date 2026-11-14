import type { HeroAnim } from '../../src/render/hero';
import { expect, LEVEL_0, test } from './fixtures/game';
import type { DevGameWindow } from './fixtures/game';

/** `__game` as this spec reads it: the hero view's animator and Pip's scene graph. */
type PipWindow = DevGameWindow & {
  __game: {
    heroView: { anim(): HeroAnim };
    hero: import('three').Object3D;
    renderer: { info: { programs: { cacheKey: string }[] | null } };
  };
};

const STEP_MS = 120;

test('Pip idles when still and walks one footfall per tile across chained steps', async ({
  game,
}) => {
  await game.boot(LEVEL_0); // start (1, 1); east is clear for 3 tiles (the coin leg)
  const sample = async () => {
    const [anim, snap] = await Promise.all([
      game.page.evaluate(() => (window as unknown as PipWindow).__game.heroView.anim()),
      game.snapshot(),
    ]);
    return { ...anim, simMs: snap.simMs, tile: snap.tile, moving: snap.moving };
  };

  await game.advance(500);
  expect(await sample()).toMatchObject({ clip: 'idle', idleWeight: 1, walkWeight: 0 });

  // The view samples the sim once per render, so the walk starts at the first frame after
  // the press, and the 100 ms fade-in ends before the next sample.
  await game.press('east');
  await game.advance(20);
  await game.advance(STEP_MS); // into the second, chained step
  const a = await sample();
  expect(a).toMatchObject({ clip: 'walk', idleWeight: 0, walkWeight: 1, moving: true });
  await game.advance(STEP_MS); // one more tile, chained: no blend back to idle
  const b = await sample();
  expect(b).toMatchObject({ clip: 'walk', idleWeight: 0, walkWeight: 1, moving: true });
  // One footfall (half a cycle) per tile's worth of simulation time. `advance` runs whole
  // ticks, so the span is a little over one tile (still under a full cycle: no wrap).
  const tiles = (b.simMs - a.simMs) / STEP_MS;
  const cycles = (((b.walkPhase - a.walkPhase) % 1) + 1) % 1;
  expect(tiles).toBeGreaterThan(1);
  expect(tiles).toBeLessThan(2);
  expect(cycles / tiles).toBeCloseTo(0.5, 3);

  await game.release('east');
  await game.advance(STEP_MS); // the third step lands: the fade to idle starts
  await game.advance(150); // and ends
  expect(await sample()).toMatchObject({
    clip: 'idle',
    idleWeight: 1,
    walkWeight: 0,
    moving: false,
    tile: { col: 4, row: 1 },
  });
});

test('Pip is a skinned character with a blob shadow and the rim compiled in', async ({ game }) => {
  await game.boot(LEVEL_0);
  const view = await game.page.evaluate(() => {
    const g = (window as unknown as PipWindow).__game;
    let skinned = 0;
    let bones = 0;
    g.hero.traverse((o) => {
      const m = o as import('three').SkinnedMesh;
      if (m.isSkinnedMesh) {
        skinned++;
        bones = m.skeleton.bones.length;
      }
    });
    const blob = g.hero.getObjectByName('blob');
    return {
      skinned,
      bones,
      blob: blob?.visible === true,
      rimPrograms: (g.renderer.info.programs ?? []).filter((p) => p.cacheKey.includes('hero-rim'))
        .length,
    };
  });
  expect(view.skinned).toBeGreaterThan(0);
  expect(view.bones).toBe(13);
  expect(view.blob).toBe(true);
  expect(view.rimPrograms).toBeGreaterThan(0);
});
