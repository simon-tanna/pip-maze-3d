/**
 * Ticket 06: the chest with the key, the iris, the next level, the end card and restart.
 *
 * SwiftShader frames get slow (~1 s) once a level has been walked, so these specs never
 * render per tick for long: `untilState` advances in chunks, and a recorder installed in
 * the page logs every machine transition (with sim time and the hero's tile) and every
 * iris state as they happen, tick-exact, whatever the chunk size. Walks onto a chest
 * render only their last step (`frames: 'last'`: same ticks, a fraction of the frames),
 * and the full-run journeys are `test.slow()`: under a loaded machine they outgrew 60 s.
 */
import type { Page } from '@playwright/test';
import { BOOT_TIMEOUT, expect, LEVEL_0, LEVEL_1, routeMoves, test } from './fixtures/game';
import type { DevGameWindow, GameDriver, Move, Route, SimSnapshot } from './fixtures/game';

const TICK = 1000 / 60;
const CHEST_DELAY_MS = 350; // TRANSITION_TIMING.chestDelayMs
const IRIS_MS = 420; // TRANSITION_TIMING.irisMs

type State = SimSnapshot['machine'];

interface Entry {
  to: State;
  simMs: number;
  tile: SimSnapshot['tile'];
}

interface Recorder {
  log: Entry[];
  iris: { state: string; at: number }[];
  /** Press `dir` once, on entering a state. */
  during: Partial<Record<State, SimSnapshot['facing']>>;
}

interface Win extends DevGameWindow {
  __game: DevGameWindow['__game'] & {
    machine: { state: State; onChange(l: (to: State) => void): void };
    renderer: {
      info: {
        programs: { cacheKey: string }[] | null;
        memory: { geometries: number; textures: number };
      };
    };
    run: { base: number; level: number; seed: number; pinned: boolean };
    level: { exitCol: number; exitRow: number } | null;
  };
  __e2e?: Recorder;
}

// Fill rate is what SwiftShader pays for: keep the canvas small.
test.use({ viewport: { width: 640, height: 400 } });

/** Install the recorder (once per page) and clear it. */
async function record(page: Page, during: Recorder['during'] = {}) {
  await page.evaluate((during) => {
    const w = window as unknown as Win;
    const g = w.__game;
    if (!w.__e2e) {
      const rec: Recorder = { log: [], iris: [], during: {} };
      w.__e2e = rec;
      g.machine.onChange((to) => {
        const s = g.sim.snapshot();
        rec.log.push({ to, simMs: s.simMs, tile: s.tile });
        const dir = rec.during[to];
        if (dir) {
          rec.during = Object.fromEntries(Object.entries(rec.during).filter(([k]) => k !== to));
          g.sim.press(dir);
        }
      });
      const iris = document.querySelector<HTMLElement>('.iris');
      iris?.addEventListener('iris', (e) => {
        rec.iris.push((e as CustomEvent<{ state: string; at: number }>).detail);
      });
    }
    w.__e2e.log = [];
    w.__e2e.iris = [];
    w.__e2e.during = during;
  }, during);
}

const recorded = (page: Page) =>
  page.evaluate(() => {
    const { log, iris } = (window as unknown as Win).__e2e as Recorder;
    return { log, iris };
  });

/** Advance in `chunk` ms steps (one render each) until the machine is in `state`. */
async function untilState(game: GameDriver, state: State, { limit = 4000, chunk = 200 } = {}) {
  for (let ms = 0; ms <= limit; ms += chunk) {
    const s = await game.snapshot();
    if (s.machine === state) return s;
    await game.advance(chunk);
  }
  throw new Error(`never reached ${state}`);
}

/** Walk a whole route onto its chest (hazards off: they aren't lethal until 07/08). */
async function finish(game: GameDriver, route: Route) {
  await game.hazardsOff(true);
  const s = await game.walk(routeMoves(route), { frames: 'last' });
  expect(s).toMatchObject({ tile: route.legs[2]?.tile, machine: 'leaving' });
  return s;
}

