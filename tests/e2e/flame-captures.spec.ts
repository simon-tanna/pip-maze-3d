/**
 * Ticket 12's game-camera captures of one flame cycle (seed 42, the shared fixture):
 * `CAPTURE=1 pnpm test:e2e flame-captures` writes `docs/art/m1/12-*.png`. Skipped otherwise.
 *
 * The hero walks (hazards off) to the tile west of level 0's flame by the key, then each
 * shot advances the paused sim to a point in the flame's cycle and screenshots the canvas
 * with the dev panel and readout hidden.
 */
import { expect, LEVEL_0, routeMoves, test } from './fixtures/game';
import type { DevGameWindow, Move } from './fixtures/game';

const TELEGRAPH_MS = 500;
const ON_MS = 2000;
const FLAME_CYCLE = 4500;
const FLAME = { col: 19, row: 7 };
const KEY_TO_BESIDE_FLAME: Move[] = [
  ['south', 2],
  ['east', 2],
  ['south', 2],
  ['east', 1],
];

/** Shot name → ms after the go-live (negative: into the telegraph). */
const SHOTS: [string, number][] = [
  ['12-flame-1-off', -TELEGRAPH_MS - 600],
  ['12-flame-2-telegraph', -150],
  ['12-flame-3-ignite', 50],
  ['12-flame-4-live', 1000],
  ['12-flame-5-collapse', ON_MS + 40],
  ['12-flame-6-cooling', ON_MS + 200],
];

test.skip(!process.env['CAPTURE'], 'captures run only with CAPTURE=1');
test.use({ viewport: { width: 1920, height: 1080 } });
test.setTimeout(180_000);

test('flame cycle captures', async ({ game }) => {
  const { page } = game;
  await game.boot(LEVEL_0);
  await page.addStyleTag({ content: '.lil-gui, [data-dev-readout] { display: none !important; }' });
  await game.hazardsOff(true);
  await game.walk(routeMoves(LEVEL_0, 'key'), { frames: 'last' });
  const beside = await game.walk(KEY_TO_BESIDE_FLAME, { frames: 'last' });
  expect(beside.tile).toEqual({ col: FLAME.col - 1, row: FLAME.row });

  const flame = (
    await page.evaluate(() => (window as unknown as DevGameWindow).__game.sim.flames())
  ).find((f) => f.tile.col === FLAME.col && f.tile.row === FLAME.row);
  if (!flame) throw new Error('no flame at the fixture tile');
  // A go-live far enough ahead for the earliest shot.
  const t = beside.levelMs;
  const lead = -(SHOTS[0]?.[1] ?? 0) + 100;
  const cycles = Math.max(0, Math.ceil((t + lead - flame.phase - TELEGRAPH_MS) / FLAME_CYCLE));
  const live = flame.phase + TELEGRAPH_MS + cycles * FLAME_CYCLE;

  for (const [name, at] of SHOTS) {
    const now = (await game.snapshot()).levelMs;
    await game.advance(live + at - now);
    await page.locator('#game canvas').screenshot({ path: `docs/art/m1/${name}.png` });
  }
});
