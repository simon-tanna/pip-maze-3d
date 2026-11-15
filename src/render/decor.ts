import { Group, InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three';
import { PROP_KINDS } from '@core/decor';
import type { DecorPlacement, DecorSide, PropKind } from '@core/decor';
import { MAP_COLS, MAP_ROWS } from '@core/generator';
import { TILE_SIZE, tileToWorld } from '@core/grid';
import type { Gltf } from '@assets/models';
import { WALL_HEIGHT } from './chamber-kit';
import { look } from './look';

/**
 * The decor view (slice tickets 16 and 18): instances a `planDecor` + `planVines` plan.
 * Purely visual.
 *
 * Contract of `public/models/decor.glb` (`blender/scripts/build_decor.py`, checked by
 * `tests/unit/decor-glb.test.ts`): one single-material mesh per kind, named in
 * `DECOR_NODE`. Bones, rubble and the pot stand on y = 0, within `PROP_RADIUS` of their
 * pivot. Moss grows on a south-facing wall: its origin is the wall foot, the patch rises in
 * the x/y plane just south of z = 0, `MOSS_WIDTH` wide, at most `MOSS_HEIGHT` tall, and
 * reaches at most `MOSS_REACH` south (its floor fringe). A vine hangs from a south-facing
 * wall's cap edge: its origin is the top of the wall's south edge, it hangs down to at most
 * `VINE_LENGTH` below it, at most `VINE_WIDTH` wide, between z = 0 and `VINE_REACH`, and
 * clear of the cap lip (`LIP_REACH`) beside it.
 *
 * One InstancedMesh per kind, allocated for a whole map, so every level reuses the same
 * meshes and the GLB's shared materials: a rebuild changes counts and matrices only.
 */
export const DECOR_MODEL = 'decor';

export const DECOR_NODE: Readonly<Record<PropKind, string>> = {
  bones: 'decor_bones',
  rubble: 'decor_rubble',
  moss: 'decor_moss',
  pot: 'decor_pot',
  vine: 'decor_vine',
};

/** Mirrors build_decor.py. */
export const PROP_RADIUS = 0.5;
export const MOSS_WIDTH = 1.6;
export const MOSS_HEIGHT = 1.3;
export const MOSS_REACH = 0.2;
export const VINE_LENGTH = 1.8;
export const VINE_WIDTH = 1.1;
export const VINE_REACH = 0.16;

/** Kinds that grow on the wall face: never turned, and they cast no shadow. */
const ON_WALL: ReadonlySet<PropKind> = new Set(['moss', 'vine']);

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
  /**
   * Per frame: re-lays the current plan when a `look.decor` placement value has changed
   * since the last layout (panel edits are live). `vineChance` feeds the plan, not the
   * layout, so it shows on the next build.
   */
  update(): void;
}

type DecorLook = typeof look.decor;
/** The `look.decor` values `decorMatrix` reads: all but the plan's `vineChance`. */
const LAYOUT_KEYS = (Object.keys(look.decor) as (keyof DecorLook)[]).filter(
  (k) => k !== 'vineChance',
);

const Y = new Vector3(0, 1, 0);
const q = new Quaternion();
const pos = new Vector3();
const scale = new Vector3();

/** How far a wall prop of `width` may slide either way and stay inside its tile's wall. */
const slide = (width: number) => Math.max(0, (TILE_SIZE - width) / 2);

/** World matrix for one placement (reads `look.decor`; the view re-lays on a change). */
export function decorMatrix(d: DecorPlacement, out: Matrix4): Matrix4 {
  const D = look.decor;
  const wall = WALL[d.side];
  const { x, z } = tileToWorld(d.col, d.row);
  let along = (d.shift - 0.5) * D.shift; // along the wall: x for n, z for e/w
  scale.set(1, 1, 1);
  let y = 0;
  let back = TILE_SIZE / 2 - D.inset;
  if (d.kind === 'moss') {
    scale.setScalar(D.mossScale);
    back = TILE_SIZE / 2 - D.mossOffset;
    const reach = slide(MOSS_WIDTH * D.mossScale);
    along = Math.max(-reach, Math.min(reach, along));
  } else if (d.kind === 'vine') {
    const length = Math.min(D.vineLength * (1 - D.vineJitter * d.turn), WALL_HEIGHT);
    scale.set(1, length / VINE_LENGTH, 1);
    y = WALL_HEIGHT;
    back = TILE_SIZE / 2;
    along = (d.shift - 0.5) * 2 * slide(VINE_WIDTH);
  }
  pos.set(x + wall.dx * back + (wall.dx === 0 ? along : 0), y, z + wall.dz * back);
  if (wall.dz === 0) pos.z += along;
  const turn = ON_WALL.has(d.kind) ? 0 : (d.turn - 0.5) * 2 * ((D.turnDeg * Math.PI) / 180);
  q.setFromAxisAngle(Y, wall.yaw + turn);
  return out.compose(pos, q, scale);
}

export function createDecorView(kit: Gltf): DecorView {
  const group = new Group();
  group.name = 'decor';
  const meshes = new Map<PropKind, InstancedMesh>();
  for (const kind of PROP_KINDS) {
    const { geometry, material } = kit.getNode(DECOR_NODE[kind]);
    const mesh = new InstancedMesh(geometry, material, CAPACITY);
    mesh.name = DECOR_NODE[kind];
    mesh.count = 0;
    mesh.castShadow = !ON_WALL.has(kind);
    mesh.receiveShadow = true;
    meshes.set(kind, mesh);
    group.add(mesh);
  }

  const m = new Matrix4();
  let current: readonly DecorPlacement[] = [];
  /** The look values of the last layout. */
  const laidOut = { ...look.decor };
  const layoutChanged = () => {
    for (const k of LAYOUT_KEYS) if (look.decor[k] !== laidOut[k]) return true;
    return false;
  };
  const build = (plan: readonly DecorPlacement[]) => {
    current = plan;
    Object.assign(laidOut, look.decor);
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
  };
  return {
    group,
    build,
    update() {
      if (layoutChanged()) build(current);
    },
  };
}
