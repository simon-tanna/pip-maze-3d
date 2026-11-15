import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { instantiateCharacter } from '@assets/models';
import { tileToWorld } from '@core/grid';
import { createSession, createSim, DEATH_TIMING } from '@game/sim';
import { createGameState } from '@game/state';
import { createHeroView, heroFrame, HERO_MODEL } from '@render/hero';
import type { HeroFrame } from '@render/hero';
import { look } from '@render/look';
import { parseModel } from './support/glb';

let gltf: GLTF;
beforeAll(async () => {
  gltf = await parseModel(HERO_MODEL);
});
const pip = (reducedMotion = false) =>
  createHeroView(instantiateCharacter(gltf), { reducedMotion: () => reducedMotion });

// Start (1,1); a flame at (2,1) goes live at 1500 ms (phase 1000).
const MAP = [
  [1, 1, 1, 1, 1],
  [1, 2, 0, 0, 1],
  [1, 1, 1, 1, 1],
];
const FLAME = { col: 2, row: 1 };

/** A hero view on a real sim, killed on the flame after stepping east onto it. */
function killed(reducedMotion = false) {
  const machine = createGameState();
  const sim = createSim({
    map: MAP,
    machine,
    pickups: { coins: [], key: { col: 3, row: 1 }, key2: null },
    session: createSession(),
    flames: [{ tile: FLAME, phase: 1000 }],
  });
  machine.go('building');
  machine.go('entering');
  machine.go('playing');
  const hero = pip(reducedMotion);
  const respawns: number[] = [];
  sim.on('respawned', () => respawns.push(sim.timeAt(0)));
  const tick = () => {
    sim.update();
    hero.update(heroFrame(sim, 0));
  };
  sim.input.press('east');
  sim.input.release('east');
  while (!sim.snapshot().dying) tick();
  return { sim, hero, tick, respawns, killedAt: sim.timeAt(0) };
}

/** A frame `t` ms after a kill at 1000 ms (facing east, at the origin). */
const after = (t: number, over: Partial<HeroFrame> = {}): HeroFrame => ({
  position: { x: 0, z: 0 },
  facing: 'east',
  timeMs: 1000 + t,
  moving: false,
  fallen: t < DEATH_TIMING.gone,
  diedAtMs: 1000,
  ...over,
});

