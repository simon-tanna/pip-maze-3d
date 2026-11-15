import type { Box3 } from 'three';
import type { Light, Mesh, MeshStandardMaterial, Object3D } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  CHEST_HEIGHT,
  CHEST_WIDTH,
  COIN_DIAMETER,
  KEY_LENGTH,
  LID_HINGE,
  PICKUP_NODES,
  PICKUPS_MODEL,
} from '@render/pickups';
import { color } from '@render/palette';
import { parseModel } from './support/glb';

let root: Object3D;

beforeAll(async () => {
  root = (await parseModel(PICKUPS_MODEL)).scene;
});

const mesh = (name: string): Mesh => {
  const node = root.getObjectByName(name) as Mesh | undefined;
  expect(node, name).toBeDefined();
  expect(node?.isMesh, `${name} is a mesh`).toBe(true);
  return node as Mesh;
};
const bounds = (name: string) => {
  const g = mesh(name).geometry;
  g.computeBoundingBox();
  return g.boundingBox as Box3;
};
const eps = 0.02;

describe('pickups GLB', () => {
  it('has exactly the four named nodes, one single-material mesh each', () => {
    expect(PICKUP_NODES).toEqual(['key', 'coin', 'chest', 'chest_lid']);
    const meshes: string[] = [];
    root.traverse((o) => {
      if ((o as Mesh).isMesh) {
        meshes.push(o.name);
        expect(Array.isArray((o as Mesh).material), o.name).toBe(false);
      }
    });
    expect(meshes.sort()).toEqual([...PICKUP_NODES].sort());
  });

  it('carries no lights', () => {
    const lights: string[] = [];
    root.traverse((o) => {
      if ((o as Light).isLight) lights.push(o.name);
    });
    expect(lights).toEqual([]);
  });

  it('models the key ~0.6 m and the coin ~0.4 m, centred on their pivots', () => {
    const key = bounds('key');
    expect(key.max.x - key.min.x).toBeCloseTo(KEY_LENGTH, 1);
    expect(KEY_LENGTH).toBeCloseTo(0.6, 5);
    const coin = bounds('coin');
    expect(coin.max.x - coin.min.x).toBeCloseTo(COIN_DIAMETER, 1);
    expect(coin.max.y - coin.min.y).toBeCloseTo(COIN_DIAMETER, 1);
    expect(COIN_DIAMETER).toBeCloseTo(0.4, 5);
    for (const b of [key, coin]) {
      const c = b.getCenter(b.min.clone());
      expect(Math.abs(c.x)).toBeLessThan(eps);
      expect(Math.abs(c.y)).toBeLessThan(0.06);
      expect(Math.abs(c.z)).toBeLessThan(eps);
    }
  });

  it('stands the ~1.2 m chest on the floor, and hinges the lid at its back top edge', () => {
    expect(CHEST_WIDTH).toBeCloseTo(1.2, 5);
    const chest = bounds('chest');
    expect(chest.min.y).toBeCloseTo(0, 2);
    expect(chest.max.y).toBeCloseTo(CHEST_HEIGHT, 1);
    expect(chest.max.x - chest.min.x).toBeCloseTo(CHEST_WIDTH, 1);
    // The lid's local origin is the hinge: it sweeps south (+z) and up from there.
    const lid = bounds('chest_lid');
    expect(lid.min.z).toBeGreaterThan(-eps);
    expect(lid.min.y).toBeGreaterThan(-0.1); // only the hasp hangs over the lock plate
    expect(lid.max.y).toBeGreaterThan(0.15);
    expect(lid.max.z).toBeCloseTo(-2 * LID_HINGE.z, 1);
    expect(lid.max.x - lid.min.x).toBeCloseTo(CHEST_WIDTH, 1);
    expect(LID_HINGE.y).toBeCloseTo(CHEST_HEIGHT, 5);
  });

  it('is gold metal with a GOLD_LIGHT emissive; the chest and lid share their own material', () => {
    const gold = color('GOLD');
    const glow = color('GOLD_LIGHT');
    for (const name of PICKUP_NODES) {
      const m = mesh(name).material as MeshStandardMaterial;
      expect(m.metalness, name).toBeGreaterThan(0.8);
      expect(m.color.r, name).toBeCloseTo(gold.r, 2);
      expect(m.color.g, name).toBeCloseTo(gold.g, 2);
      expect(m.color.b, name).toBeCloseTo(gold.b, 2);
      // glTF stores emissive × strength (≤ 1): the hue is GOLD_LIGHT's.
      const e = m.emissive;
      expect(e.r, name).toBeGreaterThan(0);
      expect(e.g / e.r, name).toBeCloseTo(glow.g / glow.r, 2);
      expect(e.b / e.r, name).toBeCloseTo(glow.b / glow.r, 2);
    }
    expect(mesh('chest').material).toBe(mesh('chest_lid').material);
    expect(mesh('key').material).toBe(mesh('coin').material);
    expect(mesh('key').material).not.toBe(mesh('chest').material);
  });
});
