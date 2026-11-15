/**
 * Proves the shared e2e fixture against the real generator and simulation: each route's
 * walk plan, replayed on a paused loop exactly as `__game.sim` would run it, visits its
 * pickups in order and lands on each leg's tile. If the generator or step timing ever
 * changes, this fails here rather than as a confusing e2e timeout.
 */
import { describe, expect, it } from 'vitest';
import { DIR_DELTA } from '@core/grid-input';
import { generateLevel, levelSeed } from '@core/generator';
import { startTile } from '@core/level';
import { createFixedLoop } from '@game/loop';
import type { FixedLoop } from '@game/loop';
import { createSim } from '@game/sim';
import type { Sim } from '@game/sim';
import { createGameState } from '@game/state';
import { BASE_SEED, LEVEL_0, LEVEL_1, ROUTES, walkOps } from '../e2e/fixtures/routes';

/** The `settle` op, as `__game.sim.settle()` runs it: updates until any hit-stop is over. */
function settle(sim: Sim, loop: FixedLoop) {
  while (sim.snapshot().hitStop) loop.step(0.5);
}

const key = (t: { col: number; row: number }) => `${t.col},${t.row}`;

describe('shared e2e routes', () => {
  it('level 1 is the pinned run’s second level', () => {
    expect(LEVEL_1.seed).toBe(levelSeed(BASE_SEED, 1));
  });

  for (const route of ROUTES) {
    it(`level ${route.level}: the walk plan visits coin → key → chest on the real sim`, () => {
      const level = generateLevel(route.level, route.seed);
      expect(startTile(level.map)).toEqual(route.start);
      const [coin, keyLeg, chest] = route.legs;
      expect(level.coins.map(key)).toContain(key(coin?.tile ?? { col: -1, row: -1 }));
      expect(keyLeg?.tile).toEqual(level.key);
      expect(chest?.tile).toEqual({ col: level.exitCol, row: level.exitRow });
      const wall = DIR_DELTA[route.wallFromStart];
      expect(level.map[route.start.row + wall.dRow]?.[route.start.col + wall.dCol]).toBe(1);

      const machine = createGameState();
      const sim = createSim({ map: level.map, machine, pickups: level });
      machine.go('building');
      machine.go('entering');
      machine.go('playing');
      const loop = createFixedLoop({ update: () => sim.update(), render: () => {} });
      loop.paused = true;

      const visited: string[] = [];
      sim.on('landed', ({ tile }) => visited.push(key(tile)));
      const hazards = new Map(level.traps.map((t) => [key(t), t.type]));
      for (const leg of route.legs) {
        const from = visited.length;
        for (const op of walkOps(leg.moves)) {
          if (op.op === 'advance') loop.step(op.ms);
          else if (op.op === 'settle') settle(sim, loop);
          else sim.input[op.op](op.dir);
        }
        const steps = visited.slice(from);
        expect(sim.snapshot()).toMatchObject({ tile: leg.tile, moving: false });
        expect(steps.length).toBe(leg.moves.reduce((n, [, tiles]) => n + tiles, 0));
        const crossed = steps.filter((t) => hazards.has(t)).map((t) => `${hazards.get(t)}@${t}`);
        expect(crossed).toEqual(leg.hazards);
      }
      // Pickups in order: no later pickup is stepped on before its leg.
      const order = route.legs.map((l) => visited.indexOf(key(l.tile)));
      expect(order).toEqual([...order].sort((a, b) => a - b));
    });
  }

  it('level 0: chestWithoutKey walks from the coin to the locked chest, missing the key', () => {
    const level = generateLevel(0, LEVEL_0.seed);
    const machine = createGameState();
    const sim = createSim({ map: level.map, machine, pickups: level });
    machine.go('building');
    machine.go('entering');
    machine.go('playing');
    const loop = createFixedLoop({ update: () => sim.update(), render: () => {} });
    loop.paused = true;
    const visited: string[] = [];
    let locked = 0;
    sim.on('landed', ({ tile }) => visited.push(key(tile)));
    sim.on('chestLocked', () => locked++);
    const hazards = new Map(level.traps.map((t) => [key(t), t.type]));
    const coinLeg = LEVEL_0.legs[0]?.moves ?? [];
    const detour = LEVEL_0.chestWithoutKey;
    for (const op of walkOps([...coinLeg, ...(detour?.moves ?? [])])) {
      if (op.op === 'advance') loop.step(op.ms);
      else if (op.op === 'settle') settle(sim, loop);
      else sim.input[op.op](op.dir);
    }
    expect(sim.snapshot()).toMatchObject({
      tile: { col: level.exitCol, row: level.exitRow },
      keys: 0,
    });
    expect(locked).toBe(1);
    expect(visited).not.toContain(key(level.key));
    const crossed = visited.filter((t) => hazards.has(t)).map((t) => `${hazards.get(t)}@${t}`);
    expect(crossed).toEqual(detour?.hazards);
  });
});
