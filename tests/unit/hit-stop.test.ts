import { describe, expect, it } from 'vitest';
import { createSession, createSim, HIT_STOP, TICK_MS } from '@game/sim';
import { createGameState } from '@game/state';

// Start (1,1), key (2,1), a flame at (3,1), chest (5,1).
const MAP = [
  [1, 1, 1, 1, 1, 1, 1],
  [1, 2, 0, 0, 0, 3, 1],
  [1, 1, 1, 1, 1, 1, 1],
];

function setup(opts: { hitStopTicks?: () => number } = {}) {
  const machine = createGameState();
  const sim = createSim({
    map: MAP,
    machine,
    pickups: { coins: [], key: { col: 2, row: 1 }, key2: null },
    session: createSession(),
    flames: [{ tile: { col: 3, row: 1 }, phase: 0 }],
    ...opts,
  });
  machine.go('building');
  machine.go('entering');
  machine.go('playing');
  return sim;
}

/** Step east onto the key; returns the snapshot on the pickup tick. */
function pickUpKey(sim: ReturnType<typeof setup>) {
  let picked = false;
  sim.on('key', () => (picked = true));
  sim.input.press('east');
  sim.input.release('east');
  while (!picked) sim.update();
  return sim.snapshot();
}

describe('hit-stop (spec: Simulation → Hit-stop)', () => {
  it('a key pickup skips exactly 4 update ticks, and the hazard clock holds through them', () => {
    expect(HIT_STOP.keyTicks).toBe(4);
    const sim = setup();
    const at = pickUpKey(sim);
    expect(at.hitStop).toBe(true);
    for (let i = 0; i < 4; i++) {
      sim.update();
      const s = sim.snapshot();
      expect(s.simMs).toBe(at.simMs);
      expect(s.levelMs).toBe(at.levelMs);
    }
    sim.update();
    const after = sim.snapshot();
    expect(after.simMs).toBeCloseTo(at.simMs + TICK_MS, 9);
    expect(after.levelMs).toBeCloseTo(at.levelMs + TICK_MS, 9);
    expect(after.hitStop).toBe(false);
    expect(after.skippedTicks).toBe(4);
  });

  it('input and the flames freeze with it', () => {
    const sim = setup();
    pickUpKey(sim);
    sim.input.press('east'); // pressed inside the stop: held, it fires when the stop ends
    const flames = () => sim.flames().map((f) => ({ ...f }));
    const before = { tile: sim.snapshot().tile, flames: flames() };
    for (let i = 0; i < 4; i++) sim.update();
    expect(sim.snapshot().tile).toEqual(before.tile);
    expect(sim.snapshot().moving).toBe(false);
    expect(flames()).toEqual(before.flames);
    sim.update();
    expect(sim.snapshot().moving).toBe(true); // the held key fires on the first live tick
  });

  it('is capped at 1 tick under reduced motion', () => {
    expect(HIT_STOP.reducedTicks).toBe(1);
    const sim = setup({ hitStopTicks: () => HIT_STOP.reducedTicks });
    const at = pickUpKey(sim);
    sim.update();
    expect(sim.snapshot().simMs).toBe(at.simMs);
    sim.update();
    expect(sim.snapshot().simMs).toBeCloseTo(at.simMs + TICK_MS, 9);
    expect(sim.snapshot().skippedTicks).toBe(1);
  });

  it('none on death', () => {
    const sim = setup();
    sim.ignoreHazards = true;
    pickUpKey(sim);
    for (let i = 0; i < 4; i++) sim.update();
    sim.ignoreHazards = false;
    let died = false;
    sim.on('died', () => (died = true));
    sim.input.press('east');
    sim.input.release('east');
    for (let i = 0; i < 600 && !died; i++) sim.update(); // onto the flame; it goes live
    expect(died).toBe(true);
    const at = sim.snapshot();
    sim.update();
    expect(sim.snapshot().simMs).toBeCloseTo(at.simMs + TICK_MS, 9);
    expect(sim.snapshot().skippedTicks).toBe(4);
  });
});
