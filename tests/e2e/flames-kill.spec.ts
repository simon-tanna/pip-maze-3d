/**
 * Ticket 07: a flame kills the hero, who respawns on the start tile with the key restored.
 *
 * As in chest-transition.spec.ts, SwiftShader frames get slow once a level has been
 * walked, so this never renders per tick for long: a recorder in the page logs the sim's
 * events tick-exact, and `advance` runs exact tick counts (`ticks(n)`) with one render.
 */
import type { Page } from '@playwright/test';
import { expect, LEVEL_0, routeMoves, test } from './fixtures/game';
import type { DevGameWindow, GameDriver, Move } from './fixtures/game';

const TICK = 1000 / 60;
const GONE_MS = 270; // DEATH_TIMING.gone
const UNLOCK_MS = 530; // DEATH_TIMING.unlock
const GRACE_MS = 1000; // DEATH_TIMING.graceMs
const TELEGRAPH_MS = 500; // HAZARD_TIMING.telegraph
const FLAME_CYCLE = 4500;

/** Level 0's flame by the key, and the route from the key to the tile west of it. */
const FLAME = { col: 19, row: 7 };
const KEY_TO_BESIDE_FLAME: Move[] = [
  ['south', 2],
  ['east', 2],
  ['south', 2],
  ['east', 1],
];

interface Entry {
  type: string;
  simMs: number;
}

interface Win extends DevGameWindow {
  __game: DevGameWindow['__game'] & {
    renderer: { info: { programs: unknown[] | null } };
    guard: { violations: unknown[] };
    pickups: { getObjectByName(name: string): { visible: boolean } | undefined };
    flames: {
      group: {
        children: { name: string; visible: boolean; position: { x: number; z: number } }[];
      };
    };
  };
  __e2e?: Entry[];
}

// Fill rate is what SwiftShader pays for: keep the canvas small.
test.use({ viewport: { width: 640, height: 400 } });

async function record(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as Win;
    const log: Entry[] = [];
    w.__e2e = log;
    const sim = w.__game.sim;
    for (const type of ['died', 'respawned', 'keyLost', 'hazardLive'] as const) {
      sim.on(type, () => log.push({ type, simMs: sim.snapshot().simMs }));
    }
  });
}

const recorded = (page: Page) => page.evaluate(() => (window as unknown as Win).__e2e ?? []);

/** Run exactly `n` ticks (one render). */
const ticks = (game: GameDriver, n: number) => game.advance(n * TICK - 0.01);

const rig = (page: Page) =>
  page.evaluate(() => {
    const g = (window as unknown as Win).__game;
    return { programs: g.renderer.info.programs?.length ?? 0, violations: g.guard.violations };
  });

test('stepping onto a live flame: back on the start tile, key restored, coins kept, then input unlocks at 530 ms', async ({
  game,
}) => {
  const { page } = game;
  await game.boot(LEVEL_0);
  await record(page);
  await game.walk(routeMoves(LEVEL_0, 'key'));
  const beside = await game.walk(KEY_TO_BESIDE_FLAME);
  expect(beside).toMatchObject({ tile: { col: FLAME.col - 1, row: FLAME.row }, keys: 1, coins: 1 });
  const before = await rig(page);

  // Wait for the flame's next go-live, plus a little.
  const flame = (await page.evaluate(() => (window as unknown as Win).__game.sim.flames())).find(
    (f) => f.tile.col === FLAME.col && f.tile.row === FLAME.row,
  );
  if (!flame) throw new Error('no flame at the fixture tile');
  const t = beside.levelMs;
  const cycles = Math.max(0, Math.ceil((t - flame.phase - TELEGRAPH_MS) / FLAME_CYCLE));
  const live = flame.phase + TELEGRAPH_MS + cycles * FLAME_CYCLE;
  await game.advance(live - t + 50);
  const onNow = await page.evaluate(() => (window as unknown as Win).__game.sim.flames());
  expect(onNow.find((f) => f.tile.col === FLAME.col && f.tile.row === FLAME.row)?.state).toBe('on');

  // Step onto it: the landing kills.
  await game.tap('east');
  await game.advance(130);
  const dead = await game.snapshot();
  expect(dead).toMatchObject({
    tile: LEVEL_0.start,
    facing: 'south',
    moving: false,
    dying: true,
    keys: 0,
    coins: 1,
  });
  const keyShown = await page.evaluate(
    () => (window as unknown as Win).__game.pickups.getObjectByName('key_0')?.visible,
  );
  expect(keyShown).toBe(true);

  const died = (await recorded(page)).find((e) => e.type === 'died');
  if (!died) throw new Error('no died event');
  expect((await recorded(page)).map((e) => e.type)).toEqual(
    expect.arrayContaining(['hazardLive', 'died', 'keyLost']),
  );

  // Hold east (a walkable direction from the start) through the lock.
  await game.press('east');
  const unlockTick = Math.ceil((died.simMs + UNLOCK_MS - dead.simMs) / TICK - 1e-6);
  await ticks(game, unlockTick - 1);
  expect(await game.snapshot()).toMatchObject({
    tile: LEVEL_0.start,
    moving: false,
    dying: true,
    grace: true,
  });
  await ticks(game, 1);
  expect(await game.snapshot()).toMatchObject({
    tile: { col: LEVEL_0.start.col + 1, row: LEVEL_0.start.row },
    moving: true,
    dying: false,
  });
  await game.release('east');

  const respawned = (await recorded(page)).find((e) => e.type === 'respawned');
  expect((respawned?.simMs ?? NaN) - died.simMs).toBeGreaterThanOrEqual(GONE_MS - 1e-6);
  expect((respawned?.simMs ?? NaN) - died.simMs).toBeLessThan(GONE_MS + TICK);

  // Through the end of grace (and with the G overlay toggled): the rig and programs hold.
  await page.keyboard.press('g');
  await game.advance(1);
  const truth = await page.evaluate(() =>
    (window as unknown as Win).__game.flames.group.children
      .filter((c) => c.name.startsWith('truth_') && c.visible)
      .map((c) => ({ x: c.position.x, z: c.position.z })),
  );
  expect(truth).toContainEqual({ x: FLAME.col * 2 + 1, z: FLAME.row * 2 + 1 }); // still on
  await game.advance(GONE_MS + GRACE_MS);
  expect((await game.snapshot()).grace).toBe(false);
  await page.keyboard.press('g');
  await game.advance(100);
  expect(await rig(page)).toEqual(before);
  expect((await recorded(page)).filter((e) => e.type === 'died')).toHaveLength(1);
});

test('hazardsOff(true): the same flame lets the hero through', async ({ game }) => {
  await game.boot(LEVEL_0);
  await game.hazardsOff(true);
  await game.walk(routeMoves(LEVEL_0, 'key'));
  await game.walk(KEY_TO_BESIDE_FLAME);
  // Stand on the flame for a whole cycle.
  await game.tap('east');
  await game.advance(FLAME_CYCLE + 200);
  expect(await game.snapshot()).toMatchObject({ tile: FLAME, dying: false, keys: 1 });
});
