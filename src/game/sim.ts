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
 * - Pickups (`@core/pickups`) run on landing, after `landed`, in v2's order coin → key →
 *   chest. Coins bank at once into the `Session` total, which outlives the level's sim.
 * - Flames (`@core/hazards`) cycle on the hazard clock. A flame kills the hero on its tile
 *   while `on`: checked on landing (before pickups, so a death beats the chest) and when
 *   it goes live (the occupant re-check). Kills happen only while `playing`, never while
 *   `dying` or in grace, and not with `ignoreHazards`. Grace ending re-checks nothing.
 * - Blades (`@core/blade`, ADR 0002) turn on the hazard clock and kill on contact: every
 *   tick, after the flames and before a landing, the blade outline is tested against the
 *   body capsule at the hero's `stepPosition` (mid-step included), with the same gates.
 * - Death (`DEATH_TIMING`): at t = 0 the step is cut, the hero takes the start tile facing
 *   south and drops its most recent key; at `gone` it respawns with `graceMs` of grace;
 *   at `unlock` input moves it again (held or buffered keys fire). Coins are untouched.
 *
 * Pure game logic: no three.js, no DOM.
 */
import { createGridInput, DIR_DELTA } from '@core/grid-input';
import type { Dir, GridInput } from '@core/grid-input';
import { tileToWorld } from '@core/grid';
import type { GridPos, WorldXZ } from '@core/grid';
import type { TileMap } from '@core/generator';
import { startTile } from '@core/level';
import { flameClock, flameState } from '@core/hazards';
import type { Flame, FlameState } from '@core/hazards';
import { bladeAngle, bladeTouches } from '@core/blade';
import type { Blade } from '@core/blade';
import { createPickups } from '@core/pickups';
import type { PickupLayout } from '@core/pickups';
import { STEP_MS, stepPosition } from '@core/step';
import type { GameState, MachineState } from './state';

/** Fixed update ticks per simulated second (matches `createFixedLoop`'s default step). */
export const TICKS_PER_SECOND = 60;
export const TICK_MS = 1000 / TICKS_PER_SECOND;

/** The death sequence, ms after the kill (v2 `resetPip`, `RESPAWN_GRACE_MS`). */
export const DEATH_TIMING = {
  /** The hero respawns on the start tile and grace begins. */
  gone: 270,
  /** Input moves the hero again. */
  unlock: 530,
  /** Hazards ignore the hero this long after the respawn. */
  graceMs: 1000,
} as const;

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
  /** Keys collected this level. */
  keys: number;
  requiredKeys: 1 | 2;
  /** The session's coin total (banked at pickup). */
  coins: number;
  /** From a kill until input unlocks (`DEATH_TIMING.unlock`). */
  dying: boolean;
  /** Hazards ignore the hero (`DEATH_TIMING.graceMs` from the respawn). */
  grace: boolean;
}

/** What outlives a level: the in-memory coin total (lost on reload). */
export interface Session {
  coins: number;
}

export function createSession(): Session {
  return { coins: 0 };
}

/** Where something happened: its tile and the tile centre in world space. */
interface At {
  tile: GridPos;
  world: WorldXZ;
}

export interface SimEvents {
  /** A step started: the hero already holds `to` (`tile` and `world` are `to`). */
  step: At & { from: GridPos; to: GridPos; dir: Dir };
  /** A step ended on `tile`. */
  landed: At;
  /** A coin was picked up and banked: `total` is the new session total. */
  coin: At & { total: number };
  /** Key `index` was collected: `keys` is the new count. */
  key: At & { index: number; keys: number };
  /** Key `index` appeared (key 2 once key 1 is collected). */
  keyRevealed: At & { index: number };
  /** Key `index` was dropped and respawns on its tile: `keys` is the new count. */
  keyLost: At & { index: number; keys: number };
  /** An uncollected key `index` was hidden again (key 2, when key 1 is lost). */
  keyHidden: At & { index: number };
  /** Landed on the chest without every required key. */
  chestLocked: At;
  /** Landed on the chest with every required key. */
  chestOpened: At;
  /** A hazard on `tile` turned lethal (a flame went `on`). */
  hazardLive: At & { type: 'flame' };
  /** The hero was killed on `tile` (where it stood, or where its step was cut). */
  died: At & { hazard: 'flame' | 'blade' };
  /** The hero respawned on the start tile (`tile`); grace begins. */
  respawned: At;
}

