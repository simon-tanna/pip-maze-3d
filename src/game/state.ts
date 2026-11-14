/**
 * The game's state machine (spec: State machine):
 * `loading → building → entering → playing → leaving → building → …`, `leaving → ended`
 * after the last slice level, `ended → building` on restart, and `failed` from anywhere.
 *
 * `createGameState` is the bare machine (legal transitions + change listeners).
 * `createDirector` drives it on the fixed loop's ticks: it builds levels, times the
 * chest delay and the iris on simulation ms, locks and clears input, and restarts.
 *
 * Layering: `src/game` imports nothing from `render`, `ui` or three.js. The director
 * depends on the interfaces declared here (`ChamberView`, `Transition`, `CameraRig`);
 * `main.ts` wires the implementations.
 */
import { generateLevel } from '@core/generator';
import type { Level } from '@core/generator';
import type { WorldXZ } from '@core/grid';
import { levelBlades } from '@core/blade';
import { levelFlames } from '@core/hazards';
import { restartRun, seedForLevel, SLICE_LEVELS } from '@core/run-seed';
import type { RunStart } from '@core/run-seed';
import type { Sim } from './sim';

export type MachineState =
  'loading' | 'building' | 'entering' | 'playing' | 'leaving' | 'ended' | 'failed';

const NEXT: Readonly<Record<MachineState, readonly MachineState[]>> = {
  loading: ['building', 'failed'],
  building: ['entering', 'failed'],
  entering: ['playing', 'failed'],
  playing: ['leaving', 'failed'],
  leaving: ['building', 'ended', 'failed'],
  ended: ['building', 'failed'],
  failed: [],
};

export interface GameState {
  readonly state: MachineState;
  /** Take a transition; throws on one the machine doesn't have. */
  go(next: MachineState): void;
  onChange(listener: (to: MachineState, from: MachineState) => void): void;
}

export function createGameState(): GameState {
  let state: MachineState = 'loading';
  const listeners: ((to: MachineState, from: MachineState) => void)[] = [];
  return {
    get state() {
      return state;
    },
    go(next) {
      if (!NEXT[state].includes(next)) throw new Error(`no transition ${state} → ${next}`);
      const from = state;
      state = next;
      for (const l of listeners) l(next, from);
    },
    onChange(listener) {
      listeners.push(listener);
    },
  };
}

/** Transition timings, simulation ms (spec: State machine; HUD and overlays → Iris). */
export const TRANSITION_TIMING = {
  /** From the chest opening to the iris starting to close. */
  chestDelayMs: 350,
  /** Iris close (cubic-in) and open (cubic-out). 0 under reduced motion: an instant cut. */
  irisMs: 420,
} as const;

/** A level to build: its index in the run, its seed, and the generated level. */
export interface LevelBuild {
  index: number;
  seed: number;
  level: Level;
}

/** Everything per-level the player sees (chamber, pickups, HUD panels, shadow fit, …). */
export interface ChamberView {
  /** Tear down the last level's views and build this one's, behind full INK. */
  build(build: LevelBuild): void;
  /** Compile every program once, after the first build (`renderer.compileAsync`). */
  precompile(): Promise<void>;
}

/** The iris. `ms` is 0 for an instant cut. */
export interface Transition {
  /** Close to full INK on `at`'s on-screen position. */
  close(at: WorldXZ, ms: number): void;
  /** Open from full INK on `at`'s on-screen position. */
  open(at: WorldXZ, ms: number): void;
}

export interface CameraRig {
  resetLag(): void;
}

export interface DirectorOptions {
  machine: GameState;
  sim: Sim;
  view: ChamberView;
  transition: Transition;
  cameraRig: CameraRig;
  run: RunStart;
  /** Fresh base seeds for unpinned restarts. */
  drawSeed(): number;
  reducedMotion(): boolean;
  /** Level generation (default `generateLevel`). */
  generate?(index: number, seed: number): Level;
  /** Index of the last level; its chest ends the slice. */
  lastLevel?: number;
  /** A restart began a new run (unpinned: a fresh base seed). */
  onRun?(run: RunStart): void;
  /** A load, build or compile error put the machine in `failed`. */
  onError?(error: unknown): void;
}

