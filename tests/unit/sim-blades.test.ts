import { describe, expect, it } from 'vitest';
import { bladeTouches } from '@core/blade';
import type { Blade } from '@core/blade';
import type { Flame } from '@core/hazards';
import { tileToWorld } from '@core/grid';
import { createSim, TICK_MS } from '@game/sim';
import type { SimEvents } from '@game/sim';
import { createGameState } from '@game/state';

// 0 floor, 1 wall, 2 start, 3 chest. Start (1,1); an east–west corridor to the chest at (7,1).
const MAP = [
  [1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 2, 0, 0, 0, 0, 0, 3, 1],
  [1, 0, 1, 1, 1, 1, 1, 1, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1],
];
const START = { col: 1, row: 1 };
const BLADE = { col: 4, row: 1 };

const ticksFor = (ms: number) => Math.ceil(ms / TICK_MS - 1e-9);

function setup(blades: Blade[], flames: Flame[] = []) {
  const machine = createGameState();
  const sim = createSim({
    map: MAP,
    machine,
    pickups: { coins: [], key: { col: 1, row: 2 }, key2: null },
    flames,
    blades,
  });
  machine.go('building');
  machine.go('entering');
  machine.go('playing');
  const log: { type: keyof SimEvents; ms: number; e: unknown; x: number }[] = [];
  for (const type of ['died', 'respawned', 'landed'] as const) {
    sim.on(type, (e) =>
      log.push({ type, ms: sim.snapshot().levelMs, e, x: sim.heroPosition(0).x }),
    );
  }
  const tick = (n = 1) => {
    for (let i = 0; i < n; i++) sim.update();
  };
  const until = (ms: number) => tick(Math.max(0, ticksFor(ms) - ticksFor(sim.snapshot().levelMs)));
  const stepTo = (dir: 'east' | 'west') => {
    sim.input.press(dir);
    sim.input.release(dir);
    while (sim.snapshot().moving) tick();
  };
  const deaths = () => log.filter((l) => l.type === 'died');
  return { sim, machine, log, tick, until, stepTo, deaths };
}

describe('blades kill by contact', () => {
  it('walking through a blade at a lethal phase kills mid-step, before the landing', () => {
    // Phase 0: head straight down at t = 1600 k.
    const g = setup([{ tile: BLADE, phase: 0 }]);
    g.stepTo('east');
    g.stepTo('east'); // (3,1)
    g.until(1500);
    g.stepTo('east');
    const [died] = g.deaths();
    expect(died?.e).toMatchObject({ tile: BLADE, hazard: 'blade' });
    // Cut mid-step: drawn between (3,1) and the blade's tile centre, inside the contact zone.
    const bladeX = tileToWorld(BLADE.col, BLADE.row).x;
    expect(died?.x).toBeGreaterThan(bladeX - 0.45);
    expect(died?.x).toBeLessThan(bladeX);
    expect(
      g.log.some((l) => l.type === 'landed' && (l.e as SimEvents['landed']).tile.col === 4),
    ).toBe(false);
    expect(g.sim.snapshot()).toMatchObject({ tile: START, dying: true });
  });

  it('passing under it while it is up does not kill', () => {
    // Phase 800: overhead at t = 0, lethal again only from ~676 ms.
    const g = setup([{ tile: BLADE, phase: 800 }]);
    for (let i = 0; i < 5; i++) g.stepTo('east'); // through (4,1) to (6,1) by ~600 ms
    expect(g.sim.snapshot().levelMs).toBeLessThan(676);
    g.until(3000);
    expect(g.deaths()).toHaveLength(0);
    expect(g.sim.snapshot().tile).toEqual({ col: 6, row: 1 });
  });

  it('a hero standing on the blade tile dies when the head comes round', () => {
    const g = setup([{ tile: BLADE, phase: 800 }]);
    for (let i = 0; i < 3; i++) g.stepTo('east');
    expect(g.deaths()).toHaveLength(0);
    g.until(800);
    expect(g.deaths()).toHaveLength(1);
    expect(g.deaths()[0]?.ms).toBeLessThan(700);
  });

  it('hazardsOff: blades ignore the hero', () => {
    const g = setup([{ tile: BLADE, phase: 800 }]);
    g.sim.ignoreHazards = true;
    for (let i = 0; i < 3; i++) g.stepTo('east');
    g.until(3200);
    expect(g.deaths()).toHaveLength(0);
  });

  it('a respawn while a blade’s contact zone covers the start tile does not kill in grace', () => {
    // A flame at (2,1) is on 500–2500: die there at ~733, respawn ~1003, grace to ~2003.
    // A blade on the start tile (phase 475): its head is down at 1125 ± 124 ms, in grace,
    // and again at 2725 ± 124, after it.
    const g = setup([{ tile: START, phase: 475 }], [{ tile: { col: 2, row: 1 }, phase: 0 }]);
    g.until(600);
    g.stepTo('east');
    expect(g.deaths()).toHaveLength(1);
    g.until(1125);
    expect(g.sim.snapshot()).toMatchObject({ tile: START, grace: true });
    const [blade] = g.sim.blades();
    expect(bladeTouches(blade?.angle ?? NaN, 0, 0)).toBe(true); // the zone covers the hero
    g.until(2400);
    expect(g.deaths()).toHaveLength(1);
    g.until(2800);
    expect(g.deaths()).toHaveLength(2);
    expect(g.deaths()[1]?.e).toMatchObject({ tile: START, hazard: 'blade' });
  });

  it('flames report their kills as flame', () => {
    const g = setup([], [{ tile: { col: 2, row: 1 }, phase: 0 }]);
    g.until(600);
    g.stepTo('east');
    expect(g.deaths()[0]?.e).toMatchObject({ hazard: 'flame' });
  });
});

describe('blades on the hazard clock', () => {
  it('blades() reports each blade’s angle now; load swaps them in on a restarted clock', () => {
    const g = setup([{ tile: BLADE, phase: 400 }]);
    expect(g.sim.blades()).toEqual([{ tile: BLADE, phase: 400, angle: 90 }]);
    g.until(400);
    expect(g.sim.blades()[0]?.angle).toBeCloseTo(-180 + (g.sim.snapshot().levelMs - 400) * 0.225);
    g.machine.go('leaving');
    g.machine.go('building');
    g.sim.load({ map: MAP, coins: [], key: { col: 1, row: 2 }, key2: null, blades: [] });
    expect(g.sim.blades()).toEqual([]);
    g.sim.load({ map: MAP, coins: [], key: { col: 1, row: 2 }, key2: null });
    expect(g.sim.blades()).toEqual([]);
  });
});