describe('hero view: the death sequence follows the simulation timers', () => {
  it('flash, knockback, collapse, gone, then the respawn pop on the sim’s respawn tick', () => {
    const g = killed();
    const spot = tileToWorld(FLAME.col, FLAME.row);
    const seen: { t: number; fx: ReturnType<typeof g.hero.fx>; x: number }[] = [];
    while (g.sim.snapshot().dying) {
      seen.push({ t: g.sim.timeAt(0) - g.killedAt, fx: g.hero.fx(), x: g.hero.object.position.x });
      g.tick();
    }
    const unlockedAt = g.sim.timeAt(0) - g.killedAt;
    expect(unlockedAt).toBeGreaterThanOrEqual(DEATH_TIMING.unlock);
    expect(unlockedAt).toBeLessThan(DEATH_TIMING.unlock + 1000 / 60);

    for (const { t, fx, x } of seen) {
      expect(fx.flash > 0, `flash at ${t}`).toBe(t < look.hero.hitFlashMs);
      if (t < DEATH_TIMING.gone) {
        // Knocked back opposite the facing it died with (east → west), held through the collapse.
        expect(x).toBeLessThanOrEqual(spot.x);
        expect(spot.x - x).toBeLessThanOrEqual(look.hero.knockbackM + 1e-9);
      }
    }
    const at = (t: number) => seen.filter((s) => s.t >= t)[0];
    expect(at(look.hero.knockbackMs)?.x).toBeCloseTo(spot.x - look.hero.knockbackM, 9);
    // The collapse: narrow and tall, then gone before the respawn.
    const mid = at(DEATH_TIMING.gone - look.hero.collapseMs / 2)?.fx;
    expect(mid?.scale.x).toBeLessThan(1);
    expect(mid?.scale.y).toBeGreaterThan(1);
    // The pop starts from popFrom on the tick the sim respawns (the first at or after 270 ms).
    const respawnT = (g.respawns[0] ?? NaN) - g.killedAt;
    const firstPop = at(respawnT);
    expect(firstPop?.t).toBe(respawnT);
    expect(firstPop?.fx.scale.x).toBeLessThan(look.hero.popFrom + 0.2); // a tick (≤ 16.7 ms) in
    expect(firstPop?.fx.scale.x).toBeGreaterThanOrEqual(look.hero.popFrom);
    // No pop before the sim respawns: until then the pose only stretches (the collapse).
    expect(seen.filter((s) => s.t < respawnT).every((s) => s.fx.scale.y >= 1)).toBe(true);
    // …and has settled by the unlock.
    expect(g.hero.fx().scale.x).toBeCloseTo(1, 9);
    expect(g.hero.object.position.x).toBeCloseTo(tileToWorld(1, 1).x, 9);
  });

  it('is a function of simulation time: a view that jumps straight to a moment draws it', () => {
    for (const t of [0, 40, 100, 200, 300, 450, 600, 900]) {
      const walked = pip();
      for (let s = 0; s <= t; s += 1000 / 60) walked.update(after(s));
      walked.update(after(t));
      const jumped = pip();
      jumped.update(after(t));
      expect(jumped.fx(), `t = ${t}`).toEqual(walked.fx());
    }
  });

  it('grace flickers the hero mesh every 80 ms, then shows it steadily', () => {
    const hero = pip();
    const gone = DEATH_TIMING.gone;
    const F = look.hero.flickerMs;
    const vis = (t: number) => {
      hero.update(after(t));
      return hero.fx().visible;
    };
    expect([vis(gone + 1), vis(gone + F + 1), vis(gone + 2 * F + 1)]).toEqual([true, false, true]);
    expect(vis(gone + DEATH_TIMING.graceMs + 1)).toBe(true);
    expect(hero.fx().rim).toBeCloseTo(look.hero.rimStrength, 9);
    // Only meshes toggle: the hero's root (and anything that could hold a light) stays visible.
    hero.update(after(gone + F + 1));
    expect(hero.object.visible).toBe(true);
    const hidden: string[] = [];
    hero.object.traverse((o) => {
      if (!o.visible) hidden.push(o.type);
    });
    expect(hidden.length).toBeGreaterThan(0);
    expect(hidden.every((type) => type === 'Mesh' || type === 'SkinnedMesh')).toBe(true);
  });

  it('under reduced motion grace is a steady boosted rim, not a flicker', () => {
    const hero = pip(true);
    const gone = DEATH_TIMING.gone;
    for (let t = gone; t < gone + DEATH_TIMING.graceMs; t += 20) {
      hero.update(after(t));
      expect(hero.fx().visible).toBe(true);
      expect(hero.fx().rim).toBeCloseTo(look.hero.graceRim, 9);
    }
    expect(look.hero.graceRim).toBeGreaterThan(look.hero.rimStrength);
    hero.update(after(gone + DEATH_TIMING.graceMs + 1));
    expect(hero.fx().rim).toBeCloseTo(look.hero.rimStrength, 9);
  });

  it('the blob shadow shrinks with the collapse, and grows back with the pop', () => {
    const hero = pip();
    const blob = () => {
      const b = hero.object.getObjectByName('blob');
      if (!b) throw new Error('no blob');
      return b.scale;
    };
    const full = 2 * look.hero.blobRadius;
    const { gone } = DEATH_TIMING;
    for (const t of [0, gone - look.hero.collapseMs / 2, gone - 1, gone + look.hero.popMs / 3]) {
      hero.update(after(t));
      const s = hero.fx().scale.x;
      expect(blob().x, `t = ${t}`).toBeCloseTo(full * s, 9);
      expect(blob().y, `t = ${t}`).toBeCloseTo(full * s, 9);
    }
    hero.update(after(gone - 1));
    expect(blob().x).toBeLessThan(full * 0.5); // nearly gone just before `gone`
  });

  it('no death yet: nothing plays', () => {
    const hero = pip();
    hero.update(after(0, { diedAtMs: null, fallen: false }));
    expect(hero.fx()).toEqual({
      flash: 0,
      knockback: 0,
      scale: { x: 1, y: 1 },
      visible: true,
      rim: look.hero.rimStrength,
    });
  });
});
