/**
 * Spinning blades (ticket 08; ticket 13's steel `hazards/blade.glb`). Each blade turns
 * north–south across its corridor on an axle at the pivot height, held between two
 * `STONE_DARK` lintels on the wall tops. The GLB's head is extruded from the same outline
 * the contact rule tests (`@core/blade`, `blade-kit.ts`), and the view draws the angle the
 * simulation reports (`update(sim.blades())`): what you see is what kills.
 *
 * Frames: the blade group sits on its tile centre. `yaw` turns local +x to world +z
 * (south), so its frame is the GLB's blade frame (x the swing plane's `u`, y up, z off the
 * plane), where the lintels and axle are modelled. `pivot` sits on the axle and turns by θ
 * about its local z, as `bladeSegments` does; the haft is pivot-local, and the head sits
 * at the arm's end, head-local.
 *
 * Geometry and materials are the GLB's, shared across levels and never disposed. The
 * baked roughness and the steel's reflections follow `look.blade` on every `update`.
 * No lights.
 */
import { Group, Mesh } from 'three';
import type { MeshStandardMaterial, Texture } from 'three';
import type { Gltf } from '@assets/models';
import { BLADE_SHAPE } from '@core/blade';
import type { GridTile } from '@core/generator';
import { tileToWorld } from '@core/grid';
import type { BladeNode } from './blade-kit';
import { look } from './look';

const DEG = Math.PI / 180;
const { arm, pivotHeight } = BLADE_SHAPE;

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

/**
 * `kit` is `hazards/blade.glb` (`BLADE_MODEL`), loaded once at boot. `environment` is the
 * scene's palette environment: the steel takes it as its own `envMap`, because three
 * ignores a material's `envMapIntensity` under `scene.environment`, and polished steel
 * reads almost black at the chamber's 0.25. Same map, so no new program.
 */
export function createBladesView(kit: Gltf, environment: Texture | null = null): BladesView {
  const part = (name: BladeNode, shadow: boolean) => {
    const { geometry, material } = kit.getNode(name);
    const mesh = new Mesh(geometry, material);
    mesh.name = name;
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    return mesh;
  };
  const steel = kit.getNode('head').material as MeshStandardMaterial;
  const stone = kit.getNode('lintel_0').material as MeshStandardMaterial;
  steel.envMap = environment;
  const syncMaterials = () => {
    steel.roughness = look.blade.steelRoughness;
    steel.envMapIntensity = look.blade.steelEnvIntensity;
    stone.roughness = look.blade.stoneRoughness;
  };
  syncMaterials();

  const createBlade = (tile: GridTile, i: number) => {
    const root = new Group();
    root.name = `blade_${i}`;
    const { x, z } = tileToWorld(tile.col, tile.row);
    root.position.set(x, 0, z);
    const yaw = new Group();
    yaw.rotation.y = -Math.PI / 2;
    root.add(yaw);
    yaw.add(part('lintel_0', true), part('lintel_1', true), part('axle', false));

    const pivot = new Group();
    pivot.position.y = pivotHeight;
    const head = part('head', true);
    head.position.y = -arm;
    pivot.add(part('haft', true), head);
    yaw.add(pivot);
    return { root, pivot };
  };

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
      syncMaterials();
      pivots.forEach((p, i) => (p.rotation.z = (blades[i]?.angle ?? 0) * DEG));
    },
    teardown() {
      group.clear();
      pivots = [];
    },
  };
}
