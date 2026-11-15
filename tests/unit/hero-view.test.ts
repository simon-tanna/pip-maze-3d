import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import type { Light } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { instantiateCharacter } from '@assets/models';
import { STEP_MS } from '@core/step';
import type { Dir } from '@core/grid-input';
import { createHeroView, facingYaw, HERO_MODEL } from '@render/hero';
import type { HeroFrame } from '@render/hero';
import { look } from '@render/look';
import { parseModel } from './support/glb';

const T = look.hero.turnMs;
const FADE = look.hero.fadeMs;
/** Angle a minus b, wrapped to (−π, π]. */
const diff = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

let gltf: GLTF;
beforeAll(async () => {
  gltf = await parseModel(HERO_MODEL);
});
const pip = () => createHeroView(instantiateCharacter(gltf));
const at = (timeMs: number, over: Partial<HeroFrame> = {}): HeroFrame => ({
  position: { x: 0, z: 0 },
  facing: 'south' as Dir,
  timeMs,
  moving: false,
  fallen: false,
  ...over,
});
/** Walk-cycle phase, in footfalls (2 per cycle), unwrapped against an expected value. */
const near = (phase: number, expected: number) => {
  const d = ((((phase - expected) % 1) + 1.5) % 1) - 0.5;
  return Math.abs(d);
};

describe('hero view: placement and turns', () => {
  it('sits on the given position, its forward (+z) pointing along facing', () => {
    const hero = pip();
    hero.update(at(0, { position: { x: 3, z: 5 }, facing: 'east' }));
    expect(hero.object.position.x).toBe(3);
    expect(hero.object.position.z).toBe(5);
    expect(diff(hero.object.rotation.y, facingYaw('east'))).toBeCloseTo(0, 9);
  });

  it('turns to a new facing over 60 ms of render time', () => {
    const hero = pip();
    hero.update(at(0));
    hero.update(at(100, { facing: 'east' }));
    expect(diff(hero.object.rotation.y, facingYaw('south'))).toBeCloseTo(0, 9);
    hero.update(at(100 + T / 2, { facing: 'east' }));
    expect(diff(hero.object.rotation.y, facingYaw('south'))).toBeCloseTo(Math.PI / 4, 9);
    hero.update(at(100 + T, { facing: 'east' }));
    expect(diff(hero.object.rotation.y, facingYaw('east'))).toBeCloseTo(0, 9);
  });

  it('takes the shortest arc (north → west turns a quarter, not three)', () => {
    const hero = pip();
    hero.update(at(0, { facing: 'north' }));
    hero.update(at(10, { facing: 'west' }));
    hero.update(at(10 + T / 2, { facing: 'west' }));
    expect(Math.abs(diff(hero.object.rotation.y, facingYaw('north')))).toBeCloseTo(Math.PI / 4, 9);
    expect(Math.abs(diff(hero.object.rotation.y, facingYaw('west')))).toBeCloseTo(Math.PI / 4, 9);
  });
});

describe('hero view: clips on simulation time', () => {
  it('idles when still', () => {
    const hero = pip();
    for (let t = 0; t <= 1000; t += 50) hero.update(at(t));
    expect(hero.anim()).toMatchObject({ clip: 'idle', idleWeight: 1, walkWeight: 0 });
  });

  it('walks one footfall per tile, chained across steps with no blend to idle', () => {
    const hero = pip();
    hero.update(at(0));
    // Three chained steps: `moving` stays true from the first step's start to the last landing.
    for (let t = 10; t <= 10 + 3 * STEP_MS; t += 10) {
      hero.update(at(t, { moving: true }));
      const a = hero.anim();
      expect(a.clip).toBe('walk');
      if (t >= 10 + FADE) expect(a.idleWeight).toBe(0);
      // Half a cycle (one footfall) per STEP_MS, from the walk's start.
      expect(near(a.walkPhase, (t - 10) / (2 * STEP_MS))).toBeLessThan(1e-6);
    }
    expect(hero.anim().walkWeight).toBe(1);
  });

  it('crossfades to idle over ~0.1 s when the walking stops', () => {
    const hero = pip();
    hero.update(at(0));
    for (let t = 10; t <= 250; t += 10) hero.update(at(t, { moving: true }));
    hero.update(at(260));
    hero.update(at(260 + FADE / 2));
    const mid = hero.anim();
    expect(mid.clip).toBe('idle');
    expect(mid.idleWeight).toBeCloseTo(0.5, 2);
    expect(mid.walkWeight).toBeCloseTo(0.5, 2);
    hero.update(at(260 + FADE + 1));
    expect(hero.anim()).toMatchObject({ idleWeight: 1, walkWeight: 0 });
  });

  it('runs on the time it is given: a repeated time does not advance it', () => {
    const hero = pip();
    hero.update(at(0, { moving: true }));
    hero.update(at(60, { moving: true }));
    const phase = hero.anim().walkPhase;
    hero.update(at(60, { moving: true }));
    expect(hero.anim().walkPhase).toBe(phase);
    // Interpolated render time between ticks moves it proportionally.
    hero.update(at(90, { moving: true }));
    expect(near(hero.anim().walkPhase, 90 / (2 * STEP_MS))).toBeLessThan(1e-6);
  });

  it('freezes from the kill until the respawn', () => {
    const hero = pip();
    hero.update(at(0, { moving: true }));
    hero.update(at(60, { moving: true }));
    const before = hero.anim();
    hero.update(at(200, { moving: false, fallen: true }));
    hero.update(at(400, { moving: false, fallen: true }));
    expect(hero.anim()).toEqual(before);
  });

  it('idles at once on the respawn, with no crossfade out of the death pose', () => {
    const hero = pip();
    hero.update(at(0, { moving: true }));
    for (let t = 10; t <= 200; t += 10) hero.update(at(t, { moving: true }));
    hero.update(at(210, { fallen: true }));
    hero.update(at(480, { fallen: true }));
    hero.update(at(481)); // respawned: standing on the start tile, input still locked
    expect(hero.anim()).toMatchObject({ clip: 'idle', idleWeight: 1, walkWeight: 0 });
  });

  it('carries no light: the torch stays a child of the scene', () => {
    const hero = pip();
    hero.update(at(0));
    const lights: Light[] = [];
    hero.object.traverse((o) => {
      if ((o as Light).isLight) lights.push(o as Light);
    });
    expect(lights).toEqual([]);
  });
});
