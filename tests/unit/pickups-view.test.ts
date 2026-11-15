import { beforeAll, describe, expect, it } from 'vitest';
import type { Light, Mesh, MeshStandardMaterial, Object3D } from 'three';
import { gltfKit } from '@assets/models';
import type { Gltf } from '@assets/models';
import { tileToWorld } from '@core/grid';
import { look } from '@render/look';
import { createPickupsView, PICKUPS_MODEL } from '@render/pickups';
import type { PickupsState } from '@render/pickups';
import { parseModel } from './support/glb';

const LAYOUT = {
  coins: [
    { col: 2, row: 1 },
    { col: 3, row: 1 },
  ],
  key: { col: 4, row: 1 },
  key2: { col: 6, row: 1 },
  exitCol: 9,
  exitRow: 1,
};
const SEED = 42;
const ALL: PickupsState = { coinVisible: () => true, keyVisible: () => true };

let kit: Gltf;
beforeAll(async () => {
  kit = gltfKit(await parseModel(PICKUPS_MODEL), PICKUPS_MODEL);
});

const named = (root: Object3D, name: string) => {
  const o = root.getObjectByName(name);
  if (!o) throw new Error(`no ${name}`);
  return o;
};
const view = (opts: { reducedMotion?: boolean } = {}) => {
  const v = createPickupsView(kit, { reducedMotion: () => opts.reducedMotion ?? false });
  v.build(LAYOUT, SEED);
  return v;
};
const P = look.pickups;

