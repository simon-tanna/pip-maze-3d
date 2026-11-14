import { describe, expect, it } from 'vitest';
import type { Level } from '@core/generator';
import type { WorldXZ } from '@core/grid';
import { tileToWorld } from '@core/grid';
import { flamePhase, levelFlames } from '@core/hazards';
import type { RunStart } from '@core/run-seed';
import { createSession, createSim, TICK_MS } from '@game/sim';
import { createDirector, createGameState, TRANSITION_TIMING } from '@game/state';
import type { LevelBuild, MachineState } from '@game/state';

// Level A: start (1,1), key (2,1), chest (3,1). Level B: start (3,1), key (2,1), chest (1,1).
const LEVEL_A: Level = {
  map: [
    [1, 1, 1, 1, 1],
    [1, 2, 0, 3, 1],
    [1, 1, 1, 1, 1],
  ],
  key: { col: 2, row: 1 },
  key2: null,
  coins: [],
  traps: [],
  exitCol: 3,
  exitRow: 1,
};
const LEVEL_B: Level = {
  map: [
    [1, 1, 1, 1, 1],
    [1, 3, 0, 2, 1],
    [1, 1, 1, 1, 1],
  ],
  key: { col: 2, row: 1 },
  key2: null,
  coins: [],
  traps: [],
  exitCol: 1,
  exitRow: 1,
};

const PINNED: RunStart = { base: 42, level: 0, seed: 42, pinned: true, warnings: [] };
const UNPINNED: RunStart = { base: 7, level: 0, seed: 7, pinned: false, warnings: [] };

function setup({
  run = PINNED,
  reduced = false,
  precompile = () => Promise.resolve(),
  generate = (index: number) => (index === 0 ? LEVEL_A : LEVEL_B),
}: {
  run?: RunStart;
  reduced?: boolean;
  precompile?: () => Promise<void>;
  generate?: (index: number, seed: number) => Level;
} = {}) {
  const machine = createGameState();
  const sim = createSim({ map: LEVEL_A.map, machine, session: createSession() });
  const log: string[] = [];
  const builds: LevelBuild[] = [];
  const iris: { kind: 'open' | 'close'; at: WorldXZ; ms: number }[] = [];
  const runs: RunStart[] = [];
  const errors: unknown[] = [];
  let precompiles = 0;
  let seeds = 100;
  const states: MachineState[] = [];
  machine.onChange((to) => states.push(to));
  const director = createDirector({
    machine,
    sim,
    view: {
      build(b) {
        builds.push(b);
        log.push(`build ${b.index}`);
      },
      precompile() {
        precompiles++;
        return precompile();
      },
    },
    transition: {
      close: (at, ms) => iris.push({ kind: 'close', at, ms }),
      open: (at, ms) => iris.push({ kind: 'open', at, ms }),
    },
    cameraRig: { resetLag: () => log.push('resetLag') },
    run,
    drawSeed: () => seeds++,
    reducedMotion: () => reduced,
    generate,
    onRun: (r) => runs.push(r),
    onError: (e) => errors.push(e),
  });
  const tick = (n = 1) => {
    for (let i = 0; i < n; i++) director.update();
  };
  /** Tick until the machine is in `state`; returns the ms it took. */
  const until = (state: MachineState, limit = 5000) => {
    const t0 = sim.snapshot().simMs;
    while (machine.state !== state) {
      if (sim.snapshot().simMs - t0 > limit) throw new Error(`never reached ${state}`);
      tick();
    }
    return sim.snapshot().simMs - t0;
  };
  /** Walk `n` tiles `dir` and stop. */
  const walk = (dir: 'east' | 'west', n: number) => {
    sim.input.press(dir);
    tick(Math.ceil((n * 120) / TICK_MS));
    sim.input.release(dir);
    tick(1);
  };
  const flush = () => new Promise((r) => setTimeout(r, 0));
  return {
    machine,
    sim,
    director,
    log,
    builds,
    iris,
    runs,
    errors,
    states,
    get precompiles() {
      return precompiles;
    },
    tick,
    until,
    walk,
    flush,
  };
}

/** Boot to `playing` on the first level. */
async function playing(opts?: Parameters<typeof setup>[0]) {
  const g = setup(opts);
  g.director.start();
  await g.flush();
  g.until('playing');
  return g;
}

