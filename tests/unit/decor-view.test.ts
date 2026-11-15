import { beforeAll, describe, expect, it } from 'vitest';
import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import type { InstancedMesh, Light, Object3D } from 'three';
import { gltfKit } from '@assets/models';
import type { Gltf } from '@assets/models';
import { DECOR_KINDS } from '@core/decor';
import type { DecorPlacement } from '@core/decor';
import { TILE_SIZE, tileToWorld } from '@core/grid';
import { createDecorView, DECOR_MODEL, DECOR_NODE } from '@render/decor';
import { look } from '@render/look';
import { parseModel } from './support/glb';

let kit: Gltf;
beforeAll(async () => {
  kit = gltfKit(await parseModel(DECOR_MODEL), DECOR_MODEL);
});

const PLAN: DecorPlacement[] = [
  { col: 3, row: 2, kind: 'moss', side: 'n', shift: 0.5, turn: 0.5 },
  { col: 5, row: 4, kind: 'pot', side: 'n', shift: 0.5, turn: 0.5 },
  { col: 6, row: 4, kind: 'bones', side: 'w', shift: 0.5, turn: 0.5 },
  { col: 7, row: 4, kind: 'rubble', side: 'e', shift: 1 - 1e-9, turn: 0 },
  { col: 8, row: 4, kind: 'bones', side: 'n', shift: 0, turn: 0.99 },
];

const meshOf = (group: Object3D, kind: string) =>
  group.getObjectByName(`decor_${kind}`) as InstancedMesh;
const instance = (mesh: InstancedMesh, i: number) => {
  const m = new Matrix4();
  mesh.getMatrixAt(i, m);
  const p = new Vector3();
  const q = new Quaternion();
  m.decompose(p, q, new Vector3());
  return { p, yaw: new Euler().setFromQuaternion(q, 'YXZ').y };
};
const D = look.decor;

describe('decor view', () => {
  it('instances each kind from the plan, one InstancedMesh per kind', () => {
    const v = createDecorView(kit);
    v.build(PLAN);
    for (const kind of DECOR_KINDS) {
      const mesh = meshOf(v.group, kind);
      expect(mesh.isInstancedMesh, kind).toBe(true);
      expect(mesh.count, kind).toBe(PLAN.filter((d) => d.kind === kind).length);
      expect(mesh.geometry, kind).toBe(kit.getNode(DECOR_NODE[kind]).geometry);
    }
  });

  it('grows moss on the south face of the wall to the north', () => {
    const v = createDecorView(kit);
    v.build(PLAN);
    const { p, yaw } = instance(meshOf(v.group, 'moss'), 0);
    const tile = tileToWorld(3, 2);
    expect(p.x).toBeCloseTo(tile.x);
    expect(p.z).toBeCloseTo(tile.z - TILE_SIZE / 2); // the wall's south face
    expect(p.y).toBe(0);
    expect(yaw).toBeCloseTo(0); // local +z (the patch's front) faces south
  });

  it('sets props in from the wall they hug, shifted along it and turned by the plan jitter', () => {
    const v = createDecorView(kit);
    v.build(PLAN);
    const back = TILE_SIZE / 2 - D.inset;
    const pot = instance(meshOf(v.group, 'pot'), 0);
    expect(pot.p.z).toBeCloseTo(tileToWorld(5, 4).z - back);
    expect(pot.p.x).toBeCloseTo(tileToWorld(5, 4).x);
    const west = instance(meshOf(v.group, 'bones'), 0);
    expect(west.p.x).toBeCloseTo(tileToWorld(6, 4).x - back);
    expect(west.p.z).toBeCloseTo(tileToWorld(6, 4).z);
    expect(west.yaw).toBeCloseTo(Math.PI / 2); // local +z turned east, away from the wall
    const east = instance(meshOf(v.group, 'rubble'), 0);
    expect(east.p.x).toBeCloseTo(tileToWorld(7, 4).x + back);
    expect(east.p.z).toBeCloseTo(tileToWorld(7, 4).z + D.shift / 2);
    expect(east.yaw).toBeCloseTo(-Math.PI / 2 - (D.turnDeg * Math.PI) / 180);
    const north = instance(meshOf(v.group, 'bones'), 1);
    expect(north.p.x).toBeCloseTo(tileToWorld(8, 4).x - D.shift / 2);
    expect(north.yaw).toBeCloseTo((0.98 * D.turnDeg * Math.PI) / 180);
  });

  it('rebuilds a level by reusing its meshes and materials, with no lights', () => {
    const v = createDecorView(kit);
    v.build(PLAN);
    const before = DECOR_KINDS.map((k) => meshOf(v.group, k));
    const materials = before.map((m) => m.material);
    v.build(PLAN.slice(0, 1));
    v.build([]);
    DECOR_KINDS.forEach((k, i) => {
      expect(meshOf(v.group, k)).toBe(before[i]);
      expect(meshOf(v.group, k).material).toBe(materials[i]);
      expect(meshOf(v.group, k).count).toBe(0);
    });
    const lights: Light[] = [];
    v.group.traverse((o) => {
      if ((o as Light).isLight) lights.push(o as Light);
    });
    expect(lights).toEqual([]);
  });

  it('casts shadows from the floor props, not from the moss on the wall', () => {
    const v = createDecorView(kit);
    expect(meshOf(v.group, 'moss').castShadow).toBe(false);
    for (const kind of ['bones', 'rubble', 'pot']) {
      expect(meshOf(v.group, kind).castShadow, kind).toBe(true);
      expect(meshOf(v.group, kind).receiveShadow, kind).toBe(true);
    }
    expect(meshOf(v.group, 'moss').receiveShadow).toBe(true);
  });
});
