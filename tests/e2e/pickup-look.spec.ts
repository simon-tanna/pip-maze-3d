/**
 * Ticket 14: the gold pickups. The key fades back in after a death, the chest-open moment
 * (lid, shake) plays, and under reduced motion the bob, turn and shake are all 0. No
 * pickup adds a light.
 *
 * As in flames-kill.spec.ts, a recorder in the page logs the sim's events tick-exact, and
 * long walks render only their last step (SwiftShader frames are costly).
 */
import type { Page } from '@playwright/test';
import { expect, LEVEL_0, routeMoves, test } from './fixtures/game';
import type { DevGameWindow, GameDriver, Move } from './fixtures/game';

const TICK = 1000 / 60;
const TELEGRAPH_MS = 500; // HAZARD_TIMING.telegraph
const FLAME_CYCLE = 4500;
const APPEAR_MS = 500; // look.pickups.keyAppearMs
const SHAKE_MS = 160; // look.pickups.shakeMs

/** Level 0's flame by the key, and the route from the key to the tile west of it. */
const FLAME = { col: 19, row: 7 };
const KEY_TO_BESIDE_FLAME: Move[] = [
  ['south', 2],
  ['east', 2],
  ['south', 2],
  ['east', 1],
];

interface Node3 {
  visible: boolean;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number };
  scale: { x: number };
}

interface Win extends DevGameWindow {
  __game: DevGameWindow['__game'] & {
    scene: { traverse(fn: (o: { isLight?: boolean }) => void): void };
    guard: { violations: unknown[] };
    pickups: { getObjectByName(name: string): Node3 | undefined };
    pickupsView: { motion(): { bobAmplitude: number; turnRate: number } };
    cameraRig: { shake: { x: number; y: number } };
    look: { pickups: { keySize: number } };
  };
  __e2e?: { type: string; simMs: number }[];
}

test.use({ viewport: { width: 640, height: 400 } });

async function record(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as Win;
    const log: { type: string; simMs: number }[] = [];
    w.__e2e = log;
    const sim = w.__game.sim;
    for (const type of ['keyLost', 'chestOpened'] as const) {
      sim.on(type, () => log.push({ type, simMs: sim.snapshot().simMs }));
    }
  });
}
const recorded = (page: Page) => page.evaluate(() => (window as unknown as Win).__e2e ?? []);

const node = (page: Page, name: string) =>
  page.evaluate((name) => {
    const o = (window as unknown as Win).__game.pickups.getObjectByName(name);
    if (!o) throw new Error(`no ${name}`);
    return {
      visible: o.visible,
      x: o.position.x,
      y: o.position.y,
      z: o.position.z,
      yaw: o.rotation.y,
      pitch: o.rotation.x,
      scale: o.scale.x,
    };
  }, name);

const lights = (page: Page) =>
  page.evaluate(() => {
    const g = (window as unknown as Win).__game;
    let n = 0;
    g.scene.traverse((o) => void (o.isLight && n++));
    return { lights: n, violations: g.guard.violations.length };
  });

const motion = (page: Page) =>
  page.evaluate(() => (window as unknown as Win).__game.pickupsView.motion());
const shake = (page: Page) =>
  page.evaluate(() => {
    const { x, y } = (window as unknown as Win).__game.cameraRig.shake;
    return { x, y };
  });

/** Run exactly one tick (one render). */
const tick = (game: GameDriver) => game.advance(TICK - 0.01);

/** Walk the whole of level 0 onto its chest (hazards off); returns the chest-open time. */
async function openChest(game: GameDriver) {
  await game.hazardsOff(true);
  const s = await game.walk(routeMoves(LEVEL_0), { frames: 'last' });
  expect(s.machine).toBe('leaving');
  const opened = (await recorded(game.page)).find((e) => e.type === 'chestOpened');
  if (!opened) throw new Error('no chestOpened event');
  return { opened: opened.simMs, now: s.simMs };
}