const programKeys = (page: Page) =>
  page.evaluate(() =>
    ((window as unknown as Win).__game.renderer.info.programs ?? []).map((p) => p.cacheKey).sort(),
  );

const memory = (page: Page) =>
  page.evaluate(() => {
    const { geometries, textures } = (window as unknown as Win).__game.renderer.info.memory;
    return { geometries, textures };
  });

const CODES = { south: 'ArrowDown', north: 'ArrowUp', east: 'ArrowRight', west: 'ArrowLeft' };

test('the chest with the key: leaving → building → entering, on time, and level 1 plays', async ({
  game,
}) => {
  await game.boot(LEVEL_0);
  await record(game.page);
  await finish(game, LEVEL_0);
  await untilState(game, 'playing');
  const { log, iris } = await recorded(game.page);
  expect(log.map((e) => e.to)).toEqual(['leaving', 'building', 'entering', 'playing']);
  const at = (to: State) => log.find((e) => e.to === to)?.simMs ?? NaN;
  // The iris starts closing 350 ms after the chest opens, and takes 420 ms.
  const [closing, opening] = [iris.find((i) => i.state === 'closing'), iris.at(-1)];
  // (`closed` only shows if a frame renders between the close ending and `entering`.)
  expect(iris.map((i) => i.state).filter((s) => s !== 'closed')).toEqual([
    'closing',
    'opening',
    'open',
  ]);
  expect((closing?.at ?? NaN) - at('leaving')).toBeGreaterThanOrEqual(CHEST_DELAY_MS - 1e-6);
  expect((closing?.at ?? NaN) - at('leaving')).toBeLessThan(CHEST_DELAY_MS + TICK);
  expect(at('building') - (closing?.at ?? NaN)).toBeGreaterThanOrEqual(IRIS_MS - 1e-6);
  expect(at('building') - (closing?.at ?? NaN)).toBeLessThan(IRIS_MS + TICK);
  // It opens on the hero over 420 ms; input unlocks when it completes.
  expect(opening?.at).toBe(at('entering'));
  expect(at('playing') - at('entering')).toBeGreaterThanOrEqual(IRIS_MS - 1e-6);
  expect(at('playing') - at('entering')).toBeLessThan(IRIS_MS + TICK);

  const s = await game.snapshot();
  expect(s).toMatchObject({ levelIndex: 1, machine: 'playing', tile: LEVEL_1.start, keys: 0 });
  await expect(game.page.locator('[data-hud="chamber"]')).toHaveText('CHAMBER 2');
  // Level 1 is the run's own level 1: the shared fixture's route reaches its chest.
  await finish(game, LEVEL_1);
});

test('presses during leaving, building and entering never move the hero; a held one doesn’t walk on arrival', async ({
  game,
}) => {
  await game.boot(LEVEL_0);
  // Level 0's chest has floor north of it; level 1's start opens south.
  await record(game.page, { leaving: 'north', building: 'south', entering: 'south' });
  await finish(game, LEVEL_0);
  await untilState(game, 'playing', { chunk: 100 });
  const { log } = await recorded(game.page);
  expect(log.map((e) => [e.to, e.tile])).toEqual([
    ['leaving', LEVEL_0.legs[2]?.tile],
    ['building', LEVEL_0.legs[2]?.tile],
    ['entering', LEVEL_1.start],
    ['playing', LEVEL_1.start],
  ]);
  // South and north are still held: nothing walks once input unlocks.
  await game.advance(500);
  expect(await game.snapshot()).toMatchObject({ tile: LEVEL_1.start, moving: false });
  // A fresh press does.
  await game.release('south');
  await game.release('north');
  await game.tap('south');
  expect((await game.snapshot()).moving).toBe(true);
});

