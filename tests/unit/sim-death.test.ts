import { describe, expect, it } from 'vitest';
import type { Flame } from '@core/hazards';
import { createSession, createSim, TICK_MS } from '@game/sim';
import type { SimEvents } from '@game/sim';
import { createGameState } from '@game/state';

// 0 floor, 1 wall, 2 start, 3 chest. Start (1,1); a corridor east to the chest at (7,1).
const MAP = [
  [1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 2, 0, 0, 0, 0, 0, 3, 1],
  [1, 0, 1, 1, 1, 1, 1, 1, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1],
];
const START = { col: 1, row: 1 };
const KEY = { col: 2, row: 1 };
const COIN = { col: 3, row: 1 };

/** Ticks until the hazard clock (0 at `entering`) reaches `ms`, rounding up. */
const ticksFor = (ms: number) => Math.ceil(ms / TICK_MS - 1e-9);

function setup(flames: Flame[], { key2 = null as { col: number; row: number } | null } = {}) {
  const machine = createGameState();
  const session = createSession();
  const sim = createSim({
    map: MAP,
    machine,
    pickups: { coins: [COIN], key: KEY, key2 },
    session,
    flames,
  });
  machine.go('building');
  machine.go('entering');
  machine.go('playing');
  const log: { type: keyof SimEvents; ms: number; tile?: unknown }[] = [];
  for (const type of [
    'died',
    'respawned',
    'hazardLive',
    'keyLost',
    'keyHidden',
    'chestOpened',
    'landed',
  ] as const) {
    sim.on(type, (e: { tile?: unknown }) =>
      log.push({ type, ms: sim.snapshot().levelMs, tile: e.tile }),
    );
  }
  const tick = (n = 1) => {
    for (let i = 0; i < n; i++) sim.update();
  };
  /** Tick until the hazard clock reaches `ms`. */
  const until = (ms: number) => tick(Math.max(0, ticksFor(ms) - ticksFor(sim.snapshot().levelMs)));
  /** One tile step `dir`, ticked until it lands. */
  const stepTo = (dir: 'east' | 'west' | 'south' | 'north') => {
    sim.input.press(dir);
    sim.input.release(dir);
    while (sim.snapshot().moving) tick();
  };
  const types = () => log.map((e) => e.type);
  return { sim, machine, session, log, tick, until, stepTo, types };
}

// A flame whose first go-live is at 500 + phase: phase 4000 keeps it off for 4.5 s.
const OFF_FOR_A_WHILE = 4000;

describe('flames kill', () => {
  it('landing on a live flame kills: back to the start, facing south, dying', () => {
    const g = setup([{ tile: { col: 2, row: 1 }, phase: 0 }]); // on from 500 to 2500
    g.until(600);
    g.stepTo('east');
    expect(g.types()).toContain('died');
    expect(g.sim.snapshot()).toMatchObject({
      tile: START,
      facing: 'south',
      moving: false,
      dying: true,
      grace: false,
    });
  });

  it('a hero landing during the telegraph lives', () => {
    const g = setup([{ tile: { col: 2, row: 1 }, phase: 0 }]);
    g.stepTo('east'); // lands at ~133 ms, telegraph
    expect(g.types()).not.toContain('died');
    expect(g.sim.snapshot().tile).toEqual({ col: 2, row: 1 });
  });

  it('go-live emits hazardLive and re-checks the occupant: a hero standing on it dies', () => {
    const g = setup([{ tile: { col: 2, row: 1 }, phase: 1000 }]); // goes live at 1500
    g.stepTo('east');
    g.until(1500 - TICK_MS);
    expect(g.types()).not.toContain('died');
    g.tick();
    expect(g.types().filter((t) => t === 'hazardLive' || t === 'died')).toEqual([
      'hazardLive',
      'died',
    ]);
    const live = g.log.find((e) => e.type === 'hazardLive');
    expect(live?.tile).toEqual({ col: 2, row: 1 });
    expect(g.sim.snapshot().tile).toEqual(START);
  });

  it('a go-live on another tile leaves the hero alone', () => {
    const g = setup([{ tile: { col: 4, row: 1 }, phase: 0 }]);
    g.stepTo('east');
    g.until(600);
    expect(g.types()).toEqual(['landed', 'hazardLive']);
  });

  it('hazardsOff: flames ignore the hero, live', () => {
    const g = setup([{ tile: { col: 2, row: 1 }, phase: 0 }]);
    g.sim.ignoreHazards = true;
    g.until(600);
    g.stepTo('east');
    expect(g.types()).not.toContain('died');
    g.sim.ignoreHazards = false;
    g.until(4500 + 500);
    expect(g.types()).toContain('died');
  });
});