test('after a death the key fades back in on its tile, and no pickup adds a light', async ({
  game,
}) => {
  const { page } = game;
  await game.boot(LEVEL_0);
  await record(page);
  const before = await lights(page);
  const keyTile = LEVEL_0.legs[1]?.tile ?? { col: 0, row: 0 };
  const home = await node(page, 'key_0');
  expect(home).toMatchObject({ visible: true, x: keyTile.col * 2 + 1, z: keyTile.row * 2 + 1 });

  await game.walk(routeMoves(LEVEL_0, 'key'));
  expect((await node(page, 'key_0')).visible).toBe(false);
  const beside = await game.walk(KEY_TO_BESIDE_FLAME);
  const flame = (await page.evaluate(() => (window as unknown as Win).__game.sim.flames())).find(
    (f) => f.tile.col === FLAME.col && f.tile.row === FLAME.row,
  );
  if (!flame) throw new Error('no flame at the fixture tile');
  const t = beside.levelMs;
  const cycles = Math.max(0, Math.ceil((t - flame.phase - TELEGRAPH_MS) / FLAME_CYCLE));
  await game.advance(flame.phase + TELEGRAPH_MS + cycles * FLAME_CYCLE - t + 50);

  // Step onto the live flame, then tick until the key is lost.
  await game.tap('east');
  for (let i = 0; i < 30 && !(await recorded(page)).some((e) => e.type === 'keyLost'); i++) {
    await tick(game);
  }
  const lost = (await recorded(page)).find((e) => e.type === 'keyLost');
  if (!lost) throw new Error('no keyLost event');
  const back = await node(page, 'key_0');
  expect(back).toMatchObject({ visible: true, x: home.x, z: home.z });
  expect(back.scale).toBeLessThan(0.7 * home.scale); // growing from 0.4

  await game.advance(APPEAR_MS);
  const grown = await node(page, 'key_0');
  expect(grown).toMatchObject({ visible: true, x: home.x, z: home.z });
  expect(grown.scale).toBeCloseTo(home.scale, 5);
  expect(await lights(page)).toEqual(before);
  expect(before.violations).toBe(0);
});

test('keys bob and turn; the chest opens with its lid, a burst and a shake', async ({ game }) => {
  test.slow(); // the whole of level 0
  const { page } = game;
  await game.boot(LEVEL_0);
  await record(page);
  expect(await motion(page)).toEqual({ bobAmplitude: 0.12, turnRate: 1 / 3 });
  const a = await node(page, 'key_0');
  await game.advance(450);
  const b = await node(page, 'key_0');
  expect(b.y).not.toBeCloseTo(a.y, 3);
  expect(b.yaw).not.toBeCloseTo(a.yaw, 3);

  const before = await lights(page);
  const { opened, now } = await openChest(game);
  const shakes: number[] = [];
  for (let at = now; at < opened + SHAKE_MS; at += TICK) {
    const s = await shake(page);
    shakes.push(Math.hypot(s.x, s.y));
    await tick(game);
  }
  expect(Math.max(...shakes)).toBeGreaterThan(0);
  await game.advance(100);
  expect(await shake(page)).toEqual({ x: 0, y: 0 });
  expect((await node(page, 'chest_lid')).pitch).toBeCloseTo((-110 * Math.PI) / 180, 3);
  expect(await lights(page)).toEqual(before);
});

test.describe('under reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('bob amplitude and turn rate are 0, and the chest-open shake offset stays 0', async ({
    game,
  }) => {
    test.slow(); // the whole of level 0
    const { page } = game;
    await game.boot(LEVEL_0);
    await record(page);
    expect(await motion(page)).toEqual({ bobAmplitude: 0, turnRate: 0 });
    const a = await node(page, 'key_0');
    for (const ms of [300, 450, 900]) {
      await game.advance(ms);
      const b = await node(page, 'key_0');
      expect([b.y, b.yaw]).toEqual([a.y, a.yaw]);
    }

    const { opened, now } = await openChest(game);
    for (let at = now; at < opened + SHAKE_MS + TICK; at += TICK) {
      expect(await shake(page)).toEqual({ x: 0, y: 0 });
      await tick(game);
    }
    // The chest still opens (before the instant cut at 350 ms rebuilds the level).
    await game.advance(80);
    expect((await node(page, 'chest_lid')).pitch).toBeCloseTo((-110 * Math.PI) / 180, 3);
  });
});
