/**
 * Hazard timing (spec: Simulation → Hazards), ported from v2's `src/game/lib/hazards.js`.
 *
 * A flame's cycle is a pure function of the level's hazard clock (`levelMs`, 0 when
 * `entering` begins) and its phase. As in v2, the phase is a start delay: the flame is
 * off until it, then repeats telegraph (500) → on (2000) → off (2000). Only `on` is lethal.
 * Phases are seeded per tile, so neighbouring flames ripple and a seed replays its timing.
 *
 * Blades (ADR 0002) turn a full 360° every `bladeSpin` ms and kill on contact
 * (`@core/blade`); v2's `bladeHalfSwing` and `bladeDangerAngle` are not ported.
 *
 * Pure: no three.js, no DOM.
 */
import { tileRng } from './generator';
import type { GridTile, Trap } from './generator';

export const HAZARD_TIMING = {
  /** Flame wind-up: the grate heats inside the off window, before the flame is lethal. */
  telegraph: 500,
  flameOn: 2000,
  flameOff: 2000,
  /** One full blade turn, ms (ADR 0002), the same on every level. */
  bladeSpin: 1600,
} as const;

/** One flame cycle, ms (v2 `HAZARD_CYCLE.flame`). */
export const FLAME_CYCLE = HAZARD_TIMING.telegraph + HAZARD_TIMING.flameOn + HAZARD_TIMING.flameOff;

export type FlameState = 'off' | 'telegraph' | 'on';

/** Float slack, so a tick-derived time that lands on a threshold counts as reaching it. */
const TIME_EPSILON = 1e-6;

/** A flame's state at hazard-clock time `t`, ms, given its start delay `phase`. */
export function flameState(t: number, phase: number): FlameState {
  return flameClock(t, phase).state;
}

export interface FlameClock {
  state: FlameState;
  /**
   * Ms the flame has spent in `state` (never negative). Before its phase a flame counts as
   * off for `flameOff + t`, so it reads as long settled rather than just extinguished.
   */
  intoMs: number;
}

/** `flameState` plus how long the flame has been in that state: what views animate from. */
export function flameClock(t: number, phase: number): FlameClock {
  const since = t - phase + TIME_EPSILON;
  if (since < 0) return { state: 'off', intoMs: HAZARD_TIMING.flameOff + t };
  const c = since % FLAME_CYCLE;
  const { telegraph, flameOn } = HAZARD_TIMING;
  const into = (start: number) => Math.max(0, c - TIME_EPSILON - start);
  if (c < telegraph) return { state: 'telegraph', intoMs: into(0) };
  if (c < telegraph + flameOn) return { state: 'on', intoMs: into(telegraph) };
  return { state: 'off', intoMs: into(telegraph + flameOn) };
}

/** v2's `hazardPhase`: a seeded start delay in [0, cycle) for the hazard on `tile`. */
export function flamePhase(seed: number, tile: GridTile, cycle: number = FLAME_CYCLE): number {
  return Math.floor(tileRng(seed, tile.col + 1000, tile.row + 1000)() * cycle);
}

export interface Flame {
  tile: GridTile;
  /** Start delay, ms of hazard clock. */
  phase: number;
}

/** A level's flames, in trap order, each with its seeded phase. */
export function levelFlames(traps: readonly Trap[], seed: number): Flame[] {
  return traps
    .filter((t) => t.type === 'flame')
    .map((t) => {
      const tile = { col: t.col, row: t.row };
      return { tile, phase: flamePhase(seed, tile) };
    });
}
