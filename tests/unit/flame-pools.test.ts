import { PointLight, Scene } from 'three';
import { describe, expect, it } from 'vitest';
import { createFlamePools, rankPoolFlames } from '@render/flame-pools';
import type { PoolFlame } from '@render/flame-pools';
import { createLightRig } from '@render/lights';
import { look } from '@render/look';

const flame = (x: number, state: PoolFlame['state'], heat = 1): PoolFlame => ({
  x,
  z: 0,
  state,
  heat,
});
const HERO = { x: 0, z: 0 };
const peak = () => look.lights.poolIntensity * look.lights.poolPeakScale;
const lights = (n = 4) => Array.from({ length: n }, () => new PointLight());

describe('rankPoolFlames', () => {
  it('firing flames first, then telegraphing, then the rest nearest to the hero', () => {
    const flames = [
      flame(2, 'off'), // 0: nearest, but off
      flame(30, 'on'), // 1: far, firing
      flame(20, 'telegraph'), // 2
      flame(10, 'on'), // 3
      flame(4, 'off'), // 4
      flame(6, 'off'), // 5
    ];
    expect(rankPoolFlames(flames, HERO, 4)).toEqual([3, 1, 2, 0]);
    expect(rankPoolFlames(flames, HERO, 10)).toEqual([3, 1, 2, 0, 4, 5]);
  });
});

describe('flame pools', () => {
  it('a firing flame’s slot fades up to peak over ~poolFadeMs, at the flame', () => {
    const pools = lights();
    const alloc = createFlamePools(pools);
    const flames = [flame(6, 'on')];
    alloc.update(flames, HERO, 0);
    const slot = pools.find((p) => p.position.x === 6);
    expect(slot).toBeDefined();
    expect(slot?.position.y).toBe(look.lights.poolHeight);
    alloc.update(flames, HERO, look.lights.poolFadeMs / 2);
    expect(slot?.intensity).toBeGreaterThan(0);
    expect(slot?.intensity).toBeLessThan(peak());
    alloc.update(flames, HERO, look.lights.poolFadeMs);
    expect(slot?.intensity).toBeCloseTo(peak(), 6);
  });

  it('a telegraph ramps its slot to 0.45 of peak, with the grate heat', () => {
    const pools = lights();
    const alloc = createFlamePools(pools);
    for (let i = 0; i < 20; i++) alloc.update([flame(2, 'telegraph', 1)], HERO, 50);
    const slot = pools.find((p) => p.position.x === 2);
    expect(slot?.intensity).toBeCloseTo(peak() * look.flame.poolTelegraph, 6);
    for (let i = 0; i < 20; i++) alloc.update([flame(2, 'telegraph', 0.5)], HERO, 50);
    expect(slot?.intensity).toBeCloseTo(peak() * look.flame.poolTelegraph * 0.5, 6);
  });

  it('only fades: no slot ever jumps more than one fade step per frame', () => {
    const pools = lights(2);
    const alloc = createFlamePools(pools);
    const step = 16;
    const most = (peak() * step) / look.lights.poolFadeMs + 1e-9;
    let before = pools.map((p) => p.intensity);
    const scripts: PoolFlame[][] = [
      [flame(2, 'on'), flame(4, 'on'), flame(6, 'off')],
      [flame(2, 'off'), flame(4, 'on'), flame(6, 'on')], // 6 displaces 2
      [flame(2, 'on'), flame(4, 'off'), flame(6, 'on')],
    ];
    for (const s of scripts) {
      for (let i = 0; i < 30; i++) {
        alloc.update(s, HERO, step);
        const now = pools.map((p) => p.intensity);
        now.forEach((v, k) => expect(Math.abs(v - (before[k] ?? 0))).toBeLessThanOrEqual(most));
        before = now;
      }
    }
  });

  it('a slot handed to another flame fades out where it was before it moves', () => {
    const pools = lights(1);
    const alloc = createFlamePools(pools);
    for (let i = 0; i < 10; i++) alloc.update([flame(2, 'on'), flame(8, 'off')], HERO, 20);
    const [slot] = pools;
    expect(slot?.position.x).toBe(2);
    alloc.update([flame(2, 'off'), flame(8, 'on')], HERO, 20);
    expect(slot?.position.x).toBe(2); // still fading out
    for (let i = 0; i < 10; i++) alloc.update([flame(2, 'off'), flame(8, 'on')], HERO, 20);
    expect(slot?.position.x).toBe(8);
    expect(slot?.intensity).toBeGreaterThan(0);
  });

  it('reset drops every slot to 0; lights are never added, removed or hidden', () => {
    const scene = new Scene();
    const rig = createLightRig(scene);
    const count = scene.children.length;
    const alloc = createFlamePools(rig.pools);
    for (let i = 0; i < 10; i++) alloc.update([flame(2, 'on'), flame(4, 'on')], HERO, 20);
    alloc.reset();
    for (const p of rig.pools) {
      expect(p.intensity).toBe(0);
      expect(p.visible).toBe(true);
    }
    expect(scene.children.length).toBe(count);
  });
});
