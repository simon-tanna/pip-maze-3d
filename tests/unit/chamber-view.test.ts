import type { InstancedMesh } from 'three';
import { BoxGeometry, Matrix4, MeshBasicMaterial, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { PLAN_CAPACITY, planChamber } from '@core/chamber-plan';
import type { Placement } from '@core/chamber-plan';
import { generateLevel } from '@core/generator';
import { TILE_SIZE, tileToWorld } from '@core/grid';
import type { Gltf } from '@assets/models';
import { createChamberView, placementMatrix } from '@render/chamber';

const fakeKit = (): Gltf => {
  const geometry = new BoxGeometry();
  const material = new MeshBasicMaterial();
  return { getNode: () => ({ geometry, material }) };
};
const meshesOf = (view: ReturnType<typeof createChamberView>) =>
  view.group.children.filter((o): o is InstancedMesh => (o as InstancedMesh).isInstancedMesh);

const apply = (p: Placement, local: [number, number, number]) =>
  new Vector3(...local).applyMatrix4(placementMatrix(p, new Matrix4()));

describe('placementMatrix', () => {
  it('puts a piece at its tile centre', () => {
    const p: Placement = { piece: 'cap', variant: 0, col: 3, row: 2, rotation: 0 };
    const { x, z } = tileToWorld(3, 2);
    expect(apply(p, [0, 0, 0]).toArray()).toEqual([x, 0, z]);
  });

  it('turns a face’s local south edge towards its open side', () => {
    const p: Placement = { piece: 'face', variant: 0, col: 3, row: 2, rotation: Math.PI / 2 };
    const { x, z } = tileToWorld(3, 2);
    const v = apply(p, [0, 1, TILE_SIZE / 2]);
    expect(v.x).toBeCloseTo(x + TILE_SIZE / 2);
    expect(v.y).toBeCloseTo(1);
    expect(v.z).toBeCloseTo(z);
  });

  it('runs a contact strip from the wall edge into the tile by its depth', () => {
    const p: Placement = {
      piece: 'contact',
      variant: 0,
      col: 3,
      row: 2,
      rotation: Math.PI,
      side: 'n',
      depth: 0.5,
    };
    const { x, z } = tileToWorld(3, 2);
    const edge = apply(p, [0, 0, 0]);
    expect(edge.x).toBeCloseTo(x);
    expect(edge.z).toBeCloseTo(z - TILE_SIZE / 2);
    const far = apply(p, [0, 0, -1]);
    expect(far.z).toBeCloseTo(z - TILE_SIZE / 2 + 0.5);
  });
});

describe('chamber view', () => {
  const level = generateLevel(0, 7);
  const plan = planChamber(level, 7);

  it('instances the plan: one mesh per (piece, variant), allocated at PLAN_CAPACITY', () => {
    const view = createChamberView(fakeKit());
    view.build(plan);
    const meshes = meshesOf(view);
    const total = meshes.reduce((n, m) => n + m.count, 0);
    expect(total).toBe(plan.length);
    for (const m of meshes) {
      const piece = m.userData['piece'] as keyof typeof PLAN_CAPACITY;
      expect(m.instanceMatrix.count, m.name).toBe(PLAN_CAPACITY[piece]);
      if (m.count > 0) expect(m.boundingSphere, m.name).not.toBeNull();
    }
    const floors = meshes.filter((m) => m.userData['piece'] === 'floor');
    expect(floors).toHaveLength(5);
    for (const [v, m] of floors.entries()) {
      expect(m.count).toBe(plan.filter((p) => p.piece === 'floor' && p.variant === v).length);
    }
  });

  it('throws rather than write past a mesh’s PLAN_CAPACITY instances', () => {
    const view = createChamberView(fakeKit());
    const floor = { piece: 'floor', variant: 0, col: 1, row: 1, rotation: 0 } as Placement;
    const over = Array.from({ length: PLAN_CAPACITY.floor + 1 }, () => floor);
    expect(() => view.build(over)).toThrow(/capacity/);
    expect(() => view.build(over.slice(1))).not.toThrow();
  });

  it('keeps padding out of the shadow map, and the map in it', () => {
    const view = createChamberView(fakeKit());
    view.build(plan);
    for (const m of meshesOf(view)) {
      const padding = m.userData['padding'] === true;
      if (padding) expect(m.castShadow, m.name).toBe(false);
      if (!padding && m.userData['piece'] !== 'contact' && m.userData['piece'] !== 'floor') {
        expect(m.castShadow, m.name).toBe(true);
      }
    }
    const padCount = meshesOf(view)
      .filter((m) => m.userData['padding'] === true)
      .reduce((n, m) => n + m.count, 0);
    expect(padCount).toBe(plan.filter((p) => p.padding).length);
  });

  it('reuses the same meshes on rebuild and recomputes their bounds', () => {
    const view = createChamberView(fakeKit());
    view.build(plan);
    const before = meshesOf(view);
    const spheres = before.map((m) => m.boundingSphere?.clone());
    const other = planChamber(generateLevel(1, 99), 99);
    view.build(other);
    const after = meshesOf(view);
    expect(after).toEqual(before);
    expect(after.reduce((n, m) => n + m.count, 0)).toBe(other.length);
    expect(
      after.some((m, i) => m.count > 0 && !(spheres[i] && m.boundingSphere?.equals(spheres[i]))),
    ).toBe(true);
  });
});
