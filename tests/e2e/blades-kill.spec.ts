/**
 * Ticket 08: a spinning blade kills on contact (ADR 0002). On the shared fixture, level 0's
 * chest leg runs east under `blade@24,1`; the hero stops just west of it and crosses at a
 * chosen point of the turn. Timing comes from `sim.blades()` (phase and angle), and an
 * in-page recorder logs the sim's events tick-exact, as in flames-kill.spec.ts.
 */
import type { Page } from '@playwright/test';
import { expect, LEVEL_0, routeMoves, test } from './fixtures/game';
import type { DevGameWindow, GameDriver, Move } from './fixtures/game';

const SPIN_MS = 1600; // HAZARD_TIMING.bladeSpin
const BLADE = { col: 24, row: 1 };
/** The chest leg up to the tile west of the blade. */
const TO_BESIDE_BLADE: Move[] = [...(LEVEL_0.legs[2]?.moves.slice(0, 7) ?? []), ['east', 2]];

interface Entry {
  type: string;
  simMs: number;
  hazard?: string;
  tile?: { col: number; row: number };
  /** On `landed`: the blade's angle then. */
  angle?: number | undefined;
}

interface Win extends DevGameWindow {
  __game: DevGameWindow['__game'] & {
    renderer: { info: { programs: unknown[] | null } };
    guard: { violations: unknown[] };
    bladeZone: { group: { getObjectByName(n: string): { visible: boolean } | undefined } };
  };
  __e2e?: Entry[];
}

test.use({ viewport: { width: 640, height: 400 } });

async function record(page: Page) {
  await page.evaluate((blade) => {
    const w = window as unknown as Win;
    const log: Entry[] = [];
    w.__e2e = log;
    const sim = w.__game.sim;
    const angle = () =>
      sim.blades().find((b) => b.tile.col === blade.col && b.tile.row === blade.row)?.angle;
    sim.on('died', (e) =>
      log.push({ type: 'died', simMs: sim.snapshot().simMs, hazard: e.hazard, tile: e.tile }),
    );
    sim.on('landed', (e) =>
      log.push({ type: 'landed', simMs: sim.snapshot().simMs, tile: e.tile, angle: angle() }),
    );
  }, BLADE);
}

const recorded = (page: Page) => page.evaluate(() => (window as unknown as Win).__e2e ?? []);

/** Walk to the tile west of the blade (hazards off on the way), then turn hazards on. */
async function besideBlade(game: GameDriver) {
  await game.boot(LEVEL_0);
  await game.hazardsOff(true);
  await game.walk(routeMoves(LEVEL_0, 'key'));
  const s = await game.walk(TO_BESIDE_BLADE);
  expect(s.tile).toEqual({ col: BLADE.col - 1, row: BLADE.row });
  await game.hazardsOff(false);
  await record(game.page);
  const blade = (await game.page.evaluate(() => (window as unknown as Win).__game.sim.blades()))
    .filter((b) => b.tile.col === BLADE.col && b.tile.row === BLADE.row)
    .at(0);
  if (!blade) throw new Error('no blade at the fixture tile');
  return { levelMs: s.levelMs, phase: blade.phase };
}

/** ms from `now` until the blade's angle is `deg`, at least `min` ms away. */
function untilAngle(now: number, phase: number, deg: number, min = 200) {
  const target = ((deg + 360) % 360) * (SPIN_MS / 360);
  const into = (now + min + phase) % SPIN_MS;
  return min + ((target - into + SPIN_MS) % SPIN_MS);
}

test('walking into the blade as its head comes down kills on contact', async ({ game }) => {
  const { page } = game;
  const { levelMs, phase } = await besideBlade(game);
  const before = await page.evaluate(() => {
    const g = (window as unknown as Win).__game;
    return g.renderer.info.programs?.length ?? 0;
  });
  // Head straight down as the step would land: contact from ~93 ms into the step.
  await game.advance(untilAngle(levelMs, phase, 0) - 120);
  await game.tap('east');
  await game.advance(200);
  const died = (await recorded(page)).filter((e) => e.type === 'died');
  expect(died).toEqual([expect.objectContaining({ hazard: 'blade', tile: BLADE })]);
  // Cut before the landing: the hero never stood on the blade's tile.
  expect((await recorded(page)).filter((e) => e.type === 'landed')).toEqual([]);
  expect(await game.snapshot()).toMatchObject({ tile: LEVEL_0.start, dying: true, keys: 0 });

  // G: the contact zone shows (and the flame overlay with it); no program compiles.
  await page.keyboard.press('g');
  await game.advance(1);
  const shown = await page.evaluate(
    () => (window as unknown as Win).__game.bladeZone.group.getObjectByName('zone_0')?.visible,
  );
  expect(shown).toBe(true);
  await page.keyboard.press('g');
  await game.advance(1);
  const after = await page.evaluate(() => {
    const g = (window as unknown as Win).__game;
    return { programs: g.renderer.info.programs?.length ?? 0, violations: g.guard.violations };
  });
  expect(after).toEqual({ programs: before, violations: [] });
});

test('passing under the blade while it is up does not kill', async ({ game }) => {
  const { page } = game;
  const { levelMs, phase } = await besideBlade(game);
  // Head straight up as the hero crosses the blade's plane (120 ms into the walk).
  await game.advance(untilAngle(levelMs, phase, 180) - 120);
  const s = await game.walk([['east', 2]]);
  expect(s).toMatchObject({ tile: { col: BLADE.col + 1, row: BLADE.row }, dying: false });
  const log = await recorded(page);
  expect(log.filter((e) => e.type === 'died')).toEqual([]);
  const under = log.find((e) => e.type === 'landed' && e.tile?.col === BLADE.col);
  expect(Math.abs(under?.angle ?? 0)).toBeGreaterThan(150);
});
