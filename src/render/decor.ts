import { Group, InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three';
import { DECOR_KINDS } from '@core/decor';
import type { DecorKind, DecorPlacement, DecorSide } from '@core/decor';
import { MAP_COLS, MAP_ROWS } from '@core/generator';
import { TILE_SIZE, tileToWorld } from '@core/grid';
import type { Gltf } from '@assets/models';
import { look } from './look';

/**
 * The decor view (slice ticket 16): instances a `planDecor` plan. Purely visual.
 *
 * Contract of `public/models/decor.glb` (`blender/scripts/build_decor.py`, checked by
 * `tests/unit/decor-glb.test.ts`): one single-material mesh per kind, named in
 * `DECOR_NODE`. Bones, rubble and the pot stand on y = 0, within `PROP_RADIUS` of their
 * pivot. Moss grows on a south-facing wall: its origin is the wall foot, the patch rises in
 * the x/y plane just south of z = 0, `MOSS_WIDTH` wide, at most `MOSS_HEIGHT` tall, and
 * reaches at most `MOSS_REACH` south (its floor fringe).
 *
 * One InstancedMesh per kind, allocated for a whole map, so every level reuses the same
 * meshes and the GLB's shared materials: a rebuild changes counts and matrices only.
 */
export const DECOR_MODEL = 'decor';

export const DECOR_NODE: Readonly<Record<DecorKind, string>> = {
  bones: 'decor_bones',
  rubble: 'decor_rubble',
  moss: 'decor_moss',
  pot: 'decor_pot',
};

/** Mirrors build_decor.py. */
export const PROP_RADIUS = 0.5;
export const MOSS_WIDTH = 1.2;
export const MOSS_HEIGHT = 0.8;
export const MOSS_REACH = 0.2;

const CAPACITY = MAP_COLS * MAP_ROWS;

/** Unit step towards the wall a prop hugs, and the yaw that turns local +z away from it. */
const WALL: Readonly<Record<DecorSide, { dx: number; dz: number; yaw: number }>> = {
  n: { dx: 0, dz: -1, yaw: 0 },
  w: { dx: -1, dz: 0, yaw: Math.PI / 2 },
  e: { dx: 1, dz: 0, yaw: -Math.PI / 2 },
};

export interface DecorView {
  readonly group: Group;
  /** Lay out a plan. Reuses every mesh; recomputes each bounding sphere. */
  build(plan: readonly DecorPlacement[]): void;
}

const Y = new Vector3(0, 1, 0);
const q = new Quaternion();
const pos = new Vector3();
const ONE = new Vector3(1, 1, 1);

/** World matrix for one placement (reads `look.decor`). */
export function decorMatrix(d: DecorPlacement, out: Matrix4): Matrix4 {
  const { inset, shift, turnDeg } = look.decor;
  const wall = WALL[d.side];
  const { x, z } = tileToWorld(d.col, d.row);
  const back = d.kind === 'moss' ? TILE_SIZE / 2 : TILE_SIZE / 2 - inset;
  const along = (d.shift - 0.5) * shift; // along the wall: x for n, z for e/w
  pos.set(x + wall.dx * back + (wall.dx === 0 ? along : 0), 0, z + wall.dz * back);
  if (wall.dz === 0) pos.z += along;
  const turn = d.kind === 'moss' ? 0 : (d.turn - 0.5) * 2 * ((turnDeg * Math.PI) / 180);
  q.setFromAxisAngle(Y, wall.yaw + turn);
  return out.compose(pos, q, ONE);
}

export function createDecorView(kit: Gltf): DecorView {
  const group = new Group();
  group.name = 'decor';
  const meshes = new Map<DecorKind, InstancedMesh>();
  for (const kind of DECOR_KINDS) {
    const { geometry, material } = kit.getNode(DECOR_NODE[kind]);
    const mesh = new InstancedMesh(geometry, material, CAPACITY);
    mesh.name = DECOR_NODE[kind];
    mesh.count = 0;
    mesh.castShadow = kind !== 'moss';
    mesh.receiveShadow = true;
    meshes.set(kind, mesh);
    group.add(mesh);
  }

  const m = new Matrix4();
  return {
    group,
    build(plan) {
      for (const mesh of meshes.values()) mesh.count = 0;
      for (const d of plan) {
        const mesh = meshes.get(d.kind);
        if (!mesh) throw new Error(`no decor mesh for ${d.kind}`);
        if (mesh.count >= CAPACITY) throw new Error(`${mesh.name}: plan exceeds ${CAPACITY}`);
        mesh.setMatrixAt(mesh.count++, decorMatrix(d, m));
      }
      for (const mesh of meshes.values()) {
        mesh.instanceMatrix.needsUpdate = true;
        mesh.computeBoundingSphere();
      }
    },
  };
}