describe('death sequence', () => {
  /** Die on a flame at (2,1) that is on from 500 to 2500. Returns the death tick's clock. */
  function die(g: ReturnType<typeof setup>) {
    g.until(600);
    g.stepTo('east');
    const died = g.log.find((e) => e.type === 'died');
    if (!died) throw new Error('did not die');
    return died.ms;
  }

  it('respawns at the first tick ≥ 270 ms with 1 s grace, and unlocks input at 530 ms', () => {
    const g = setup([{ tile: { col: 2, row: 1 }, phase: 0 }]);
    const t0 = die(g);
    const at = (ms: number) => g.until(t0 + ms);
    at(270 - TICK_MS);
    expect(g.types()).not.toContain('respawned');
    g.tick();
    expect(g.types()).toContain('respawned');
    expect(g.log.find((e) => e.type === 'respawned')?.ms).toBeGreaterThanOrEqual(t0 + 270);
    expect(g.sim.snapshot()).toMatchObject({ dying: true, grace: true, tile: START });

    // Input stays locked until 530 ms; a held key then walks.
    g.sim.input.press('south');
    at(530 - TICK_MS);
    expect(g.sim.snapshot()).toMatchObject({ dying: true, moving: false, tile: START });
    g.tick();
    expect(g.sim.snapshot()).toMatchObject({
      dying: false,
      moving: true,
      tile: { col: 1, row: 2 },
    });
    g.sim.input.release('south');

    // Grace lasts 1 s from the respawn.
    at(270 + 1000 - TICK_MS);
    expect(g.sim.snapshot().grace).toBe(true);
    g.tick();
    expect(g.sim.snapshot().grace).toBe(false);
  });

  it('a buffered press fires when input unlocks', () => {
    const g = setup([{ tile: { col: 2, row: 1 }, phase: 0 }]);
    const t0 = die(g);
    g.until(t0 + 450);
    g.sim.input.press('south');
    g.sim.input.release('south');
    g.until(t0 + 530 + TICK_MS);
    expect(g.sim.snapshot()).toMatchObject({ moving: true, tile: { col: 1, row: 2 } });
  });

  it('the hero shows at the death spot until respawn, then at the start', () => {
    const g = setup([{ tile: { col: 2, row: 1 }, phase: 0 }]);
    const t0 = die(g);
    expect(g.sim.heroPosition(0)).toEqual({ x: 5, z: 3 }); // (2,1), where it died
    g.until(t0 + 270 + TICK_MS);
    expect(g.sim.heroPosition(0)).toEqual({ x: 3, z: 3 }); // start (1,1)
  });

  it('drops the most recent key (it reappears); coins are untouched', () => {
    // Key at (2,1), coin at (3,1), flame at (4,1) on from 500 + 4000.
    const g = setup([{ tile: { col: 4, row: 1 }, phase: OFF_FOR_A_WHILE }]);
    g.stepTo('east'); // key
    g.stepTo('east'); // coin
    expect(g.sim.snapshot()).toMatchObject({ keys: 1, coins: 1 });
    expect(g.sim.keyVisible(0)).toBe(false);
    g.until(OFF_FOR_A_WHILE + 600);
    g.stepTo('east');
    expect(g.types()).toContain('died');
    expect(g.log.find((e) => e.type === 'keyLost')?.tile).toEqual(KEY);
    expect(g.sim.snapshot()).toMatchObject({ keys: 0, coins: 1 });
    expect(g.session.coins).toBe(1);
    expect(g.sim.keyVisible(0)).toBe(true);
    expect(g.sim.coinVisible(0)).toBe(false);
  });

  it('losing key 1 also hides an uncollected key 2 (two-key level)', () => {
    const g = setup([{ tile: { col: 4, row: 1 }, phase: OFF_FOR_A_WHILE }], {
      key2: { col: 1, row: 2 },
    });
    g.stepTo('east'); // key 1: reveals key 2
    expect(g.sim.keyVisible(1)).toBe(true);
    g.stepTo('east');
    g.until(OFF_FOR_A_WHILE + 600);
    g.stepTo('east');
    expect(g.types()).toEqual(expect.arrayContaining(['died', 'keyHidden', 'keyLost']));
    expect(g.sim.keyVisible(0)).toBe(true);
    expect(g.sim.keyVisible(1)).toBe(false);
    expect(g.sim.snapshot().keys).toBe(0);
  });

  it('a death with no key held drops nothing', () => {
    // The key sits on the flame tile: hazards run before pickups, so it is never taken.
    const g = setup([{ tile: { col: 2, row: 1 }, phase: 0 }]);
    die(g);
    expect(g.types()).not.toContain('keyLost');
    expect(g.sim.keyVisible(0)).toBe(true);
    expect(g.sim.snapshot().keys).toBe(0);
  });
});