describe('the director', () => {
  it('loads each level’s flames into the sim with phases seeded from the level seed', async () => {
    const traps: Level['traps'] = [
      { type: 'blade', col: 1, row: 1 },
      { type: 'flame', col: 2, row: 1 },
    ];
    const g = await playing({ generate: () => ({ ...LEVEL_A, traps }) });
    expect(g.sim.flames()).toEqual([
      expect.objectContaining({
        tile: { col: 2, row: 1 },
        phase: flamePhase(42, { col: 2, row: 1 }),
      }),
    ]);
    expect(g.sim.flames()).toEqual(levelFlames(traps, 42).map((f) => expect.objectContaining(f)));
  });

  it('builds the first level behind INK, precompiles once, then irises open on the hero', async () => {
    const g = setup();
    g.director.start();
    expect(g.machine.state).toBe('building');
    expect(g.log).toEqual(['build 0', 'resetLag']);
    expect(g.builds[0]).toMatchObject({ index: 0, seed: 42, level: LEVEL_A });
    expect(g.precompiles).toBe(1);
    g.tick(3);
    expect(g.machine.state).toBe('building'); // waiting on compileAsync
    await g.flush();
    g.tick();
    expect(g.machine.state).toBe('entering');
    expect(g.iris).toEqual([{ kind: 'open', at: tileToWorld(1, 1), ms: TRANSITION_TIMING.irisMs }]);
  });

  it('unlocks input once the iris has opened, and not before', async () => {
    const g = setup();
    g.director.start();
    await g.flush();
    g.until('entering');
    const ms = g.until('playing');
    expect(ms).toBeGreaterThanOrEqual(TRANSITION_TIMING.irisMs - 1e-6);
    expect(ms).toBeLessThan(TRANSITION_TIMING.irisMs + TICK_MS + 1e-6);
  });

  it('a direction held through entering does not walk on arrival', async () => {
    const g = setup();
    g.director.start();
    await g.flush();
    g.until('entering');
    g.sim.input.press('east');
    g.until('playing');
    g.tick(20);
    expect(g.sim.snapshot().tile).toEqual({ col: 1, row: 1 });
  });

  it('opening the chest clears input, leaves, waits 350 ms, then irises closed on the chest', async () => {
    const g = await playing();
    let openedAt = NaN;
    g.sim.on('chestOpened', () => (openedAt = g.sim.snapshot().simMs));
    g.walk('east', 2);
    expect(g.machine.state).toBe('leaving');
    expect(g.sim.snapshot().moving).toBe(false);
    expect(g.iris.filter((i) => i.kind === 'close')).toEqual([]);
    g.until('building'); // after delay + iris
    const wait = g.sim.snapshot().simMs - openedAt;
    expect(wait).toBeLessThan(
      TRANSITION_TIMING.chestDelayMs + TRANSITION_TIMING.irisMs + TICK_MS + 1e-6,
    );
    expect(wait).toBeGreaterThanOrEqual(
      TRANSITION_TIMING.chestDelayMs + TRANSITION_TIMING.irisMs - 1e-6,
    );
    expect(g.iris.at(-1)).toEqual({
      kind: 'close',
      at: tileToWorld(3, 1),
      ms: TRANSITION_TIMING.irisMs,
    });
  });

  it('a press during leaving does not move the hero (input is locked)', async () => {
    const g = await playing();
    g.walk('east', 2);
    g.sim.input.press('west');
    g.tick(5);
    expect(g.sim.snapshot().tile).toEqual({ col: 3, row: 1 });
  });

  it('leaving level 0 builds level 1 with levelSeed, resets camera lag, no second precompile', async () => {
    const g = await playing();
    g.walk('east', 2);
    g.until('building');
    expect(g.director.levelIndex).toBe(1);
    expect(g.builds[1]).toMatchObject({ index: 1, level: LEVEL_B });
    expect(g.builds[1]?.seed).not.toBe(42);
    expect(g.log.filter((l) => l === 'resetLag')).toHaveLength(2);
    expect(g.sim.snapshot().tile).toEqual({ col: 3, row: 1 }); // level B's start
    g.tick();
    expect(g.machine.state).toBe('entering');
    expect(g.precompiles).toBe(1);
    g.until('playing');
    expect(g.states).toEqual([
      'building',
      'entering',
      'playing',
      'leaving',
      'building',
      'entering',
      'playing',
    ]);
  });

  it('opening the last level’s chest ends the slice: keys reset, coins kept, input cleared', async () => {
    const g = await playing();
    g.walk('east', 2);
    g.until('playing');
    g.walk('west', 2);
    expect(g.sim.snapshot().keys).toBe(1);
    g.until('ended');
    expect(g.director.levelIndex).toBe(1);
    expect(g.sim.snapshot().keys).toBe(0);
    g.sim.input.press('east');
    g.tick(10);
    expect(g.machine.state).toBe('ended');
  });

  it('restart() acts only while ended', async () => {
    const g = await playing();
    expect(g.director.restart()).toBe(false);
    expect(g.machine.state).toBe('playing');
  });

  it('a pinned restart rebuilds the pinned level with the same seed, twice', async () => {
    const pinned1 = { ...PINNED, level: 1 };
    const g = await playing({ run: pinned1 });
    expect(g.builds[0]).toMatchObject({ index: 1, seed: 42 });
    for (let i = 0; i < 2; i++) {
      g.walk('west', 2);
      g.until('ended');
      expect(g.director.restart()).toBe(true);
      expect(g.machine.state).toBe('building');
      expect(g.builds.at(-1)).toMatchObject({ index: 1, seed: 42 });
      g.until('playing');
    }
    expect(g.runs).toEqual([]);
    expect(g.precompiles).toBe(1);
  });

  it('an unpinned restart starts at level 0 with a fresh base seed and reports the run', async () => {
    const g = await playing({ run: UNPINNED });
    g.walk('east', 2);
    g.until('playing');
    const level1Seed = g.builds[1]?.seed;
    g.walk('west', 2);
    g.until('ended');
    g.director.restart();
    expect(g.runs).toEqual([{ base: 100, level: 0, seed: 100, pinned: false, warnings: [] }]);
    expect(g.builds.at(-1)).toMatchObject({ index: 0, seed: 100 });
    expect(g.director.run.base).toBe(100);
    g.until('playing');
    g.walk('east', 2);
    g.until('building');
    expect(g.builds.at(-1)?.seed).not.toBe(level1Seed);
  });

  it('under reduced motion the iris is an instant cut', async () => {
    const g = await playing({ reduced: true });
    expect(g.iris[0]?.ms).toBe(0);
    g.walk('east', 2);
    const wait = g.until('building');
    expect(wait).toBeLessThan(TRANSITION_TIMING.chestDelayMs + TICK_MS + 1e-6);
    expect(g.iris.at(-1)?.ms).toBe(0);
    g.tick();
    expect(g.machine.state).toBe('entering');
    g.tick();
    expect(g.machine.state).toBe('playing');
  });

  it('a precompile rejection fails the machine and reports the error', async () => {
    const err = new Error('compile');
    const g = setup({ precompile: () => Promise.reject(err) });
    g.director.start();
    await g.flush();
    expect(g.machine.state).toBe('failed');
    expect(g.errors).toEqual([err]);
    g.tick(5);
    expect(g.machine.state).toBe('failed');
  });

  it('fail() reaches failed from loading (a GLB load error)', () => {
    const g = setup();
    const err = new Error('404');
    g.director.fail(err);
    expect(g.machine.state).toBe('failed');
    expect(g.errors).toEqual([err]);
    g.director.fail(err); // idempotent
    expect(g.errors).toHaveLength(1);
  });

  it('a build error fails the machine', () => {
    const g = setup();
    const machine = g.machine;
    const director = createDirector({
      machine,
      sim: g.sim,
      view: {
        build() {
          throw new Error('bad level');
        },
        precompile: () => Promise.resolve(),
      },
      transition: { close() {}, open() {} },
      cameraRig: { resetLag() {} },
      run: PINNED,
      drawSeed: () => 1,
      reducedMotion: () => false,
      onError: (e) => g.errors.push(e),
    });
    director.start();
    expect(machine.state).toBe('failed');
    expect(g.errors).toHaveLength(1);
  });
});