export interface Director {
  /** `loading → building` the run's first level. */
  start(): void;
  /** One fixed tick: the simulation, then the machine's timers. */
  update(): void;
  /** `ended → building`; false (and nothing happens) in any other state. */
  restart(): boolean;
  /** Go `failed` (once) and report `error`. */
  fail(error: unknown): void;
  readonly levelIndex: number;
  readonly run: RunStart;
  /** The level being played. */
  readonly level: Level | null;
}

/** Float slack for "at or after" checks on tick-derived times. */
const EPSILON = 1e-6;

export function createDirector(opts: DirectorOptions): Director {
  const { machine, sim, view, transition, cameraRig } = opts;
  const generate = opts.generate ?? generateLevel;
  const lastLevel = opts.lastLevel ?? SLICE_LEVELS - 1;
  let run = opts.run;
  let levelIndex = run.level;
  let level: Level | null = null;
  let precompiled = false;
  /** Building waits for this (the first build's compile; later builds take one tick). */
  let ready = false;
  /** When the current timed phase began, sim ms. */
  let phaseAt = 0;
  let chestAt: WorldXZ = { x: 0, z: 0 };
  let closing = false;

  const now = () => sim.timeAt(0);
  const irisMs = () => (opts.reducedMotion() ? 0 : TRANSITION_TIMING.irisMs);
  const elapsed = (ms: number) => now() + EPSILON >= phaseAt + ms;

  const fail = (error: unknown) => {
    if (machine.state === 'failed') return;
    machine.go('failed');
    opts.onError?.(error);
  };

  const build = (index: number) => {
    machine.go('building');
    levelIndex = index;
    ready = false;
    try {
      const seed = seedForLevel(run, index);
      level = generate(index, seed);
      sim.load({
        ...level,
        flames: levelFlames(level.traps, seed),
        blades: levelBlades(level.traps, seed),
      });
      view.build({ index, seed, level });
      cameraRig.resetLag();
    } catch (error) {
      fail(error);
      return;
    }
    if (precompiled) {
      ready = true;
      return;
    }
    precompiled = true;
    view.precompile().then(
      () => {
        ready = true;
      },
      (error: unknown) => fail(error),
    );
  };

  sim.on('chestOpened', (e) => {
    if (machine.state !== 'playing') return;
    sim.input.clear();
    machine.go('leaving');
    chestAt = e.world;
    phaseAt = now();
    closing = false;
  });

  return {
    get levelIndex() {
      return levelIndex;
    },
    get run() {
      return run;
    },
    get level() {
      return level;
    },
    start() {
      build(run.level);
    },
    fail,
    restart() {
      if (machine.state !== 'ended') return false;
      const next = restartRun(run, opts.drawSeed);
      if (next !== run) {
        run = next;
        opts.onRun?.(run);
      }
      sim.input.clear();
      build(run.level);
      return true;
    },
    update() {
      sim.update();
      switch (machine.state) {
        case 'building':
          if (!ready) break;
          machine.go('entering'); // the sim starts the hazard clock
          phaseAt = now();
          transition.open(sim.heroPosition(0), irisMs());
          break;
        case 'entering':
          if (!elapsed(irisMs())) break;
          sim.input.clear(); // nothing pressed or held through the iris walks on arrival
          machine.go('playing');
          break;
        case 'leaving':
          if (!closing) {
            if (!elapsed(TRANSITION_TIMING.chestDelayMs)) break;
            closing = true;
            phaseAt = now();
            transition.close(chestAt, irisMs());
          }
          if (!elapsed(irisMs())) break;
          if (levelIndex >= lastLevel) {
            machine.go('ended');
            if (level) sim.load(level); // keys reset; the session's coins stay
          } else build(levelIndex + 1);
          break;
        default:
          break;
      }
    },
  };
}
