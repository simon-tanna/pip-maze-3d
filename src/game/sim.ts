/**
 * The hero's simulation on the grid (spec: Simulation). One `update()` is one fixed
 * 1/60 s tick; every rule runs on simulation milliseconds counted from those ticks.
 *
 * - Steps are grid-snap, `STEP_MS` per tile. The hero takes the destination tile at step
 *   start. A step lands on the first tick at or after its end, and a chained step starts
 *   at the previous step's end (not the landing tick), so its overshoot carries and held
 *   walking averages exactly `STEP_MS` per tile.
 * - Input (`@core/grid-input`) moves the hero only while the machine is `playing`. Held
 *   and buffered keys keep their state while locked and fire on the first tick after.
 * - `levelMs` is the level's hazard clock: 0 when `entering` begins.
 *
 * Pure game logic: no three.js, no DOM.
 */
import { createGridInput, DIR_DELTA } from '@core/grid-input';
import type { Dir, GridInput } from '@core/grid-input';
import { tileToWorld } from '@core/grid';
import type { GridPos, WorldXZ } from '@core/grid';
import type { TileMap } from '@core/generator';
import { startTile } from '@core/level';
import { STEP_MS, stepPosition } from '@core/step';
import type { GameState, MachineState } from './state';

/** Fixed update ticks per simulated second (matches `createFixedLoop`'s default step). */
export const TICKS_PER_SECOND = 60;
export const TICK_MS = 1000 / TICKS_PER_SECOND;

/** Float slack for "at or after" threshold checks on tick-derived times. */
const TIME_EPSILON = 1e-6;

export interface SimSnapshot {
  tile: GridPos;
  facing: Dir;
  moving: boolean;
  machine: MachineState;
  /** Simulation time since boot, ms. */
  simMs: number;
  /** The level's hazard clock, ms since `entering` began (0 before). */
  levelMs: number;
  ignoreHazards: boolean;
}

export interface SimEvents {
  /** A step started: the hero already holds `to`. */
  step: { from: GridPos; to: GridPos; dir: Dir };
  /** A step ended on `tile`. */
  landed: { tile: GridPos; world: WorldXZ };
}

export interface Sim {
  /** One fixed tick. */
  update(): void;
  /** The grid input the keyboard (and dev `sim.press`) drives. */
  readonly input: GridInput;
  /** Dev/e2e switch: hazards ignore the hero (read by ticket 07's hazard checks). */
  ignoreHazards: boolean;
  snapshot(): SimSnapshot;
  /** Simulation time at `alpha` of the way to the next tick, ms (what render draws). */
  timeAt(alpha: number): number;
  /** The hero's world position at `alpha`, from `stepPosition` mid-step. */
  heroPosition(alpha: number): WorldXZ;
  on<K extends keyof SimEvents>(type: K, listener: (event: SimEvents[K]) => void): void;
}

interface Step {
  from: GridPos;
  to: GridPos;
  startMs: number;
}

export function createSim({ map, machine }: { map: TileMap; machine: GameState }): Sim {
  let ticks = 0;
  const now = () => (ticks * 1000) / TICKS_PER_SECOND;
  let levelStartMs: number | null = null;
  machine.onChange((to) => {
    if (to === 'entering') levelStartMs = now();
  });

  let tile = startTile(map);
  let facing: Dir = 'south';
  let step: Step | null = null;
  /** While chaining on landing, the time the next step starts (the last step's end). */
  let chainStartMs: number | null = null;

  const listeners: { [K in keyof SimEvents]: ((e: SimEvents[K]) => void)[] } = {
    step: [],
    landed: [],
  };
  const emit = <K extends keyof SimEvents>(type: K, event: SimEvents[K]) => {
    for (const l of listeners[type]) l(event);
  };

  const walkable = (col: number, row: number) => {
    const v = map[row]?.[col];
    return v !== undefined && v !== 1;
  };

  const move = (dir: Dir): boolean => {
    if (machine.state !== 'playing' || step) return false;
    const { dCol, dRow } = DIR_DELTA[dir];
    const to = { col: tile.col + dCol, row: tile.row + dRow };
    if (!walkable(to.col, to.row)) return false; // no move, no turn
    const from = tile;
    facing = dir;
    tile = to;
    step = { from, to, startMs: chainStartMs ?? now() };
    emit('step', { from, to, dir });
    return true;
  };

  const input = createGridInput({ move, now });

  return {
    input,
    ignoreHazards: false,
    update() {
      ticks++;
      if (step && now() + TIME_EPSILON >= step.startMs + STEP_MS) {
        const endMs = step.startMs + STEP_MS;
        step = null;
        emit('landed', { tile, world: tileToWorld(tile.col, tile.row) });
        chainStartMs = endMs;
        input.update();
        chainStartMs = null;
      } else if (!step) {
        input.update(); // held keys after an unlock
      }
    },
    snapshot() {
      return {
        tile: { ...tile },
        facing,
        moving: step !== null,
        machine: machine.state,
        simMs: now(),
        levelMs: levelStartMs === null ? 0 : now() - levelStartMs,
        ignoreHazards: this.ignoreHazards,
      };
    },
    timeAt(alpha) {
      return now() + alpha * TICK_MS;
    },
    heroPosition(alpha) {
      if (!step) return tileToWorld(tile.col, tile.row);
      return stepPosition(step.from, step.to, (this.timeAt(alpha) - step.startMs) / STEP_MS);
    },
    on(type, listener) {
      listeners[type].push(listener);
    },
  };
}
