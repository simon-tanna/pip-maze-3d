import { Box3 } from 'three';
import type { Mesh, MeshStandardMaterial, Object3D } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { TILE_SIZE } from '@core/grid';
import { FLAME_MODEL, FLAME_NODES } from '@render/flames';
import { color } from '@render/palette';
import { parseModel } from './support/glb';

let root: Object3D;
beforeAll(async () => {
  root = (await parseModel(FLAME_MODEL)).scene;
});

const mesh = (name: string) => {
  const o = root.getObjectByName(name) as Mesh | undefined;
  expect(o?.isMesh, `${name} is a mesh`).toBe(true);
  return o as Mesh;
};

describe('hazards/flame.glb (the grate and nozzle)', () => {
  it('has exactly the contract’s nodes', () => {
    const meshes: string[] = [];
    root.traverse((o) => {
      if ((o as Mesh).isMesh) meshes.push(o.name);
    });
    expect(meshes.sort()).toEqual([...FLAME_NODES].sort());
  });

  it('sits inside its tile, on the floor, low enough to walk over', () => {
    for (const name of FLAME_NODES) {
      const box = new Box3().setFromObject(mesh(name));
      expect(box.min.y, name).toBeGreaterThanOrEqual(-1e-4);
      expect(box.max.y, name).toBeLessThanOrEqual(0.1);
      for (const v of [box.min.x, box.max.x, box.min.z, box.max.z]) {
        expect(Math.abs(v), name).toBeLessThan(TILE_SIZE / 2);
      }
    }
  });

  it('the bed is a flat EMBER_DARK square just above the floor, centred', () => {
    const box = new Box3().setFromObject(mesh('bed'));
    expect(box.max.y - box.min.y).toBeLessThan(1e-4);
    expect(box.min.y).toBeGreaterThan(0);
    expect(box.max.x).toBeCloseTo(0.6, 4);
    expect(box.min.z).toBeCloseTo(-0.6, 4);
    const m = mesh('bed').material as MeshStandardMaterial;
    expect(m.color.getHex()).toBe(color('EMBER_DARK').getHex());
  });

  it('every material is a palette colour, none of them steel, gold or fire (reservations)', () => {
    for (const name of FLAME_NODES) {
      const m = mesh(name).material as MeshStandardMaterial;
      expect(m.color.getHex(), name).toBe(color(m.name as Parameters<typeof color>[0]).getHex());
      expect(m.name, name).not.toMatch(/^(STEEL|GOLD|FIRE|CURSE)/);
    }
  });
});