/** Walk `route` onto its chest, keeping the last direction held; returns that direction. */
async function finishHolding(game: GameDriver, route: Route) {
  await game.hazardsOff(true);
  const moves = routeMoves(route);
  const [dir, n] = moves.at(-1) as Move;
  await game.walk([...moves.slice(0, -1), ...(n > 1 ? [[dir, n - 1] as const] : [])], {
    frames: 'last',
  });
  await game.press(dir);
  await game.advance(150);
  expect((await game.snapshot()).machine).toBe('leaving');
  return dir;
}

test('level 1’s chest shows the end card; a fresh key restarts the pinned level, twice', async ({
  game,
}) => {
  test.slow(); // two full level-1 runs
  await game.boot(LEVEL_1);
  const { page } = game;
  const card = page.locator('[data-screen="ended"]');
  for (let round = 1; round <= 2; round++) {
    const dir = await finishHolding(game, LEVEL_1);
    await untilState(game, 'ended');
    expect(await game.snapshot()).toMatchObject({ levelIndex: 1, keys: 0, coins: round });
    await expect(card).toContainText('END OF SLICE');
    await expect(card).toContainText(`COINS ${round}`);
    await expect(card).toContainText('PRESS ANY KEY');

    // The arrow held from the last step (and its auto-repeats) never restarts.
    await page.evaluate((code) => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code, repeat: true, cancelable: true }));
    }, CODES[dir]);
    await game.advance(300);
    expect((await game.snapshot()).machine).toBe('ended');
    await game.release(dir);

    // A fresh press restarts at the pinned level with the same seed; it never walks.
    await game.press('south');
    expect((await game.snapshot()).machine).toBe('building');
    await expect(card).toHaveCount(0);
    await untilState(game, 'playing');
    expect(await game.snapshot()).toMatchObject({ levelIndex: 1, tile: LEVEL_1.start, keys: 0 });
    const run = await page.evaluate(() => (window as unknown as Win).__game.run);
    expect(run).toMatchObject({ pinned: true, level: 1, seed: LEVEL_1.seed });
    await game.advance(300);
    expect(await game.snapshot()).toMatchObject({ tile: LEVEL_1.start, moving: false });
    await game.release('south');
  }
});

test('unpinned: a restart logs a fresh base seed; level 1’s seed is stable within a run', async ({
  game,
}) => {
  test.slow(); // levels 0 and 1, then a restart
  const { page } = game;
  // The run's base-seed draws: 42 (so the shared routes apply), then 7 on restart.
  await page.addInitScript(() => {
    const queue = [42, 7];
    const original = crypto.getRandomValues.bind(crypto);
    crypto.getRandomValues = (<T extends ArrayBufferView | null>(array: T): T => {
      if (array instanceof Uint32Array && array.length === 1 && queue.length > 0) {
        array[0] = queue.shift() ?? 0;
        return array;
      }
      return original(array as never) as T;
    }) as typeof crypto.getRandomValues;
  });
  const logs: string[] = [];
  page.on('console', (m) => {
    if (m.text().startsWith('[run]')) logs.push(m.text());
  });
  await game.boot('');
  await expect.poll(() => logs).toEqual(['[run] base seed 42; level 0, seed 42']);
  await finish(game, LEVEL_0);
  await untilState(game, 'playing');
  const level1 = await page.evaluate(() => (window as unknown as Win).__game.level);
  expect(level1).toEqual(
    expect.objectContaining({
      exitCol: LEVEL_1.legs[2]?.tile.col,
      exitRow: LEVEL_1.legs[2]?.tile.row,
    }),
  );
  await finish(game, LEVEL_1);
  await untilState(game, 'ended');
  await game.tap('east');
  await untilState(game, 'playing');
  await expect
    .poll(() => logs)
    .toEqual(['[run] base seed 42; level 0, seed 42', '[run] base seed 7; level 0, seed 7']);
  expect(await game.snapshot()).toMatchObject({ levelIndex: 0, machine: 'playing' });
  expect(await page.evaluate(() => (window as unknown as Win).__game.run)).toMatchObject({
    base: 7,
    seed: 7,
    pinned: false,
  });
});

