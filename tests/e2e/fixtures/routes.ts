/**
 * The shared e2e fixture's data: one pinned base seed and, for slice levels 0 and 1, a
 * route start → coin → key → chest as press sequences. Every e2e spec walks these.
 * Kept free of Playwright imports so `tests/unit/e2e-routes.test.ts` can replay them on
 * the real generator and simulation (it fails if a route stops matching the level).
 *
 * Legs avoid other pickups. They avoid hazards where the maze allows; `hazards` lists
 * the ones a leg can't avoid, so specs written before a hazard is lethal call
 * `game.hazardsOff(true)` (or time the crossing) once tickets 07 and 08 land.
 */
import type { Dir } from '../../../src/core/grid-input';

export type Move = readonly [dir: Dir, tiles: number];

export interface Tile {
  col: number;
  row: number;
}

export interface Leg {
  to: 'coin' | 'key' | 'chest';
  /** Where the leg ends: the pickup's tile. */
  tile: Tile;
  moves: readonly Move[];
  /** Hazard tiles the leg walks through, `type@col,row`. */
  hazards: readonly string[];
}

export interface Route {
  level: number;
  /** The level's own seed. `?seed=<seed>&level=<level>` reproduces it as-is. */
  seed: number;
  /** URL query that boots straight into this level. */
  query: string;
  start: Tile;
  /** A direction that is a wall from the start tile. */
  wallFromStart: Dir;
  legs: readonly Leg[];
}

/** The run's pinned base seed. Level 1's seed is `levelSeed(BASE_SEED, 1)`. */
export const BASE_SEED = 42;

export const LEVEL_0: Route = {
  level: 0,
  seed: BASE_SEED,
  query: `?seed=${BASE_SEED}&level=0`,
  start: { col: 1, row: 1 },
  wallFromStart: 'north',
  legs: [
    { to: 'coin', tile: { col: 4, row: 1 }, moves: [['east', 3]], hazards: [] },
    {
      to: 'key',
      tile: { col: 15, row: 3 },
      moves: [
        ['west', 1],
        ['south', 8],
        ['west', 2],
        ['south', 2],
        ['east', 6],
        ['north', 2],
        ['east', 4],
        ['north', 2],
        ['east', 4],
        ['north', 4],
      ],
      hazards: [],
    },
    {
      to: 'chest',
      tile: { col: 35, row: 8 },
      moves: [
        ['south', 4],
        ['west', 4],
        ['south', 2],
        ['west', 2],
        ['south', 2],
        ['east', 12],
        ['north', 10],
        ['east', 14],
        ['south', 7],
      ],
      hazards: ['blade@24,1'],
    },
  ],
};

/** Level 1 of the pinned run (seed `levelSeed(42, 1)`). */
export const LEVEL_1: Route = {
  level: 1,
  seed: 2067236868,
  query: `?seed=2067236868&level=1`,
  start: { col: 1, row: 1 },
  wallFromStart: 'north',
  legs: [
    {
      to: 'coin',
      tile: { col: 17, row: 1 },
      moves: [
        ['south', 2],
        ['east', 4],
        ['north', 2],
        ['east', 12],
      ],
      hazards: ['blade@4,3', 'flame@5,1', 'flame@8,1', 'flame@13,1'],
    },
    {
      to: 'key',
      tile: { col: 18, row: 3 },
      moves: [
        ['south', 2],
        ['east', 1],
      ],
      hazards: [],
    },
    {
      to: 'chest',
      tile: { col: 37, row: 10 },
      moves: [
        ['east', 1],
        ['south', 2],
        ['west', 4],
        ['south', 4],
        ['east', 4],
        ['south', 2],
        ['east', 4],
        ['north', 6],
        ['east', 2],
        ['north', 2],
        ['east', 4],
        ['south', 2],
        ['east', 2],
        ['north', 4],
        ['east', 2],
        ['south', 2],
        ['east', 4],
        ['south', 7],
      ],
      hazards: [],
    },
  ],
};

export const ROUTES = [LEVEL_0, LEVEL_1] as const;

/** Every move of a route, up to and including the leg that ends at `upTo`. */
export function routeMoves(route: Route, upTo: Leg['to'] = 'chest'): Move[] {
  const end = route.legs.findIndex((l) => l.to === upTo);
  return route.legs.slice(0, end + 1).flatMap((l) => l.moves);
}

export type WalkOp = { op: 'press' | 'release'; dir: Dir } | { op: 'advance'; ms: number };

/** v2's 120 ms step (`STEP_MS` in src/core/step.ts). */
const STEP_MS = 120;

/**
 * The press/advance plan that walks `moves` exactly, from an idle hero on the paused sim.
 * Hold-to-walk: the press starts step 1 at once; steps chain every 120 ms, so after
 * `120 (n − 1) + 1` ms step n has started and step n + 1 hasn't (a tick is 16.7 ms).
 * Release, then 120 ms more lands it. Two renders per run, however long.
 */
export function walkOps(moves: readonly Move[]): WalkOp[] {
  return moves.flatMap(([dir, n]): WalkOp[] => [
    { op: 'press', dir },
    { op: 'advance', ms: STEP_MS * (n - 1) + 1 },
    { op: 'release', dir },
    { op: 'advance', ms: STEP_MS },
  ]);
}
