/**
 * Grid movement input, ported from v2's `src/game/lib/grid-input.js` (spec: Simulation →
 * Input). Directions are world-relative and map 1:1 to the grid (map ticket 01: the camera
 * never rotates, so there is no camera-relative mapping).
 *
 * - Hold to walk: while a direction is held, every `update()` (on landing) tries it again.
 * - Buffer: a press that can't move yet fires on a later `update()` if it is at most
 *   `BUFFER_MS` old. Age is simulation time (`now()`), so pause/advance stay deterministic.
 * - Corner assist: a buffered turn into a wall stays queued until it expires, so pressing
 *   a turn a tile before a junction turns at the junction.
 * - Newest held wins; older held directions are fallbacks (hold two to slide along walls).
 *
 * Pure: the DOM binding (keydown/keyup, `!event.repeat`, clear on blur) is `@game/keyboard`.
 */

export type Dir = 'north' | 'east' | 'south' | 'west';

export const DIRS: readonly Dir[] = ['north', 'east', 'south', 'west'];

/** Grid delta of each direction: north is row −1 (screen up), east is col +1. */
export const DIR_DELTA: Readonly<Record<Dir, { dCol: number; dRow: number }>> = {
  north: { dCol: 0, dRow: -1 },
  east: { dCol: 1, dRow: 0 },
  south: { dCol: 0, dRow: 1 },
  west: { dCol: -1, dRow: 0 },
};

/** Arrows and WASD, by `KeyboardEvent.code` (layout-independent, as in v2). */
export const KEY_DIRS: Readonly<Record<string, Dir>> = {
  ArrowUp: 'north',
  KeyW: 'north',
  ArrowDown: 'south',
  KeyS: 'south',
  ArrowLeft: 'west',
  KeyA: 'west',
  ArrowRight: 'east',
  KeyD: 'east',
};

/** How long a press stays buffered, in simulation ms (v2). */
export const BUFFER_MS = 180;

export interface GridInputOptions {
  /** Start one step in `dir`; return true only when a step actually started. */
  move(dir: Dir): boolean;
  /** Current simulation time in ms. */
  now(): number;
}

export interface GridInput {
  press(dir: Dir): void;
  release(dir: Dir): void;
  /** Try the buffered press, then held directions newest-first. True when a step started. */
  update(): boolean;
  /** Drop every held and buffered direction (blur, chest open, restart). */
  clear(): void;
}

export function createGridInput({ move, now }: GridInputOptions): GridInput {
  const held: Dir[] = []; // newest last
  let buffered: { dir: Dir; at: number } | null = null;

  const drop = (dir: Dir) => {
    const i = held.indexOf(dir);
    if (i !== -1) held.splice(i, 1);
  };

  const update = (): boolean => {
    if (buffered) {
      if (now() - buffered.at > BUFFER_MS) buffered = null;
      else if (move(buffered.dir)) {
        buffered = null;
        return true;
      }
    }
    for (let i = held.length - 1; i >= 0; i--) {
      const dir = held[i];
      if (dir && move(dir)) return true;
    }
    return false;
  };

  return {
    press(dir) {
      drop(dir);
      held.push(dir);
      buffered = { dir, at: now() };
      update();
    },
    release: drop,
    update,
    clear() {
      held.length = 0;
      buffered = null;
    },
  };
}
