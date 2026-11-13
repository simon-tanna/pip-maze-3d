import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Box3, BufferGeometry, Mesh, Object3D } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { TILE_SIZE } from '@core/grid';
import { CHAMBER_KIT, KIT_NODES, WALL_HEIGHT } from '@render/chamber-kit';

const glb = fileURLToPath(new URL(`../../public/models/${CHAMBER_KIT}.glb`, import.meta.url));
let root: Object3D;

beforeAll(async () => {
  const bytes = readFileSync(glb);
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  root = (await new GLTFLoader().parseAsync(buffer, '')).scene;
});

const geometryOf = (name: string): BufferGeometry => {
  const node = root.getObjectByName(name);
  expect(node, name).toBeDefined();
  expect((node as Mesh).isMesh, `${name} is a mesh`).toBe(true);
  return (node as Mesh).geometry;
};
const boundsOf = (name: string) => {
  const g = geometryOf(name);
  g.computeBoundingBox();
  return g.boundingBox as Box3;
};
const half = TILE_SIZE / 2;
const eps = 1e-4;

describe('placeholder chamber kit', () => {
  it('has exactly the sandstone kit’s node names', () => {
    expect(KIT_NODES).toEqual([
      'cap_0',
      'cap_1',
      'cap_2',
      'face_0',
      'face_1',
      'face_2',
      'face_slot',
      'floor_0',
      'floor_1',
      'floor_2',
      'floor_3',
      'floor_4',
      'contact',
    ]);
    const meshes: string[] = [];
    root.traverse((o) => {
      if ((o as Mesh).isMesh) meshes.push(o.name);
    });
    expect(meshes.sort()).toEqual([...KIT_NODES].sort());
  });

  it('caps a tile at the 2.2 m wall height', () => {
    expect(WALL_HEIGHT).toBe(2.2);
    for (const name of ['cap_0', 'cap_1', 'cap_2']) {
      const b = boundsOf(name);
      expect(b.max.y, name).toBeCloseTo(WALL_HEIGHT, 4);
      expect(b.min.x).toBeCloseTo(-half, 4);
      expect(b.max.x).toBeCloseTo(half, 4);
      expect(b.min.z).toBeCloseTo(-half, 4);
      expect(b.max.z).toBeCloseTo(half, 4);
    }
  });

  it('models faces on the tile’s south edge (+z), inside the tile, floor to cap', () => {
    for (const name of ['face_0', 'face_1', 'face_2', 'face_slot']) {
      const b = boundsOf(name);
      expect(b.min.y, name).toBeCloseTo(0, 4);
      expect(b.max.y).toBeLessThanOrEqual(WALL_HEIGHT + eps);
      expect(b.max.z).toBeCloseTo(half, 4);
      expect(b.min.z).toBeGreaterThan(0);
      expect(b.min.x).toBeGreaterThanOrEqual(-half - eps);
      expect(b.max.x).toBeLessThanOrEqual(half + eps);
    }
  });

  it('lays flagstones flat over the whole tile at floor level', () => {
    for (let v = 0; v < 5; v++) {
      const b = boundsOf(`floor_${v}`);
      expect(b.max.y, `floor_${v}`).toBeCloseTo(0, 2);
      expect(b.max.x - b.min.x).toBeCloseTo(TILE_SIZE, 4);
      expect(b.max.z - b.min.z).toBeCloseTo(TILE_SIZE, 4);
    }
  });

  it('shapes the contact strip as a 1 m reach behind its wall edge, v = 0 at the wall', () => {
    const g = geometryOf('contact');
    const b = boundsOf('contact');
    expect(b.max.z).toBeCloseTo(0, 4);
    expect(b.min.z).toBeCloseTo(-1, 4);
    expect(b.max.x - b.min.x).toBeCloseTo(TILE_SIZE, 4);
    expect(b.min.y).toBeGreaterThan(0);
    expect(b.max.y).toBeLessThan(0.05);
    const pos = g.getAttribute('position');
    const uv = g.getAttribute('uv');
    for (let i = 0; i < pos.count; i++) {
      expect(uv.getY(i)).toBeCloseTo(-pos.getZ(i), 4);
    }
  });
});
