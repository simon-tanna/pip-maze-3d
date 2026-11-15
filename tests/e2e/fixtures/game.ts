/**
 * The shared e2e fixture: `test` with a `game` driver over the dev-only `window.__game.sim`.
 *
 *   import { expect, test } from './fixtures/game';
 *   test('…', async ({ game }) => {
 *     await game.boot(LEVEL_0);        // pinned seed, waits for data-ready, then pauses
 *     await game.walk(routeMoves(LEVEL_0, 'key'));
 *     expect((await game.snapshot()).tile).toEqual(LEVEL_0.legs[1].tile);
 *   });
 *
 * `boot` pauses the rAF-driven advance, so the simulation only moves when a spec calls
 * `advance` / `walk`: every run of a spec sees the same ticks. Read anything else off
 * `game.page` with `page.evaluate(() => window.__game…)`.
 */
import { expect, test as base } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { Dir } from '../../../src/core/grid-input';
import type { DevSim } from '../../../src/game/dev-sim';
import { walkOps } from './routes';
import type { Move, Route, WalkOp } from './routes';

export { expect };
export * from './routes';

export type SimSnapshot = ReturnType<DevSim['snapshot']>;

/** `window.__game` as the fixture uses it. Specs may widen it for what they read. */
export interface DevGameWindow {
  __game: {
    sim: DevSim;
    camera: { position: { x: number; y: number; z: number } };
  };
}

export interface GameDriver {
  readonly page: Page;
  /** Load `route.query` (or a raw query string), wait for data-ready, then pause the sim. */
  boot(route?: Route | string, opts?: { paused?: boolean }): Promise<void>;
  snapshot(): Promise<SimSnapshot>;
  press(dir: Dir): Promise<void>;
  release(dir: Dir): Promise<void>;
  /** Press, advance one tick, release: a tap. */
  tap(dir: Dir): Promise<void>;
  /** Run `ceil(ms / tick)` simulation ticks, then one render. */
  advance(ms: number): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  hazardsOff(off: boolean): Promise<void>;
  /**
   * Walk press sequences exactly (see `walkOps`), in one round trip. Ends idle.
   * `frames: 'last'` renders only after the final step (same ticks; for long journeys,
   * where each SwiftShader frame can cost a second under load).
   */
  walk(moves: readonly Move[], opts?: { frames?: 'every' | 'last' }): Promise<SimSnapshot>;
  /** The camera's world position. */
  camera(): Promise<{ x: number; y: number; z: number }>;
}

/** The data-ready wait: DPR-3 boots under 4 parallel SwiftShader workers can need it. */
export const BOOT_TIMEOUT = 20_000;

function createDriver(page: Page): GameDriver {
  /** Run a list of `__game.sim` calls in one round trip; returns the final snapshot. */
  const run = (calls: [method: string, arg?: unknown, opts?: unknown][]) =>
    page.evaluate((list) => {
      const s = (window as unknown as DevGameWindow).__game.sim as unknown as Record<
        string,
        (arg?: unknown, opts?: unknown) => unknown
      >;
      for (const [method, arg, opts] of list) s[method]?.(arg, opts);
      return (s as unknown as DevSim).snapshot();
    }, calls);

  return {
    page,
    async boot(route, { paused = true } = {}) {
      const query = typeof route === 'string' ? route : (route?.query ?? '');
      await page.goto(`/${query}`);
      await expect(page.locator('body')).toHaveAttribute('data-ready', 'true', {
        timeout: BOOT_TIMEOUT,
      });
      await page.waitForFunction(
        () => 'sim' in ((window as unknown as DevGameWindow).__game ?? {}),
      );
      if (paused) await run([['pause']]);
    },
    snapshot: () => run([]),
    press: async (dir) => void (await run([['press', dir]])),
    release: async (dir) => void (await run([['release', dir]])),
    tap: async (dir) =>
      void (await run([
        ['press', dir],
        ['advance', 1],
        ['release', dir],
      ])),
    advance: async (ms) => void (await run([['advance', ms]])),
    pause: async () => void (await run([['pause']])),
    resume: async () => void (await run([['resume']])),
    hazardsOff: async (off) => void (await run([['hazardsOff', off]])),
    walk: (moves, { frames = 'every' } = {}) => {
      const ops = walkOps(moves);
      const last = ops.length - 1;
      return run(
        ops.map((op: WalkOp, i) =>
          op.op === 'advance'
            ? ['advance', op.ms, { render: frames === 'every' || i === last }]
            : op.op === 'settle'
              ? ['settle']
              : [op.op, op.dir],
        ),
      );
    },
    camera: () =>
      page.evaluate(() => {
        const { x, y, z } = (window as unknown as DevGameWindow).__game.camera.position;
        return { x, y, z };
      }),
  };
}

export const test = base.extend<{ game: GameDriver }>({
  game: async ({ page }, use) => {
    await use(createDriver(page));
  },
});
