import { describe, expect, it } from 'vitest';
import { tileToWorld } from '@core/grid';
import { STEP_MS } from '@core/step';
import { createSim, TICK_MS } from '@game/sim';
import { createGameState } from '@game/state';

// 0 floor, 1 wall, 2 start. Start at (1,1): a 12-tile corridor east, one tile south.
const MAP = [
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
];

function playing() {
  const machine = createGameState();
  const sim = createSim({ map: MAP, machine });
  machine.go('building');
  machine.go('entering');
  machine.go('playing');
  return { sim, machine };
}

const ticks = (sim: { update(): void }, n: number) => {
  for (let i = 0; i < n; i++) sim.update();
};

describe('hero simulation', () => {
  it('stands on the start tile, facing south', () => {
    const { sim } = playing();
    expect(sim.snapshot()).toMatchObject({
      tile: { col: 1, row: 1 },
      facing: 'south',
      moving: false,
    });
    expect(sim.heroPosition(0)).toEqual(tileToWorld(1, 1));
  });

  it('takes the destination tile at step start and lands after 120 ms', () => {
    const { sim } = playing();
    const landed: number[] = [];
    sim.on('landed', () => landed.push(sim.snapshot().simMs));
    sim.input.press('east');
    sim.input.release('east');
    expect(sim.snapshot()).toMatchObject({
      tile: { col: 2, row: 1 },
      facing: 'east',
      moving: true,
    });
    ticks(sim, 10);
    expect(landed).toEqual([8 * TICK_MS]); // first tick at or after 120 ms
    expect(sim.snapshot().moving).toBe(false);
  });

  it('10 chained held steps take 1200 ms ± 1 tick, each carrying its overshoot', () => {
    const { sim } = playing();
    const landed: number[] = [];
    sim.on('landed', () => landed.push(sim.snapshot().simMs));
    sim.input.press('east');
    while (landed.length < 10) sim.update();
    const last = landed.at(-1) ?? 0;
    expect(last).toBeGreaterThanOrEqual(10 * STEP_MS);
    expect(last).toBeLessThan(10 * STEP_MS + TICK_MS + 1e-6);
    expect(sim.snapshot().tile).toEqual({ col: 12, row: 1 });
  });

  it('heroPosition interpolates mid-step from the step start, between ticks', () => {
    const { sim } = playing();
    sim.input.press('east');
    sim.input.release('east');
    ticks(sim, 3); // 50 ms in
    const a = tileToWorld(1, 1).x;
    const b = tileToWorld(2, 1).x;
    expect(sim.heroPosition(0).x).toBeCloseTo(a + ((b - a) * 50) / STEP_MS, 9);
    expect(sim.heroPosition(0.5).x).toBeCloseTo(a + ((b - a) * (50 + TICK_MS / 2)) / STEP_MS, 9);
  });

  it('a key into a wall does nothing: no move, no turn', () => {
    const { sim } = playing();
    sim.input.press('north');
    sim.input.release('north');
    ticks(sim, 12);
    expect(sim.snapshot()).toMatchObject({
      tile: { col: 1, row: 1 },
      facing: 'south',
      moving: false,
    });
    sim.input.press('west');
    expect(sim.snapshot()).toMatchObject({ tile: { col: 1, row: 1 }, facing: 'south' });
  });

  it('input stays locked until playing, then held keys fire', () => {
    const machine = createGameState();
    const sim = createSim({ map: MAP, machine });
    machine.go('building');
    machine.go('entering');
    sim.input.press('south');
    ticks(sim, 2);
    expect(sim.snapshot()).toMatchObject({ tile: { col: 1, row: 1 }, machine: 'entering' });
    machine.go('playing');
    sim.update();
    expect(sim.snapshot()).toMatchObject({ tile: { col: 1, row: 2 }, facing: 'south' });
  });

  it('level time starts at 0 when entering begins', () => {
    const machine = createGameState();
    const sim = createSim({ map: MAP, machine });
    ticks(sim, 5);
    expect(sim.snapshot().levelMs).toBe(0);
    machine.go('building');
    machine.go('entering');
    ticks(sim, 6);
    expect(sim.snapshot().levelMs).toBeCloseTo(100, 9);
  });
});