test('no program compiles in a transition or the first 10 frames of entering; the set is unchanged', async ({
  game,
}) => {
  const { page } = game;
  await game.boot(LEVEL_0);
  await game.advance(100);
  const before = await programKeys(page);
  expect(before.length).toBeGreaterThan(0);
  await finish(game, LEVEL_0);
  await game.advance(CHEST_DELAY_MS); // the iris starts closing
  expect(await programKeys(page)).toEqual(before);
  await game.advance(IRIS_MS - TICK);
  const s = await untilState(game, 'entering', { chunk: TICK });
  expect(s.levelIndex).toBe(1);
  const counts = await page.evaluate(() => {
    const g = (window as unknown as Win).__game;
    return Array.from({ length: 10 }, () => {
      g.sim.advance(1);
      return [g.sim.snapshot().machine, g.renderer.info.programs?.length ?? 0] as const;
    });
  });
  expect(counts).toEqual(Array.from({ length: 10 }, () => ['entering', before.length]));
  await untilState(game, 'playing');
  expect(await programKeys(page)).toEqual(before);
});

test('geometries and textures return to the level-0 baseline after 0 → 1 → restart', async ({
  game,
}) => {
  test.slow(); // levels 0 and 1, then a restart
  await game.boot(LEVEL_0);
  await game.advance(100);
  const baseline = await memory(game.page);
  await finish(game, LEVEL_0);
  await untilState(game, 'playing');
  await finish(game, LEVEL_1);
  await untilState(game, 'ended');
  await game.tap('east');
  await untilState(game, 'playing');
  await game.advance(100);
  expect(await game.snapshot()).toMatchObject({ levelIndex: 0, machine: 'playing' });
  expect(await memory(game.page)).toEqual(baseline);
});

test.describe('under reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('the iris is an instant cut', async ({ game }) => {
    await game.boot(LEVEL_0);
    await record(game.page);
    await finish(game, LEVEL_0);
    await untilState(game, 'playing', { chunk: 100 });
    const { log, iris } = await recorded(game.page);
    expect(iris.map((i) => i.state)).toEqual(['closed', 'open']);
    expect(log.map((e) => e.to)).toEqual(['leaving', 'building', 'entering', 'playing']);
    const at = (to: State) => log.find((e) => e.to === to)?.simMs ?? NaN;
    expect(at('building') - at('leaving')).toBeLessThan(CHEST_DELAY_MS + TICK);
    expect(at('playing') - at('entering')).toBeLessThanOrEqual(TICK + 1e-6);
  });
});

test('a GLB 404 reaches data-ready="error" with the error in #hud', async ({ page }) => {
  await page.route('**/models/placeholders/chamber.glb', (route) =>
    route.fulfill({ status: 404, body: 'not found' }),
  );
  await page.goto(`/${LEVEL_0.query}`);
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'error', {
    timeout: BOOT_TIMEOUT,
  });
  await expect(page.locator('#hud [data-screen="error"]')).toContainText('FAILED TO LOAD');
});

test('"Loading…" shows on INK until the GLBs arrive', async ({ page }) => {
  let release: () => void = () => {};
  const held = new Promise<void>((r) => (release = r));
  await page.route('**/models/placeholders/chamber.glb', async (route) => {
    await held;
    await route.continue();
  });
  await page.goto(`/${LEVEL_0.query}`);
  await expect(page.locator('#hud [data-screen="loading"]')).toHaveText('Loading…');
  await expect(page.locator('.iris')).toHaveAttribute('data-iris', 'closed');
  release();
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true', {
    timeout: BOOT_TIMEOUT,
  });
  await expect(page.locator('#hud [data-screen="loading"]')).toHaveCount(0);
});