describe('pickups view', () => {
  it('floats coins and keys over their tiles and stands the chest on the floor', () => {
    const v = view();
    v.update(ALL, 0);
    const coin = named(v.group, 'coin_1');
    expect(coin.position.x).toBe(tileToWorld(3, 1).x);
    expect(coin.position.y).toBeCloseTo(P.floatHeight);
    expect(named(v.group, 'key_0').position.z).toBe(tileToWorld(4, 1).z);
    const chest = named(v.group, 'chest');
    expect(chest.position.x).toBe(tileToWorld(9, 1).x);
    expect(chest.position.y).toBe(0);
  });

  it('draws the GLB’s gold nodes and lays a floor glow under each pickup, with no lights', () => {
    const v = view();
    v.update(ALL, 0);
    expect((named(v.group, 'key_0') as Mesh).geometry).toBe(kit.getNode('key').geometry);
    expect((named(v.group, 'chest_lid') as Mesh).geometry).toBe(kit.getNode('chest_lid').geometry);
    for (const name of ['coin_0', 'key_0', 'chest']) {
      const glow = named(v.group, `${name}_glow`);
      expect(glow.position.y).toBeLessThan(0.05);
      expect(glow.position.x).toBe(named(v.group, name).position.x);
    }
    const lights: Object3D[] = [];
    v.group.traverse((o) => (o as Light).isLight && lights.push(o));
    expect(lights).toHaveLength(0);
  });

  it('shows what the simulation says stands in the level, glow included', () => {
    const v = view();
    v.update({ coinVisible: (i) => i !== 0, keyVisible: (i) => i === 1 }, 0);
    expect(named(v.group, 'coin_0').visible).toBe(false);
    expect(named(v.group, 'coin_0_glow').visible).toBe(false);
    expect(named(v.group, 'coin_1').visible).toBe(true);
    expect(named(v.group, 'key_0').visible).toBe(false);
    expect(named(v.group, 'key_1').visible).toBe(true);
    expect(named(v.group, 'key_1_glow').visible).toBe(true);
  });

  it('a level without key 2 builds one key', () => {
    const v = createPickupsView(kit, { reducedMotion: () => false });
    v.build({ ...LAYOUT, key2: null }, SEED);
    expect(v.group.getObjectByName('key_1')).toBeUndefined();
  });

  it('bobs keys and coins 0.12 m over 900 ms (sine yoyo)', () => {
    const v = view();
    const key = named(v.group, 'key_0');
    const y = (t: number) => (v.update(ALL, t), key.position.y);
    expect(y(0)).toBeCloseTo(P.floatHeight);
    expect(y(450)).toBeCloseTo(P.floatHeight + 0.06);
    expect(y(900)).toBeCloseTo(P.floatHeight + 0.12);
    expect(y(1800)).toBeCloseTo(P.floatHeight);
    expect(v.motion()).toMatchObject({ bobAmplitude: 0.12 });
  });

  it('turns the key once every 3 s', () => {
    const v = view();
    const key = named(v.group, 'key_0');
    const yaw = (t: number) => (v.update(ALL, t), key.rotation.y);
    const a = yaw(1000);
    expect(yaw(1750) - a).toBeCloseTo(Math.PI / 2);
    expect(v.motion().turnRate).toBeCloseTo(1 / 3); // turns per second
  });

  it('turns each coin from a seeded phase: same seed, same phases', () => {
    const yaws = (seed: number) => {
      const v = createPickupsView(kit, { reducedMotion: () => false });
      v.build(LAYOUT, seed);
      v.update(ALL, 0);
      return [0, 1].map((i) => named(v.group, `coin_${i}`).rotation.y);
    };
    const [a, b] = yaws(SEED);
    expect(a).not.toBeCloseTo(b ?? NaN);
    expect(yaws(SEED)).toEqual([a, b]);
    expect(yaws(SEED + 1)).not.toEqual([a, b]);
  });

  it('pulses the chest’s emissive over 900 ms (yoyo)', () => {
    const v = view();
    const mat = (named(v.group, 'chest') as Mesh).material as MeshStandardMaterial;
    v.update(ALL, 0);
    expect(mat.emissiveIntensity).toBeCloseTo(P.chestEmissive);
    v.update(ALL, 900);
    expect(mat.emissiveIntensity).toBeCloseTo(P.chestEmissive + P.chestPulse);
  });

  it('opens the chest: squash, stretch, settle; the lid swings to 110°; a burst and a shake', () => {
    const v = view();
    const chest = named(v.group, 'chest');
    const lid = named(v.group, 'chest_lid');
    const mat = (chest as Mesh).material as MeshStandardMaterial;
    const at = 5000;
    v.update(ALL, at - 10);
    const before = mat.emissiveIntensity;
    v.openChest(at);
    const scale = (t: number) => (v.update(ALL, at + t), [chest.scale.x, chest.scale.y]);
    expect(scale(0)).toEqual([1, 1]);
    expect(mat.emissiveIntensity).toBeGreaterThan(before + 1);
    expect(scale(80)[0]).toBeCloseTo(1.2);
    expect(scale(80)[1]).toBeCloseTo(0.8);
    expect(chest.scale.z).toBeCloseTo(1.2);
    expect(scale(220)[0]).toBeCloseTo(0.9);
    expect(scale(220)[1]).toBeCloseTo(1.2);
    expect(scale(340)).toEqual([1, 1]);
    v.update(ALL, at + 110);
    expect(lid.rotation.x).toBeLessThan(0);
    expect(lid.rotation.x).toBeGreaterThan((-110 * Math.PI) / 180);
    v.update(ALL, at + 220);
    expect(lid.rotation.x).toBeCloseTo((-110 * Math.PI) / 180);
    const s = v.shake(at + 40);
    expect(Math.hypot(s.x, s.y)).toBeGreaterThan(0);
    expect(v.shake(at + 160)).toEqual({ x: 0, y: 0 });
    expect(v.shake(at - 1)).toEqual({ x: 0, y: 0 });
  });

  it('scales the key’s floor glow with look.pickups.keySize, as the coin’s follows coinSize', () => {
    const saved = { keySize: P.keySize, coinSize: P.coinSize };
    try {
      const v = view();
      const glow = (name: string) => named(v.group, `${name}_glow`).scale.x;
      v.update(ALL, 0);
      const [key, coin] = [glow('key_0'), glow('coin_0')];
      P.keySize *= 2;
      P.coinSize *= 2;
      v.update(ALL, 0);
      expect(glow('key_0')).toBeCloseTo(2 * key);
      expect(glow('coin_0')).toBeCloseTo(2 * coin);
    } finally {
      Object.assign(P, saved);
    }
  });

  it('fades a key in from scale 0.4 over 500 ms (Back)', () => {
    const v = view();
    const key = named(v.group, 'key_0');
    v.keyAppeared(0, 1000);
    const s = (t: number) => (v.update(ALL, t), key.scale.x / (P.keySize / 0.6));
    expect(s(1000)).toBeCloseTo(0.4);
    expect(Math.max(...[1250, 1300, 1350, 1400].map(s))).toBeGreaterThan(1);
    expect(s(1500)).toBeCloseTo(1);
    expect(s(3000)).toBeCloseTo(1);
  });

  it('under reduced motion: no bob, no turn, no shake (the chest still opens)', () => {
    const v = view({ reducedMotion: true });
    expect(v.motion()).toEqual({ bobAmplitude: 0, turnRate: 0 });
    const key = named(v.group, 'key_0');
    const coin = named(v.group, 'coin_0');
    const pose = (t: number) => (
      v.update(ALL, t),
      [key.position.y, key.rotation.y, coin.position.y, coin.rotation.y]
    );
    expect(pose(900)).toEqual(pose(0));
    expect(pose(1750)).toEqual(pose(0));
    v.openChest(2000);
    for (const t of [2000, 2040, 2100, 2159]) expect(v.shake(t)).toEqual({ x: 0, y: 0 });
    v.update(ALL, 2220);
    expect(named(v.group, 'chest_lid').rotation.x).toBeCloseTo((-110 * Math.PI) / 180);
  });

  it('the next build shuts the lid and forgets the opening', () => {
    const v = view();
    v.openChest(0);
    v.update(ALL, 300);
    v.build(LAYOUT, SEED);
    v.update(ALL, 400);
    expect(named(v.group, 'chest_lid').rotation.x).toBe(0);
    expect(v.shake(50)).toEqual({ x: 0, y: 0 });
  });

  it('teardown() empties the group without disposing shared geometry', () => {
    const v = view();
    const geometry = (named(v.group, 'coin_0') as Mesh).geometry;
    let disposed = false;
    geometry.addEventListener('dispose', () => (disposed = true));
    v.teardown();
    expect(v.group.children).toHaveLength(0);
    expect(disposed).toBe(false);
  });

  it('rebuilding drops the previous level’s pickups', () => {
    const v = view();
    v.build({ ...LAYOUT, coins: [{ col: 5, row: 1 }] }, SEED);
    expect(v.group.getObjectByName('coin_1')).toBeUndefined();
    expect(named(v.group, 'coin_0').position.x).toBe(tileToWorld(5, 1).x);
  });
});