describe('what blocks a kill', () => {
  it('dying blocks it: a go-live on the start tile while dying does not kill twice', () => {
    const g = setup([
      { tile: { col: 2, row: 1 }, phase: 0 }, // kills at ~733
      { tile: START, phase: 300 }, // live at 800: dying (died ~733, respawns ~1003)
    ]);
    g.until(600);
    g.stepTo('east');
    g.until(1000);
    expect(g.types().filter((t) => t === 'died')).toHaveLength(1);
    expect(g.types().filter((t) => t === 'hazardLive')).toHaveLength(2);
  });

  it('grace blocks a landing on a live flame', () => {
    const g = setup([{ tile: { col: 2, row: 1 }, phase: 0 }]); // on 500–2500
    g.until(600);
    g.stepTo('east'); // dies ~733; unlocks ~1263; grace until ~2003
    g.until(1300);
    g.stepTo('east');
    expect(g.types().filter((t) => t === 'died')).toHaveLength(1);
    expect(g.sim.snapshot()).toMatchObject({ tile: { col: 2, row: 1 }, grace: true });
  });

  it('grace ending in a live flame does not kill; the next go-live does', () => {
    // Flame at (2,1): phase 0, on 500–2500, then again 5000–7000.
    const g = setup([{ tile: { col: 2, row: 1 }, phase: 0 }]);
    g.until(600);
    g.stepTo('east'); // dies ~733; grace ends ~2003, flame on until 2500
    g.until(1300);
    g.stepTo('east');
    g.until(2400);
    expect(g.sim.snapshot().grace).toBe(false);
    expect(g.types().filter((t) => t === 'died')).toHaveLength(1);
    g.until(5000 + TICK_MS);
    expect(g.types().filter((t) => t === 'died')).toHaveLength(2);
  });

  it('a death and a chest landing on the same tick resolve as death', () => {
    // Synthetic: a flame on the chest tile (7,1), live 500 + 4000 → 6500.
    const g = setup([{ tile: { col: 7, row: 1 }, phase: OFF_FOR_A_WHILE }]);
    g.stepTo('east'); // key
    for (let i = 0; i < 4; i++) g.stepTo('east'); // to (6,1)
    g.until(OFF_FOR_A_WHILE + 600);
    g.stepTo('east');
    expect(g.types()).toContain('died');
    expect(g.types()).not.toContain('chestOpened');
    expect(g.sim.snapshot().tile).toEqual(START);
  });

  it('a go-live during leaving does not kill (the hazard clock stops)', () => {
    const g = setup([{ tile: { col: 7, row: 1 }, phase: 2000 }]); // live 2500
    g.stepTo('east'); // key
    for (let i = 0; i < 5; i++) g.stepTo('east'); // onto the chest, ~800 ms
    expect(g.types()).toContain('chestOpened');
    g.machine.go('leaving');
    g.tick(ticksFor(3000));
    expect(g.types()).not.toContain('hazardLive');
    expect(g.types()).not.toContain('died');
  });
});

describe('loading a level resets hazards', () => {
  it('clears dying and grace, and swaps in the new flames on a restarted clock', () => {
    const g = setup([{ tile: { col: 2, row: 1 }, phase: 0 }]);
    g.until(600);
    g.stepTo('east');
    expect(g.sim.snapshot().dying).toBe(true);
    g.machine.go('leaving');
    g.machine.go('building');
    g.sim.load({
      map: MAP,
      coins: [],
      key: KEY,
      key2: null,
      flames: [{ tile: { col: 3, row: 1 }, phase: 0 }],
    });
    expect(g.sim.snapshot()).toMatchObject({ dying: false, grace: false, tile: START });
    expect(g.sim.flames().map((f) => f.tile)).toEqual([{ col: 3, row: 1 }]);
    g.machine.go('entering');
    g.machine.go('playing');
    g.stepTo('east'); // (2,1): no flame here now
    expect(g.types().filter((t) => t === 'died')).toHaveLength(1);
  });

  it('flames() reports each flame’s current state and how long it has been in it', () => {
    const g = setup([{ tile: { col: 4, row: 1 }, phase: 0 }]);
    expect(g.sim.flames()).toEqual([
      { tile: { col: 4, row: 1 }, phase: 0, state: 'telegraph', intoMs: 0 },
    ]);
    g.until(600);
    const [now] = g.sim.flames();
    expect(now?.state).toBe('on');
    // The same hazard clock as the rule: ms since this go-live, one tick's worth at most off.
    const levelMs = g.sim.snapshot().levelMs;
    expect(now?.intoMs).toBeCloseTo(levelMs - 500, 6);
  });
});
