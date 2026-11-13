import { describe, expect, it } from 'vitest';
import { tileToWorld } from '@core/grid';
import type { GridPos } from '@core/grid';
import { createSession, createSim } from '@game/sim';
import type { SimEvents } from '@game/sim';
import { createGameState } from '@game/state';

// A corridor east from the start (1,1) to the chest (map value 3) at (9,1).
const MAP = [
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 2, 0, 0, 0, 0, 0, 0, 0, 3, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
];

const ONE_KEY = { coins: [{ col: 2, row: 1 }], key: { col: 4, row: 1 }, key2: null };
const TWO_KEYS = { coins: [], key: { col: 3, row: 1 }, key2: { col: 5, row: 1 } };

type Recorded = { type: keyof SimEvents; tile: GridPos };

function playing(pickups: typeof ONE_KEY | typeof TWO_KEYS, session = createSession()) {
  const machine = createGameState();
  const sim = createSim({ map: MAP, machine, pickups, session });
  machine.go('building');
  machine.go('entering');
  machine.go('playing');
  const events: Recorded[] = [];
  for (const type of [
    'step',
    'landed',
    'coin',
    'key',
    'keyRevealed',
    'keyLost',
    'keyHidden',
    'chestLocked',
    'chestOpened',
  ] as const) {
    sim.on(type, (e) => events.push({ type, tile: e.tile }));
  }
  /** Walk east `n` tiles, tapping each step and running ticks until it lands. */
  const east = (n: number) => {
    for (let i = 0; i < n; i++) {
      sim.input.press('east');
      sim.input.release('east');
      while (sim.snapshot().moving) sim.update();
    }
  };
  return { sim, events, east, session };
}

const types = (events: Recorded[]) => events.map((e) => e.type);

describe('pickups on landing', () => {
  it('step carries the destination tile and world position', () => {
    const machine = createGameState();
    const sim = createSim({ map: MAP, machine, pickups: ONE_KEY });
    machine.go('building');
    machine.go('entering');
    machine.go('playing');
    const steps: SimEvents['step'][] = [];
    sim.on('step', (e) => steps.push(e));
    sim.input.press('east');
    expect(steps).toEqual([
      {
        from: { col: 1, row: 1 },
        to: { col: 2, row: 1 },
        dir: 'east',
        tile: { col: 2, row: 1 },
        world: tileToWorld(2, 1),
      },
    ]);
  });

  it('a coin banks into the session total on landing, once', () => {
    const { sim, events, east, session } = playing(ONE_KEY);
    east(1);
    expect(types(events)).toEqual(['step', 'landed', 'coin']);
    expect(events[2]?.tile).toEqual({ col: 2, row: 1 });
    expect(sim.snapshot().coins).toBe(1);
    expect(session.coins).toBe(1);
    sim.input.press('west'); // back over the start and onto the coin tile again
    sim.input.release('west');
    while (sim.snapshot().moving) sim.update();
    east(1);
    expect(sim.snapshot().coins).toBe(1);
  });

  it('the session total survives into a new level’s sim', () => {
    const session = createSession();
    playing(ONE_KEY, session).east(1);
    const next = playing(ONE_KEY, session);
    expect(next.sim.snapshot().coins).toBe(1);
  });

  it('the coin event carries the new total and the pickup’s world position', () => {
    const { sim, east } = playing(ONE_KEY);
    const coins: SimEvents['coin'][] = [];
    sim.on('coin', (e) => coins.push(e));
    east(1);
    expect(coins).toEqual([{ tile: { col: 2, row: 1 }, world: tileToWorld(2, 1), total: 1 }]);
  });

  it('runs after landed, in order coin → key → chest', () => {
    const { sim, events, east } = playing(ONE_KEY);
    east(8);
    expect(types(events).filter((t) => t !== 'step' && t !== 'landed')).toEqual([
      'coin',
      'key',
      'chestOpened',
    ]);
    expect(sim.snapshot()).toMatchObject({ keys: 1, requiredKeys: 1, coins: 1 });
  });

  it('the chest without the key emits chestLocked, every time', () => {
    const pickups = { coins: [], key: { col: 1, row: 1 }, key2: null }; // key under the start: never landed on
    const { events, east, sim } = playing(pickups);
    east(8);
    sim.input.press('west');
    sim.input.release('west');
    while (sim.snapshot().moving) sim.update();
    east(1);
    expect(events.filter((e) => e.type === 'chestLocked')).toEqual([
      { type: 'chestLocked', tile: { col: 9, row: 1 } },
      { type: 'chestLocked', tile: { col: 9, row: 1 } },
    ]);
    expect(types(events)).not.toContain('chestOpened');
  });
});

describe('dual keys', () => {
  it('needs both keys; key 2 is hidden until key 1 is collected', () => {
    const { sim, events, east } = playing(TWO_KEYS);
    expect(sim.snapshot()).toMatchObject({ requiredKeys: 2, keys: 0 });
    expect(sim.keyVisible(1)).toBe(false);
    east(2); // onto key 1
    expect(types(events).slice(-2)).toEqual(['key', 'keyRevealed']);
    expect(events.at(-1)?.tile).toEqual({ col: 5, row: 1 });
    expect(sim.keyVisible(1)).toBe(true);
    east(2); // key 2
    expect(sim.snapshot().keys).toBe(2);
    east(4);
    expect(types(events).at(-1)).toBe('chestOpened');
  });

  it('key 2 cannot be picked up before key 1', () => {
    const pickups = { coins: [], key: { col: 8, row: 1 }, key2: { col: 3, row: 1 } };
    const { sim, events, east } = playing(pickups);
    east(2);
    expect(sim.snapshot().keys).toBe(0);
    expect(types(events)).not.toContain('key');
  });

  it('losing key 1 respawns it and hides an uncollected key 2 again', () => {
    const { sim, events, east } = playing(TWO_KEYS);
    east(2);
    expect(sim.dropKey()).toBe(true);
    expect(sim.snapshot().keys).toBe(0);
    expect(sim.keyVisible(0)).toBe(true);
    expect(sim.keyVisible(1)).toBe(false);
    expect(events.slice(-2)).toEqual([
      { type: 'keyHidden', tile: { col: 5, row: 1 } },
      { type: 'keyLost', tile: { col: 3, row: 1 } },
    ]);
  });

  it('losing key 2 respawns key 2 and keeps key 1', () => {
    const { sim, events, east } = playing(TWO_KEYS);
    east(4);
    sim.dropKey();
    expect(sim.snapshot().keys).toBe(1);
    expect(sim.keyVisible(1)).toBe(true);
    expect(types(events).at(-1)).toBe('keyLost');
    expect(events.at(-1)?.tile).toEqual({ col: 5, row: 1 });
  });

  it('dropping with no keys does nothing', () => {
    const { sim, events } = playing(TWO_KEYS);
    expect(sim.dropKey()).toBe(false);
    expect(events).toEqual([]);
  });

  it('the keyLost event carries the remaining count', () => {
    const { sim, east } = playing(TWO_KEYS);
    const lost: SimEvents['keyLost'][] = [];
    sim.on('keyLost', (e) => lost.push(e));
    east(4);
    sim.dropKey();
    expect(lost).toEqual([
      { index: 1, tile: { col: 5, row: 1 }, world: tileToWorld(5, 1), keys: 1 },
    ]);
  });
});