/** A flame and its state on the hazard clock now. */
export interface FlameNow extends Flame {
  state: FlameState;
  /** Ms into `state` on the same clock (`flameClock`): what the flame view animates from. */
  intoMs: number;
}

/** A blade and its angle θ on the hazard clock now (degrees, `@core/blade`). */
export interface BladeNow extends Blade {
  angle: number;
}

/** What `load` swaps in: the map, its pickups, its flames and blades (default none). */
export type SimLevel = {
  map: TileMap;
  flames?: readonly Flame[];
  blades?: readonly Blade[];
} & PickupLayout;

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
  /** The level's hazard clock at `alpha` (`levelMs`, which stops when `leaving` begins). */
  levelAt(alpha: number): number;
  /** The hero's world position at `alpha`, from `stepPosition` mid-step. */
  heroPosition(alpha: number): WorldXZ;
  /**
   * The facing views draw: the snapshot's, except from a kill until `gone`, where it stays
   * the facing the hero died with (the sim's facing is already south), so the hero view
   * doesn't turn and the camera's lead doesn't drift off the death spot.
   */
  heroFacing(): Dir;
  /** A step is under way (the snapshot's `moving`, without building a snapshot). */
  heroMoving(): boolean;
  /** From a kill until the respawn at `DEATH_TIMING.gone` (the hero is not on the board). */
  heroFallen(): boolean;
  on<K extends keyof SimEvents>(type: K, listener: (event: SimEvents[K]) => void): void;
  /**
   * Swap in the next level (state machine `building`): the hero goes to its start tile,
   * facing south; keys, pickups, the step and input reset. The clock, the session and
   * every listener carry over.
   */
  load(level: SimLevel): void;
  /**
   * The level's flames and their current states (for views and the dev overlay). The same
   * array and objects are refilled on every call: read them, don't keep them.
   */
  flames(): readonly FlameNow[];
  /** The level's blades and their current angles (for views and the dev overlay). */
  blades(): readonly BladeNow[];
  /** Drop the most recent key (death, ticket 07). False when none is held. */
  dropKey(): boolean;
  /** Whether key `index` stands in the level (for the pickup view). */
  keyVisible(index: number): boolean;
  /** Whether coin `index` is still in the level. */
  coinVisible(index: number): boolean;
}

/** Before the first `load`: a lone start tile. */
const NO_LEVEL: TileMap = [[2]];
const NO_PICKUPS: PickupLayout = { coins: [], key: { col: -1, row: -1 }, key2: null };

interface Step {
  from: GridPos;
  to: GridPos;
  startMs: number;
}

export interface SimOptions {
  /**
   * The first level's map. Optional: a sim whose levels come from `load` (the director's
   * `building`) starts on a one-tile placeholder until the first load.
   */
  map?: TileMap;
  machine: GameState;
  /** The level's coins and keys (default: none; the map's chest stays locked). */
  pickups?: PickupLayout;
  /** The run's session; pass the same one to every level's sim. */
  session?: Session;
  /** The level's flames (default: none). */
  flames?: readonly Flame[];
  /** The level's blades (default: none). */
  blades?: readonly Blade[];
}

interface Death {
  atMs: number;
  /** Where the hero was drawn when it died (the camera holds here until `gone`). */
  spot: WorldXZ;
  /** The facing the hero died with (drawn until `gone`). */
  facing: Dir;
  respawned: boolean;
}

