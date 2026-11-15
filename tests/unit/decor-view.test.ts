import { beforeAll, describe, expect, it } from 'vitest';
import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import type { InstancedMesh, Light, Object3D } from 'three';
import { gltfKit } from '@assets/models';
import type { Gltf } from '@assets/models';
import { PROP_KINDS } from '@core/decor';
import type { DecorPlacement } from '@core/decor';
import { TILE_SIZE, tileToWorld } from '@core/grid';
import { WALL_HEIGHT } from '@render/chamber-kit';
import {
  createDecorView,
  DECOR_MODEL,
  DECOR_NODE,
  MOSS_WIDTH,
  VINE_LENGTH,
  VINE_WIDTH,
} from '@render/decor';
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
  { col: 3, row: 2, kind: 'vine', side: 'n', shift: 0.5, turn: 0 },
  { col: 9, row: 2, kind: 'vine', side: 'n', shift: 0, turn: 0.99 },
  { col: 10, row: 2, kind: 'moss', side: 'n', shift: 0, turn: 0.5 },
];

const meshOf = (group: Object3D, kind: string) =>
  group.getObjectByName(`decor_${kind}`) as InstancedMesh;
const instance = (mesh: InstancedMesh, i: number) => {
  const m = new Matrix4();
  mesh.getMatrixAt(i, m);
  const p = new Vector3();
  const q = new Quaternion();
  const s = new Vector3();
  m.decompose(p, q, s);
  return { p, s, yaw: new Euler().setFromQuaternion(q, 'YXZ').y };
};
const D = look.decor;

describe('decor view', () => {
  it('instances each kind from the plan, one InstancedMesh per kind', () => {
    const v = createDecorView(kit);
    v.build(PLAN);
    for (const kind of PROP_KINDS) {
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
    expect(p.z).toBeCloseTo(tile.z - TILE_SIZE / 2 + D.mossOffset); // on the south face
    expect(p.y).toBe(0);
    expect(yaw).toBeCloseTo(0); // local +z (the patch's front) faces south
  });

  it('keeps a slid moss patch on its own wall, scaled by look.decor.mossScale', () => {
    const v = createDecorView(kit);
    v.build(PLAN);
    const { p, s } = instance(meshOf(v.group, 'moss'), 1);
    expect(s.x).toBeCloseTo(D.mossScale);
    expect(s.y).toBeCloseTo(D.mossScale);
    const half = (MOSS_WIDTH * D.mossScale) / 2;
    expect(p.x - half).toBeGreaterThanOrEqual(tileToWorld(10, 2).x - TILE_SIZE / 2 - 1e-5);
  });

  it('hangs vines from the cap of the wall to the north, as long as look.decor says', () => {
    const v = createDecorView(kit);
    v.build(PLAN);
    const mesh = meshOf(v.group, 'vine');
    expect(mesh.count).toBe(2);
    const full = instance(mesh, 0);
    const tile = tileToWorld(3, 2);
    expect(full.p.x).toBeCloseTo(tile.x);
    expect(full.p.z).toBeCloseTo(tile.z - TILE_SIZE / 2);
    expect(full.p.y).toBeCloseTo(WALL_HEIGHT);
    expect(full.yaw).toBeCloseTo(0);
    expect(full.s.y * VINE_LENGTH).toBeCloseTo(Math.min(D.vineLength, WALL_HEIGHT));
    const short = instance(mesh, 1);
    expect(short.s.y * VINE_LENGTH).toBeCloseTo(D.vineLength * (1 - 0.99 * D.vineJitter));
    // Slid to the end of its wall, it still hangs inside its tile.
    expect(short.p.x - VINE_WIDTH / 2).toBeCloseTo(tileToWorld(9, 2).x - TILE_SIZE / 2);
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
    const before = PROP_KINDS.map((k) => meshOf(v.group, k));
    const materials = before.map((m) => m.material);
    v.build(PLAN.slice(0, 1));
    v.build([]);
    PROP_KINDS.forEach((k, i) => {
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

  it('update re-lays the plan when a look.decor value changes, and only then', () => {
    const saved = { ...look.decor };
    try {
      const v = createDecorView(kit);
      v.build(PLAN);
      const pot = meshOf(v.group, 'pot');
      const before = instance(pot, 0).p.clone();
      const version = pot.instanceMatrix.version;
      v.update();
      expect(pot.instanceMatrix.version).toBe(version); // unchanged look: no upload
      look.decor.inset += 0.2;
      v.update();
      expect(instance(pot, 0).p.z).toBeCloseTo(before.z + 0.2, 6); // a wall to the north
      expect(pot.instanceMatrix.version).toBeGreaterThan(version);
      const after = pot.instanceMatrix.version;
      look.decor.vineChance = 0.9; // a plan input: build-time only
      v.update();
      expect(pot.instanceMatrix.version).toBe(after);
    } finally {
      Object.assign(look.decor, saved);
    }
  });

  it('casts shadows from the floor props, not from the moss and vines on the wall', () => {
    const v = createDecorView(kit);
    for (const kind of ['moss', 'vine']) {
      expect(meshOf(v.group, kind).castShadow, kind).toBe(false);
      expect(meshOf(v.group, kind).receiveShadow, kind).toBe(true);
    }
    for (const kind of ['bones', 'rubble', 'pot']) {
      expect(meshOf(v.group, kind).castShadow, kind).toBe(true);
      expect(meshOf(v.group, kind).receiveShadow, kind).toBe(true);
    }
  });
});
