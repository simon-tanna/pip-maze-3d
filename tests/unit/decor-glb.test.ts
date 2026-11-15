import { Vector3 } from 'three';
import type { Box3, BufferGeometry, Light, Mesh, MeshStandardMaterial, Object3D } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { PROP_KINDS } from '@core/decor';
import { LIP_BOTTOM, LIP_REACH, WALL_HEIGHT } from '@render/chamber-kit';
import {
  DECOR_MODEL,
  DECOR_NODE,
  MOSS_HEIGHT,
  MOSS_REACH,
  MOSS_WIDTH,
  PROP_RADIUS,
  VINE_LENGTH,
  VINE_REACH,
  VINE_WIDTH,
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

/** Area of the triangles facing south (+z), projected onto the x/y (wall) plane. */
function southArea(g: BufferGeometry): number {
  const p = g.getAttribute('position');
  const index = g.getIndex();
  const n = index ? index.count : p.count;
  const at = (i: number) => new Vector3().fromBufferAttribute(p, index ? index.getX(i) : i);
  let area = 0;
  for (let i = 0; i < n; i += 3) {
    const a = at(i);
    const z = new Vector3()
      .subVectors(at(i + 1), a)
      .cross(new Vector3().subVectors(at(i + 2), a)).z;
    if (z > 0) area += z / 2;
  }
  return area;
}

describe('decor GLB', () => {
  it('has one single-material mesh per prop kind (v2 decor and vines), and nothing else', () => {
    expect(Object.keys(DECOR_NODE).sort()).toEqual([...PROP_KINDS].sort());
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
      expect(b.max.y, kind).toBeLessThan(0.7);
    }
  });

  it('grows the moss on a south-facing wall from its foot: x/y patch just south of z = 0', () => {
    const b = bounds(DECOR_NODE.moss);
    expect(b.min.z).toBeGreaterThanOrEqual(0);
    expect(b.max.z).toBeLessThanOrEqual(MOSS_REACH);
    expect(b.min.y).toBeGreaterThanOrEqual(0);
    expect(b.max.y).toBeLessThanOrEqual(MOSS_HEIGHT);
    expect(b.max.y).toBeGreaterThan(MOSS_HEIGHT * 0.9);
    expect(b.max.x - b.min.x).toBeCloseTo(MOSS_WIDTH, 1);
  });

  it('makes the moss a patch you can see from the chase camera, not a mound at the wall foot', () => {
    // Ticket 18: v1 was a sine-tapered patch ≤ 0.8 m tall, about 0.4 of its own box on
    // the face, which the steep chase camera turned into a few pixels.
    expect(MOSS_HEIGHT).toBeGreaterThanOrEqual(WALL_HEIGHT * 0.55);
    expect(MOSS_WIDTH).toBeGreaterThanOrEqual(1.4);
    expect(southArea(mesh(DECOR_NODE.moss).geometry)).toBeGreaterThan(
      MOSS_WIDTH * MOSS_HEIGHT * 0.55,
    );
  });

  it('hangs the vine from the cap edge: origin at the top, down the face, clear of the lip', () => {
    const g = mesh(DECOR_NODE.vine).geometry;
    const b = bounds(DECOR_NODE.vine);
    expect(b.max.y).toBeLessThanOrEqual(0.05);
    expect(b.min.y).toBeGreaterThanOrEqual(-VINE_LENGTH);
    expect(b.min.y).toBeLessThan(-VINE_LENGTH * 0.85);
    expect(b.min.z).toBeGreaterThanOrEqual(0);
    expect(b.max.z).toBeLessThanOrEqual(VINE_REACH);
    expect(Math.max(-b.min.x, b.max.x)).toBeLessThanOrEqual(VINE_WIDTH / 2);
    expect(VINE_LENGTH).toBeLessThan(WALL_HEIGHT);
    // Beside the cap lip (its top WALL_HEIGHT − LIP_BOTTOM), the vine stays in front of it.
    const lipDepth = WALL_HEIGHT - LIP_BOTTOM;
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      if (p.getY(i) > -lipDepth - eps) expect(p.getZ(i)).toBeGreaterThanOrEqual(LIP_REACH);
    }
    expect(southArea(g)).toBeGreaterThan(VINE_WIDTH * VINE_LENGTH * 0.2);
  });

  it('colours each prop from the palette: BONE, STONE_SIDE, STONE, and MOSS_LIGHT on the wall', () => {
    const expected = {
      bones: 'BONE',
      rubble: 'STONE_SIDE',
      pot: 'STONE',
      moss: 'MOSS_LIGHT',
      vine: 'MOSS_LIGHT',
    } as const;
    for (const kind of PROP_KINDS) {
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
