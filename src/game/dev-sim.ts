/**
 * Dev-only `window.__game.sim` (spec: Dev tooling): the handle e2e drives the game with.
 * Only ever loaded through an `import.meta.env.DEV`-guarded dynamic import, so it never
 * reaches the production bundle.
 *
 * - `snapshot()`: read-only state (hero tile, facing, machine state, level index, level
 *   time, …).
 * - `press(dir)` / `release(dir)` dispatch real `keydown` / `keyup` events on the window,
 *   so they take the same path as the keyboard (`@game/keyboard` → grid input).
 * - `pause()` stops the rAF-driven advance; `advance(ms)` runs `ceil(ms / tick)` ticks
 *   directly (bypassing the frame clamp), then one render (none with `render: false`).
 *   `resume()` undoes `pause()`.
 * - `hazardsOff(bool)`: hazards ignore the hero, live.
 * - `flames()` / `blades()`: each hazard's tile, phase and current state or angle; `on(type, fn)`: the sim's
 *   events, so e2e can record them tick-exact in the page.
 */
import type { Dir } from '@core/grid-input';
import type { FixedLoop } from './loop';
import type { BladeNow, FlameNow, Sim, SimSnapshot } from './sim';

/** The key each direction's `press` sends (one per direction; arrows, as a player would). */
const DIR_CODES: Readonly<Record<Dir, string>> = {
  north: 'ArrowUp',
  east: 'ArrowRight',
  south: 'ArrowDown',
  west: 'ArrowLeft',
};

export interface DevSim {
  snapshot(): SimSnapshot & { paused: boolean; levelIndex: number };
  press(dir: Dir): void;
  release(dir: Dir): void;
  pause(): void;
  resume(): void;
  advance(ms: number, opts?: { render?: boolean }): void;
  hazardsOff(off: boolean): void;
  flames(): readonly FlameNow[];
  blades(): readonly BladeNow[];
  on: Sim['on'];
}

export function createDevSim(
  sim: Sim,
  loop: FixedLoop,
  game: { readonly levelIndex: number },
  target: EventTarget = window,
): DevSim {
  const send = (type: 'keydown' | 'keyup', dir: Dir) => {
    target.dispatchEvent(new KeyboardEvent(type, { code: DIR_CODES[dir], cancelable: true }));
  };
  return {
    snapshot: () => ({ ...sim.snapshot(), paused: loop.paused, levelIndex: game.levelIndex }),
    press: (dir) => send('keydown', dir),
    release: (dir) => send('keyup', dir),
    pause() {
      loop.paused = true;
    },
    resume() {
      loop.paused = false;
    },
    advance: (ms, opts) => loop.step(ms, opts),
    hazardsOff(off) {
      sim.ignoreHazards = off;
    },
    flames: () => sim.flames(),
    blades: () => sim.blades(),
    on: (type, listener) => sim.on(type, listener),
  };
}
