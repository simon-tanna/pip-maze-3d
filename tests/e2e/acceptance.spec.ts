/**
 * The slice's acceptance journey (spec: Acceptance), on the shared pinned-seed fixture:
 * walk to the key, die on a known flame and respawn at the start with the key restored,
 * walk the route again to the key and the chest (crossing level 0's blade while it is up),
 * see level 1 build, reach the end card and restart.
 *
 * Level 0 runs with hazards live. Level 1's route crosses a blade and three flames that
 * the other specs already cover, so the journey walks it with `hazardsOff(true)`.
 *
 * SwiftShader frames get slow once a level has been walked, so the journey never renders
 * per tick for long: walks run in one round trip, waits advance in chunks, and an in-page
 * recorder logs sim events and machine transitions tick-exact (chest-transition.spec.ts).
 */
import type { Page } from '@playwright/test';
import { expect, LEVEL_0, LEVEL_1, routeMoves, test } from './fixtures/game';
import type { DevGameWindow, GameDriver, Move, SimSnapshot } from './fixtures/game';

const TELEGRAPH_MS = 500; // HAZARD_TIMING.telegraph
const FLAME_CYCLE = 4500;
const SPIN_MS = 1600; // HAZARD_TIMING.bladeSpin
const GRACE_END_MS = 270 + 1000; // DEATH_TIMING.gone + graceMs

/** Level 0's flame by the key, and the route from the key to the tile west of it. */
const FLAME = { col: 19, row: 7 };
const KEY_TO_BESIDE_FLAME: Move[] = [
  ['south', 2],
  ['east', 2],
  ['south', 2],
  ['east', 1],
];

/** Level 0's chest leg, split at the tile west of `blade@24,1`. */
const BLADE = { col: 24, row: 1 };
const CHEST_LEG = LEVEL_0.legs[2]?.moves ?? [];
const TO_BESIDE_BLADE: Move[] = [...CHEST_LEG.slice(0, 7), ['east', 2]];
const PAST_BLADE: Move[] = [['east', 12], ...CHEST_LEG.slice(8)];

type State = SimSnapshot['machine'];

interface Entry {
  type: string;
  simMs: number;
  detail?: unknown;
}

interface Win extends DevGameWindow {
  __game: DevGameWindow['__game'] & {
    machine: { state: State; onChange(l: (to: State) => void): void };
    pickups: { getObjectByName(name: string): { visible: boolean } | undefined };
    guard: { violations: unknown[] };
    run: { level: number; seed: number; pinned: boolean };
  };
  __e2e?: Entry[];
}

test.use({ viewport: { width: 640, height: 400 } });

async function record(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as Win;
    const log: Entry[] = [];
    w.__e2e = log;
    const { sim, machine } = w.__game;
    const at = () => sim.snapshot().simMs;
    for (const type of ['died', 'respawned', 'keyLost', 'key', 'chestOpened'] as const) {
      sim.on(type, (e) => log.push({ type, simMs: at(), detail: e.tile }));
    }
    sim.on('died', (e) => log.push({ type: `died:${e.hazard}`, simMs: at() }));
    machine.onChange((to) => log.push({ type: `machine:${to}`, simMs: at() }));
  });
}

const recorded = (page: Page) => page.evaluate(() => (window as unknown as Win).__e2e ?? []);
const types = async (page: Page) => (await recorded(page)).map((e) => e.type);

/** Advance in `chunk` ms steps (one render each) until the machine is in `state`. */
async function untilState(game: GameDriver, state: State, { limit = 4000, chunk = 200 } = {}) {
  for (let ms = 0; ms <= limit; ms += chunk) {
    const s = await game.snapshot();
    if (s.machine === state) return s;
    await game.advance(chunk);
  }
  throw new Error(`never reached ${state}`);
}

const hazard = <T extends 'flames' | 'blades'>(page: Page, kind: T, tile: typeof FLAME) =>
  page.evaluate(
    ([kind, tile]) => {
      const sim = (window as unknown as Win).__game.sim;
      const list = kind === 'flames' ? sim.flames() : sim.blades();
      const h = list.find((x) => x.tile.col === tile.col && x.tile.row === tile.row);
      if (!h) throw new Error(`no ${kind} at ${tile.col},${tile.row}`);
      return h.phase;
    },
    [kind, tile] as const,
  );

