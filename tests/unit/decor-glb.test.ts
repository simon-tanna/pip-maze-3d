import type { Box3, Light, Mesh, MeshStandardMaterial, Object3D } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { DECOR_KINDS } from '@core/decor';
import {
  DECOR_MODEL,
  DECOR_NODE,
  MOSS_HEIGHT,
  MOSS_REACH,
  MOSS_WIDTH,
  PROP_RADIUS,
} from '@render/decor';
import { color } from '@render/palette';
import { parseModel } from './support/glb';

let root: Object3D;

beforeAll(async () => {
  root = (await parseModel(DECOR_MODEL)).scene;
});

const mesh = (name: string): Mesh => {
  const node = root.getObjectByName(name) as Mesh | undefined;
  expect(node?.isMesh, `${name} is a mesh`).toBe(true);
  return node as Mesh;
};
const bounds = (name: string) => {
  const g = mesh(name).geometry;
  g.computeBoundingBox();
  return g.boundingBox as Box3;
};
const eps = 0.02;

describe('decor GLB', () => {
  it('has one single-material mesh per decor kind, and nothing else', () => {
    expect(Object.keys(DECOR_NODE).sort()).toEqual([...DECOR_KINDS].sort());
    const meshes: string[] = [];
    root.traverse((o) => {
      if ((o as Mesh).isMesh) {
        meshes.push(o.name);
        expect(Array.isArray((o as Mesh).material), o.name).toBe(false);
      }
    });
    expect(meshes.sort()).toEqual(Object.values(DECOR_NODE).sort());
  });

  it('carries no lights', () => {
    const lights: string[] = [];
    root.traverse((o) => {
      if ((o as Light).isLight) lights.push(o.name);
    });
    expect(lights).toEqual([]);
  });

  it('stands bones, rubble and the pot on the floor, within PROP_RADIUS of their pivot', () => {
    for (const kind of ['bones', 'rubble', 'pot'] as const) {
      const b = bounds(DECOR_NODE[kind]);
      expect(b.min.y, kind).toBeCloseTo(0, 1);
      expect(b.min.y, kind).toBeGreaterThanOrEqual(-eps);
      for (const v of [b.min.x, b.max.x, b.min.z, b.max.z]) {
        expect(Math.abs(v), kind).toBeLessThanOrEqual(PROP_RADIUS);
      }
      expect(b.max.y, `${kind} is a small prop`).toBeLessThan(0.7);
    }
  });

  it('grows the moss on a south-facing wall from its foot: x/y patch just south of z = 0', () => {
    const b = bounds(DECOR_NODE.moss);
    expect(b.min.z).toBeGreaterThanOrEqual(0);
    expect(b.max.z).toBeLessThanOrEqual(MOSS_REACH);
    expect(b.min.y).toBeGreaterThanOrEqual(0);
    expect(b.max.y).toBeLessThanOrEqual(MOSS_HEIGHT);
    expect(b.max.y).toBeGreaterThan(MOSS_HEIGHT / 2);
    expect(b.max.x - b.min.x).toBeCloseTo(MOSS_WIDTH, 1);
  });

  it('colours each prop from the palette: BONE, STONE_SIDE, STONE and MOSS', () => {
    const expected = { bones: 'BONE', rubble: 'STONE_SIDE', pot: 'STONE', moss: 'MOSS' } as const;
    for (const kind of DECOR_KINDS) {
      const m = mesh(DECOR_NODE[kind]).material as MeshStandardMaterial;
      const want = color(expected[kind]);
      expect(m.color.r, kind).toBeCloseTo(want.r, 3);
      expect(m.color.g, kind).toBeCloseTo(want.g, 3);
      expect(m.color.b, kind).toBeCloseTo(want.b, 3);
      expect(m.metalness, kind).toBe(0);
      expect(m.map, kind).toBeNull();
    }
  });
});
