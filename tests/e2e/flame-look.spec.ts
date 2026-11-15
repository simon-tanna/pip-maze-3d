/**
 * Ticket 12: flames read as light, and the look follows the rule tick for tick.
 *
 * With the ground-truth overlay on (`G`), run one tick per rendered frame across a go-live
 * and the following off tick of level 0's flame by the key: the ignite starts on the
 * go-live tick, the collapse on the off tick, and the column is below 0.25 on every frame
 * whose tile isn't lethal. Through a whole cycle the renderer's program count and the
 * light rig stay as they were (no recompile, no light added or toggled).
 */
import type { Page } from '@playwright/test';
import { expect, LEVEL_0, test } from './fixtures/game';
import type { DevGameWindow } from './fixtures/game';

const TICK = 1000 / 60;
const TELEGRAPH_MS = 500; // HAZARD_TIMING.telegraph
const ON_MS = 2000; // HAZARD_TIMING.flameOn
const FLAME_CYCLE = 4500;
const FLAME = { col: 19, row: 7 };
/** Ticks recorded either side of each transition. */
const AROUND = 12;

interface Visual {
  size: number;
  alpha: number;
  heat: number;
}

interface Frame {
  state: string;
  lethal: boolean;
  visual: Visual;
  embers: number;
}

interface Win extends DevGameWindow {
  __game: DevGameWindow['__game'] & {
    renderer: { info: { programs: unknown[] | null } };
    guard: { violations: unknown[] };
    rig: { pools: { intensity: number }[] };
    flames: {
      showTruth: boolean;
      visuals(): Visual[];
      embers(): number;
      group: { getObjectByName(name: string): { visible: boolean } | undefined };
    };
  };
}

test.use({ viewport: { width: 640, height: 400 } });

/** Run `n` ticks, rendering each one, and record the flame's frame after every tick. */
const record = (page: Page, index: number, n: number) =>
  page.evaluate(
    ({ index, n, tick }) => {
      const g = (window as unknown as Win).__game;
      const out: Frame[] = [];
      for (let i = 0; i < n; i++) {
        g.sim.advance(tick - 0.01);
        const visual = g.flames.visuals()[index];
        if (!visual) throw new Error('no visual');
        out.push({
          state: g.sim.flames()[index]?.state ?? 'none',
          lethal: g.flames.group.getObjectByName(`truth_${index}`)?.visible ?? false,
          visual: { ...visual },
          embers: g.flames.embers(),
        });
      }
      return out;
    },
    { index, n, tick: TICK },
  );

const rig = (page: Page) =>
  page.evaluate(() => {
    const g = (window as unknown as Win).__game;
    return { programs: g.renderer.info.programs?.length ?? 0, violations: g.guard.violations };
  });

test('the look follows the rule: ignite on the go-live tick, collapse on the off tick, programs flat', async ({
  game,
}) => {
  const { page } = game;
  await game.boot(LEVEL_0);
  await page.keyboard.press('g');
  await game.advance(1);
  const before = await rig(page);

  const flames = await page.evaluate(() => (window as unknown as Win).__game.sim.flames());
  const index = flames.findIndex((f) => f.tile.col === FLAME.col && f.tile.row === FLAME.row);
  const flame = flames[index];
  if (!flame) throw new Error('no flame at the fixture tile');

  // The next go-live at least AROUND ticks away, then the off tick 2000 ms later.
  const t = (await game.snapshot()).levelMs;
  const cycles = Math.max(
    0,
    Math.ceil((t + AROUND * TICK - flame.phase - TELEGRAPH_MS) / FLAME_CYCLE),
  );
  const live = flame.phase + TELEGRAPH_MS + cycles * FLAME_CYCLE;
  await game.advance(live - t - AROUND * TICK);
  const ignite = await record(page, index, AROUND * 2);
  const off = live + ON_MS;
  const now = (await game.snapshot()).levelMs;
  await game.advance(off - now - AROUND * TICK);
  const collapse = await record(page, index, AROUND * 2);

  const frames = [...ignite, ...collapse];
  for (const f of frames) {
    // The overlay is the rule: lethal exactly when the sim says `on`.
    expect(f.lethal).toBe(f.state === 'on');
    if (!f.lethal) expect(f.visual.size).toBeLessThan(0.25);
  }

  const goLive = ignite.findIndex((f) => f.lethal);
  expect(goLive).toBeGreaterThan(0);
  expect(ignite[goLive - 1]?.state).toBe('telegraph');
  expect(ignite[goLive - 1]?.visual.alpha).toBe(0); // no column before the go-live tick
  expect(ignite[goLive - 1]?.visual.heat).toBeGreaterThan(0.9); // the grate is hot
  expect(ignite[goLive - 1]?.embers).toBeGreaterThan(0); // embers through the telegraph
  // The ignite starts here: within a tick of 0.3, growing back-out to 1 by 120 ms.
  const first = ignite[goLive]?.visual.size ?? NaN;
  expect(first).toBeGreaterThanOrEqual(0.3);
  expect(first).toBeLessThan(1);
  expect(ignite[goLive + 1]?.visual.size).toBeGreaterThan(first);
  expect(ignite[goLive + 8]?.visual.size).toBe(1);
  expect(ignite[goLive]?.visual.alpha).toBe(1);

  const offTick = collapse.findIndex((f) => !f.lethal);
  expect(offTick).toBeGreaterThan(0);
  expect(collapse[offTick - 1]?.visual.size).toBe(1);
  expect(collapse[offTick]?.state).toBe('off');
  // The collapse starts here (within a tick of full strength) …
  expect(collapse[offTick]?.visual.alpha).toBeGreaterThan(1 - TICK / 120 - 1e-6);
  expect(collapse[offTick + 8]?.visual.alpha).toBe(0); // … and is gone by 120 ms

  // A whole cycle on: still no new program, no light change.
  await game.advance(FLAME_CYCLE);
  expect(await rig(page)).toEqual(before);
  expect(before.violations).toEqual([]);
});