test('the slice: key, a flame death and respawn, the chest past the blade, level 1, the end card and restart', async ({
  game,
}) => {
  test.setTimeout(120_000);
  const { page } = game;
  await game.boot(LEVEL_0);
  await record(page);

  // Level 0, hazards live: coin and key (these legs cross no hazard).
  const atKey = await game.walk(routeMoves(LEVEL_0, 'key'));
  expect(atKey).toMatchObject({ tile: LEVEL_0.legs[1]?.tile, keys: 1, coins: 1, dying: false });

  // Die on the known flame: wait beside it for its go-live, then step on.
  const beside = await game.walk(KEY_TO_BESIDE_FLAME);
  expect(beside.tile).toEqual({ col: FLAME.col - 1, row: FLAME.row });
  const flamePhase = await hazard(page, 'flames', FLAME);
  const cycles = Math.max(0, Math.ceil((beside.levelMs - flamePhase - TELEGRAPH_MS) / FLAME_CYCLE));
  const live = flamePhase + TELEGRAPH_MS + cycles * FLAME_CYCLE;
  await game.advance(live - beside.levelMs + 50);
  await game.tap('east');
  await game.advance(130);
  expect(await game.snapshot()).toMatchObject({
    tile: LEVEL_0.start,
    dying: true,
    keys: 0,
    coins: 1,
  });
  expect(await types(page)).toEqual(expect.arrayContaining(['died', 'died:flame', 'keyLost']));
  // The key is restored to its tile.
  expect(
    await page.evaluate(
      () => (window as unknown as Win).__game.pickups.getObjectByName('key_0')?.visible,
    ),
  ).toBe(true);

  // Respawn at the start; wait out the input lock and grace.
  await game.advance(GRACE_END_MS + 50);
  const respawned = await game.snapshot();
  expect(respawned).toMatchObject({ tile: LEVEL_0.start, dying: false, grace: false });
  expect(await types(page)).toContain('respawned');

  // The route again: the key is back, then the chest leg up to the blade.
  const again = await game.walk(routeMoves(LEVEL_0, 'key'));
  expect(again).toMatchObject({ tile: LEVEL_0.legs[1]?.tile, keys: 1, coins: 1 });
  const atBlade = await game.walk(TO_BESIDE_BLADE);
  expect(atBlade).toMatchObject({ tile: { col: BLADE.col - 1, row: BLADE.row }, dying: false });
  // Cross while the head is straight up (120 ms into the walk, at the blade's plane).
  const bladePhase = await hazard(page, 'blades', BLADE);
  const upAt = SPIN_MS / 2;
  const into = (atBlade.levelMs + 200 + 120 + bladePhase) % SPIN_MS;
  await game.advance(200 + ((upAt - into + SPIN_MS) % SPIN_MS));
  const atChest = await game.walk(PAST_BLADE);
  expect(atChest).toMatchObject({ tile: LEVEL_0.legs[2]?.tile, machine: 'leaving', keys: 1 });
  expect((await types(page)).filter((t) => t === 'died')).toHaveLength(1);

  // Level 1 builds behind the iris and plays.
  await untilState(game, 'playing');
  expect(await game.snapshot()).toMatchObject({
    levelIndex: 1,
    tile: LEVEL_1.start,
    keys: 0,
    coins: 1,
  });
  await expect(page.locator('[data-hud="chamber"]')).toHaveText('CHAMBER 2');

  // Level 1 to its chest (hazards off: see the header), then the end card.
  await game.hazardsOff(true);
  const done = await game.walk(routeMoves(LEVEL_1));
  expect(done).toMatchObject({ tile: LEVEL_1.legs[2]?.tile, machine: 'leaving' });
  await game.hazardsOff(false);
  await untilState(game, 'ended');
  const card = page.locator('[data-screen="ended"]');
  await expect(card).toContainText('END OF SLICE');
  await expect(card).toContainText('COINS 2');

  // A fresh key restarts at the pinned level and seed; coins carry over.
  await game.tap('east');
  await expect(card).toHaveCount(0);
  await untilState(game, 'playing');
  expect(await game.snapshot()).toMatchObject({
    levelIndex: 0,
    tile: LEVEL_0.start,
    keys: 0,
    coins: 2,
    dying: false,
  });
  expect(await page.evaluate(() => (window as unknown as Win).__game.run)).toMatchObject({
    pinned: true,
    level: 0,
    seed: LEVEL_0.seed,
  });
  await expect(page.locator('[data-hud="chamber"]')).toHaveText('CHAMBER 1');

  expect((await types(page)).filter((t) => t.startsWith('machine:'))).toEqual([
    'machine:leaving',
    'machine:building',
    'machine:entering',
    'machine:playing',
    'machine:leaving',
    'machine:ended',
    'machine:building',
    'machine:entering',
    'machine:playing',
  ]);
  expect(await page.evaluate(() => (window as unknown as Win).__game.guard.violations)).toEqual([]);
});
