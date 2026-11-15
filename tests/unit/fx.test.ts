import { afterEach, describe, expect, it, vi } from 'vitest';
import { tileToWorld } from '@core/grid';
import { createSession, createSim, DEATH_TIMING } from '@game/sim';
import { createGameState } from '@game/state';
import { createFx, FX_CAPACITY } from '@render/fx';
import type { FxParticle } from '@render/fx';
import { look } from '@render/look';

// Start (1,1); coin (2,1), key (3,1), chest (5,1); a flame at (4,1), live from 1500 ms.
const MAP = [
  [1, 1, 1, 1, 1, 1, 1],
  [1, 2, 0, 0, 0, 3, 1],
  [1, 1, 1, 1, 1, 1, 1],
];

function setup({ seed = 7, reducedMotion = false } = {}) {
  const machine = createGameState();
  const sim = createSim({
    map: MAP,
    machine,
    pickups: { coins: [{ col: 2, row: 1 }], key: { col: 3, row: 1 }, key2: null },
    session: createSession(),
    flames: [{ tile: { col: 4, row: 1 }, phase: 1000 }],
  });
  machine.go('building');
  machine.go('entering');
  machine.go('playing');
  const fx = createFx({ reducedMotion: () => reducedMotion });
  fx.build(seed);
  fx.listen(sim);
  const east = () => {
    while (sim.snapshot().hitStop) sim.update();
    sim.input.press('east');
    sim.input.release('east');
    while (sim.snapshot().moving) sim.update();
  };
  const live = (kind?: FxParticle['kind']) => {
    fx.update(sim.timeAt(0));
    return fx.particles().filter((p) => kind === undefined || p.kind === kind);
  };
  return { sim, fx, east, live };
}

afterEach(() => vi.restoreAllMocks());

describe('fx: pooled bursts on simulation events (counts from v2 createWorldFx)', () => {
  it('a landing kicks up 3 dust; a coin 8 sparkles; a key 16', () => {
    const g = setup();
    g.east(); // onto the coin
    expect(g.live('dust')).toHaveLength(look.fx.dustLand);
    expect(g.live('sparkle')).toHaveLength(look.fx.sparkleCoin);
    expect([look.fx.dustLand, look.fx.sparkleCoin, look.fx.sparkleKey]).toEqual([3, 8, 16]);
    g.east(); // onto the key
    expect(g.live('sparkle').length).toBe(look.fx.sparkleCoin + look.fx.sparkleKey);
  });

  it('a death puffs 10 at gone, and the respawn raises 6 dust on the start tile', () => {
    const g = setup();
    g.sim.ignoreHazards = true;
    g.east();
    g.east();
    g.east(); // onto the flame tile, still off
    g.sim.ignoreHazards = false;
    while (!g.sim.snapshot().dying) g.sim.update();
    const killed = g.sim.timeAt(0);
    expect(g.live('puff')).toHaveLength(0); // the collapse first
    while (g.sim.timeAt(0) < killed + DEATH_TIMING.gone) g.sim.update();
    expect(g.live('puff')).toHaveLength(look.fx.puffDeath);
    const start = tileToWorld(1, 1);
    const dust = g.live('dust').filter((p) => Math.hypot(p.x - start.x, p.z - start.z) < 1);
    expect(dust).toHaveLength(look.fx.dustRespawn);
    expect([look.fx.puffDeath, look.fx.dustRespawn]).toEqual([10, 6]);
  });

  it('a key fade-in (reveal or respawn) sparkles 10; the chest 28', () => {
    const g = setup();
    g.fx.keyAppeared(tileToWorld(3, 1), g.sim.timeAt(0));
    expect(g.live('sparkle')).toHaveLength(look.fx.sparkleKeyAppear);
    expect(look.fx.sparkleKeyAppear).toBe(10);
    expect(look.fx.sparkleChest).toBe(28);
  });

  it('each particle lives its kind’s lifetime of sim time, then is gone', () => {
    const g = setup();
    g.east();
    const t = g.sim.timeAt(0);
    g.fx.update(t + look.fx.dustLifeMs - 1);
    expect(g.fx.particles().filter((p) => p.kind === 'dust')).toHaveLength(3);
    g.fx.update(t + look.fx.dustLifeMs + 1);
    expect(g.fx.particles().filter((p) => p.kind === 'dust')).toHaveLength(0);
    expect([look.fx.dustLifeMs, look.fx.sparkleLifeMs, look.fx.puffLifeMs]).toEqual([
      360, 520, 420,
    ]);
  });

  it('never uses Math.random: the same seed and events replay the same particles', () => {
    // three.js draws object UUIDs from Math.random at construction; spy from the first event.
    const random = vi.spyOn(Math, 'random');
    const run = (seed: number) => {
      const g = setup({ seed });
      random.mockClear();
      g.east();
      g.east();
      g.fx.update(g.sim.timeAt(0) + 50);
      return g.fx.particles();
    };
    const a = run(7);
    expect(random).not.toHaveBeenCalled();
    expect(a.length).toBeGreaterThan(0);
    expect(run(7)).toEqual(a);
    expect(run(8)).not.toEqual(a);
  });

  it('is a function of sim time: a frozen clock draws the same frame', () => {
    const g = setup();
    g.east();
    const t = g.sim.timeAt(0) + 100;
    g.fx.update(t);
    const first = g.fx.particles();
    g.fx.update(t);
    expect(g.fx.particles()).toEqual(first);
  });

  it('the pool is fixed: bursts past capacity recycle the oldest', () => {
    const g = setup();
    for (let i = 0; i < 20; i++) g.fx.keyAppeared(tileToWorld(3, 1), g.sim.timeAt(0));
    expect(g.live().length).toBe(FX_CAPACITY.additive);
    expect(g.fx.drawn()).toEqual({ normal: 0, additive: FX_CAPACITY.additive });
  });

  it('teardown clears every live particle', () => {
    const g = setup();
    g.east();
    g.fx.teardown();
    expect(g.live()).toHaveLength(0);
  });
});

describe('fx: the death camera shake', () => {
  const dieAt = (reducedMotion: boolean) => {
    const g = setup({ reducedMotion });
    g.sim.ignoreHazards = true;
    g.east();
    g.east();
    g.east();
    g.sim.ignoreHazards = false;
    while (!g.sim.snapshot().dying) g.sim.update();
    return { g, killed: g.sim.timeAt(0) };
  };

  it('shakes for 120 ms after a death, then stops', () => {
    const { g, killed } = dieAt(false);
    const peak = Math.max(
      ...[10, 30, 50, 70, 90].map((dt) => {
        const s = g.fx.shake(killed + dt);
        return Math.max(Math.abs(s.x), Math.abs(s.y));
      }),
    );
    expect(peak).toBeGreaterThan(0);
    expect(peak).toBeLessThanOrEqual(look.fx.deathShakeAmplitude);
    expect(g.fx.shake(killed + look.fx.deathShakeMs + 1)).toEqual({ x: 0, y: 0 });
    expect(look.fx.deathShakeMs).toBe(120);
  });

  it('none under reduced motion', () => {
    const { g, killed } = dieAt(true);
    for (const dt of [0, 10, 30, 60, 90]) expect(g.fx.shake(killed + dt)).toEqual({ x: 0, y: 0 });
  });
});
