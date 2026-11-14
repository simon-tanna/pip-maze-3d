/**
 * Greybox spinning blades (ticket 08; ticket 13 swaps in the steel `hazards/blade.glb`).
 * Each blade turns north–south across its corridor on an axle at the pivot height, held
 * between two `STONE_DARK` lintels. The head is extruded from the same outline the contact
 * rule tests (`@core/blade`), and the view draws the angle the simulation reports
 * (`update(sim.blades())`): what you see is what kills.
 *
 * Frames: the blade group sits on its tile centre. `yaw` turns local +x to world +z
 * (south), so its x–y plane is the swing plane (`u`, `y`); `pivot` sits on the axle and
 * turns by θ about its local z, as `bladeSegments` does.
 *
 * Materials and geometry are module-scoped and shared across levels (plain
 * `MeshStandardMaterial`s, one program with the other greybox views). No lights.
 */
import { BoxGeometry, CylinderGeometry, ExtrudeGeometry, Group, Mesh, Shape } from 'three';
import { MeshStandardMaterial } from 'three';
import { BLADE_SHAPE, HEAD_RING } from '@core/blade';
import type { GridTile } from '@core/generator';
import { TILE_SIZE, tileToWorld } from '@core/grid';
import { look } from './look';
import { color } from './palette';

const DEG = Math.PI / 180;
const { arm, halfThickness, pivotHeight } = BLADE_SHAPE;

const STEEL = new MeshStandardMaterial({ color: color('STEEL_LIGHT'), metalness: 1 });
const STEEL_DARK = new MeshStandardMaterial({ color: color('STEEL_DARK'), metalness: 1 });
const STONE = new MeshStandardMaterial({ color: color('STONE_DARK'), roughness: 0.9 });

/** The crescent, head-local, extruded ±halfThickness about the swing plane. */
const HEAD = (() => {
  const s = new Shape();
  HEAD_RING.forEach(([x, y], i) => (i === 0 ? s.moveTo(x, y) : s.lineTo(x, y)));
  s.closePath();
  return new ExtrudeGeometry(s, { depth: 2 * halfThickness, bevelEnabled: false }).translate(
    0,
    0,
    -halfThickness,
  );
})();
const HAFT = new BoxGeometry(0.08, arm, 0.08).translate(0, -arm / 2, 0);
const AXLE = new CylinderGeometry(0.06, 0.06, 0.86, 12).rotateX(Math.PI / 2);
/** Spans the corridor (two tiles of wall top) at the pivot height, beside the swing plane. */
const LINTEL = new BoxGeometry(TILE_SIZE * 2.1, 0.3, 0.26);
const LINTEL_OFFSET = 0.3;

export interface BladeLayout {
  tile: GridTile;
}

export interface BladeAngleNow extends BladeLayout {
  /** θ, degrees (`@core/blade`). */
  angle: number;
}

export interface BladesView {
  readonly group: Group;
  /** Build a level's blades, replacing the last level's. */
  build(blades: readonly BladeLayout[]): void;
  /** Turn each blade to its current angle (same order as `build`). */
  update(blades: readonly BladeAngleNow[]): void;
  /** Drop this level's blades. Geometry and materials are shared: nothing is disposed. */
  teardown(): void;
}

function createBlade(tile: GridTile, i: number): { root: Group; pivot: Group } {
  const root = new Group();
  root.name = `blade_${i}`;
  const { x, z } = tileToWorld(tile.col, tile.row);
  root.position.set(x, 0, z);
  const yaw = new Group();
  yaw.rotation.y = -Math.PI / 2;
  root.add(yaw);

  for (const side of [-1, 1]) {
    const lintel = new Mesh(LINTEL, STONE);
    lintel.name = 'lintel';
    lintel.position.set(0, pivotHeight, side * LINTEL_OFFSET);
    lintel.castShadow = lintel.receiveShadow = true;
    yaw.add(lintel);
  }
  const axle = new Mesh(AXLE, STEEL_DARK);
  axle.position.y = pivotHeight;
  yaw.add(axle);

  const pivot = new Group();
  pivot.position.y = pivotHeight;
  const haft = new Mesh(HAFT, STEEL_DARK);
  const head = new Mesh(HEAD, STEEL);
  head.name = 'head';
  head.position.y = -arm;
  haft.castShadow = head.castShadow = true;
  pivot.add(haft, head);
  yaw.add(pivot);
  return { root, pivot };
}

export function createBladesView(): BladesView {
  const group = new Group();
  group.name = 'blades';
  let pivots: Group[] = [];
  return {
    group,
    build(blades) {
      this.teardown();
      const made = blades.map((b, i) => createBlade(b.tile, i));
      pivots = made.map((m) => m.pivot);
      group.add(...made.map((m) => m.root));
    },
    update(blades) {
      STEEL.roughness = look.blade.headRoughness;
      STEEL_DARK.roughness = look.blade.haftRoughness;
      pivots.forEach((p, i) => (p.rotation.z = (blades[i]?.angle ?? 0) * DEG));
    },
    teardown() {
      group.clear();
      pivots = [];
    },
  };
}