export function createSim({
  map = NO_LEVEL,
  machine,
  pickups: layout = NO_PICKUPS,
  session = createSession(),
  flames: initialFlames = [],
  blades: initialBlades = [],
}: SimOptions): Sim {
  let ticks = 0;
  let current = map;
  const now = () => (ticks * 1000) / TICKS_PER_SECOND;
  let levelStartMs: number | null = null;
  /** Set when `leaving` begins: the hazard clock stops there. */
  let levelEndMs: number | null = null;
  machine.onChange((to) => {
    if (to === 'entering') {
      levelStartMs = now();
      levelEndMs = null;
      resetFlames();
    } else if (to === 'leaving') levelEndMs = now();
  });

  let tile = startTile(map);
  let facing: Dir = 'south';
  let step: Step | null = null;
  /** While chaining on landing, the time the next step starts (the last step's end). */
  let chainStartMs: number | null = null;

  let pickups = createPickups(map, layout);
  let flames: readonly Flame[] = initialFlames;
  /** Each flame's state as of the last tick (go-live is a change to `on`). */
  let flameStates: FlameState[] = [];
  /** What `flames()` returns: reused, so the per-frame call allocates no array. */
  const flamesNow: FlameNow[] = [];
  let blades: readonly Blade[] = initialBlades;
  let death: Death | null = null;
  /** Grace lasts until this sim time (ms). */
  let graceUntilMs = -Infinity;
  const listeners: { [K in keyof SimEvents]: ((e: SimEvents[K]) => void)[] } = {
    step: [],
    landed: [],
    coin: [],
    key: [],
    keyRevealed: [],
    keyLost: [],
    keyHidden: [],
    chestLocked: [],
    chestOpened: [],
    hazardLive: [],
    died: [],
    respawned: [],
  };
  const emit = <K extends keyof SimEvents>(type: K, event: SimEvents[K]) => {
    for (const l of listeners[type]) l(event);
  };

  const at = (t: GridPos) => tileToWorld(t.col, t.row);

  const levelMs = () => (levelStartMs === null ? 0 : (levelEndMs ?? now()) - levelStartMs);
  const inGrace = () => now() + TIME_EPSILON < graceUntilMs;
  const killable = () => machine.state === 'playing' && !death && !inGrace() && !self.ignoreHazards;
  const lethalAt = (t: GridPos) =>
    flames.some((f, i) => f.tile.col === t.col && f.tile.row === t.row && flameStates[i] === 'on');

  const kill = (hazard: SimEvents['died']['hazard']) => {
    const spot = self.heroPosition(0);
    const diedFacing = facing;
    const where = { tile: { ...tile }, world: at(tile) };
    step = null;
    chainStartMs = null;
    tile = startTile(current);
    facing = 'south';
    death = { atMs: now(), spot, facing: diedFacing, respawned: false };
    emit('died', { ...where, hazard });
    self.dropKey();
  };

  /** Advance every flame to the current hazard clock; a go-live re-checks its occupant. */
  const updateFlames = () => {
    const t = levelMs();
    flames.forEach((f, i) => {
      const next = flameState(t, f.phase);
      const was = flameStates[i];
      flameStates[i] = next;
      if (next !== 'on' || was === 'on' || was === undefined) return;
      emit('hazardLive', { tile: { ...f.tile }, world: at(f.tile), type: 'flame' });
      if (killable() && f.tile.col === tile.col && f.tile.row === tile.row) kill('flame');
    });
  };

  /** Contact: does any blade's outline touch the hero's capsule where it is this tick? */
  const bladeHit = () => {
    if (blades.length === 0) return false;
    const t = levelMs();
    const { x, z } = self.heroPosition(0);
    return blades.some((b) => {
      const c = at(b.tile);
      return bladeTouches(bladeAngle(t, b.phase), z - c.z, x - c.x);
    });
  };

  const resetFlames = () => {
    const t = levelMs();
    flameStates = flames.map((f) => flameState(t, f.phase));
  };

  /** The death timers: respawn at `gone`, unlock at `unlock`. True while still locked. */
  const updateDeath = () => {
    if (!death) return false;
    const since = now() - death.atMs + TIME_EPSILON;
    if (!death.respawned && since >= DEATH_TIMING.gone) {
      death.respawned = true;
      graceUntilMs = death.atMs + DEATH_TIMING.gone + DEATH_TIMING.graceMs;
      emit('respawned', { tile: { ...tile }, world: at(tile) });
    }
    if (since < DEATH_TIMING.unlock) return true;
    death = null;
    return false;
  };

  const land = () => {
    emit('landed', { tile: { ...tile }, world: at(tile) });
    if (killable() && lethalAt(tile)) {
      kill('flame');
      return;
    }
    for (const hit of pickups.land(tile)) {
      const where = { tile: hit.tile, world: at(hit.tile) };
      switch (hit.type) {
        case 'coin':
          session.coins++;
          emit('coin', { ...where, total: session.coins });
          break;
        case 'key':
          emit('key', { ...where, index: hit.index, keys: hit.keys });
          break;
        case 'keyRevealed':
          emit('keyRevealed', { ...where, index: hit.index });
          break;
        case 'chestLocked':
        case 'chestOpened':
          emit(hit.type, where);
          break;
      }
    }
  };

  const walkable = (col: number, row: number) => {
    const v = current[row]?.[col];
    return v !== undefined && v !== 1;
  };

  const move = (dir: Dir): boolean => {
    if (machine.state !== 'playing' || step || death) return false;
    const { dCol, dRow } = DIR_DELTA[dir];
    const to = { col: tile.col + dCol, row: tile.row + dRow };
    if (!walkable(to.col, to.row)) return false; // no move, no turn
    const from = tile;
    facing = dir;
    tile = to;
    step = { from, to, startMs: chainStartMs ?? now() };
    emit('step', { from, to, dir, tile: { ...to }, world: at(to) });
    return true;
  };

  const input = createGridInput({ move, now });

  const self: Sim = {
    input,
    ignoreHazards: false,
    update() {
      ticks++;
      if (updateDeath()) {
        updateFlames();
        return;
      }
      updateFlames();
      if (death) return; // a go-live killed the hero this tick
      if (killable() && bladeHit()) {
        kill('blade');
        return;
      }
      if (step && now() + TIME_EPSILON >= step.startMs + STEP_MS) {
        const endMs = step.startMs + STEP_MS;
        step = null;
        land();
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
        levelMs: levelMs(),
        ignoreHazards: self.ignoreHazards,
        keys: pickups.keys,
        requiredKeys: pickups.requiredKeys,
        coins: session.coins,
        dying: death !== null,
        grace: inGrace(),
      };
    },
    timeAt(alpha) {
      return now() + alpha * TICK_MS;
    },
    levelAt(alpha) {
      const running = levelStartMs !== null && levelEndMs === null;
      return levelMs() + (running ? alpha * TICK_MS : 0);
    },
    heroPosition(alpha) {
      if (death && !death.respawned) return death.spot;
      if (!step) return tileToWorld(tile.col, tile.row);
      return stepPosition(step.from, step.to, (self.timeAt(alpha) - step.startMs) / STEP_MS);
    },
    heroFacing() {
      return death && !death.respawned ? death.facing : facing;
    },
    heroMoving() {
      return step !== null;
    },
    heroFallen() {
      return death !== null && !death.respawned;
    },
    on(type, listener) {
      listeners[type].push(listener);
    },
    load(level) {
      current = level.map;
      pickups = createPickups(level.map, level);
      tile = startTile(level.map);
      facing = 'south';
      step = null;
      chainStartMs = null;
      levelStartMs = null;
      levelEndMs = null;
      flames = level.flames ?? [];
      blades = level.blades ?? [];
      resetFlames();
      death = null;
      graceUntilMs = -Infinity;
      input.clear();
    },
    flames: () => {
      // One array, refilled per call (the flame view reads it every frame).
      const t = levelMs();
      flamesNow.length = flames.length;
      for (let i = 0; i < flames.length; i++) {
        const f = flames[i];
        if (!f) continue;
        const now = (flamesNow[i] ??= { tile: f.tile, phase: 0, state: 'off', intoMs: 0 });
        now.tile = f.tile;
        now.phase = f.phase;
        now.state = flameStates[i] ?? 'off';
        now.intoMs = flameClock(t, f.phase).intoMs;
      }
      return flamesNow;
    },
    blades: () => {
      const t = levelMs();
      return blades.map((b) => ({ ...b, angle: bladeAngle(t, b.phase) }));
    },
    dropKey() {
      const losses = pickups.loseKey();
      for (const loss of losses) {
        const where = { tile: loss.tile, world: at(loss.tile) };
        if (loss.type === 'keyHidden') emit('keyHidden', { ...where, index: loss.index });
        else emit('keyLost', { ...where, index: loss.index, keys: loss.keys });
      }
      return losses.length > 0;
    },
    keyVisible: (index) => pickups.keyVisible(index),
    coinVisible: (index) => pickups.coinVisible(index),
  };
  resetFlames();
  return self;
}
