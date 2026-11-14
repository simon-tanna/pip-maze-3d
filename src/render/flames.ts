/**
 * Greybox flames (ticket 07; ticket 12 swaps in `hazards/flame.glb` and the preset-D
 * shader column): one column per flame tile, coloured by its state on the hazard clock —
 * `EMBER_DARK` off, `FIRE_HOT` telegraphing, emissive `FIRE` while lethal. The view draws
 * what the simulation reports (`update(sim.flames())`), so it needs no event wiring.
 *
 * `truth` adds the dev-only ground-truth overlay (the hazards prototype's `G`): a `BLOOD`
 * slab on every tile that is lethal right now, shown while `showTruth` is set.
 *
 * Materials and geometry are module-scoped and shared across levels; all of them are
 * plain `MeshStandardMaterial`s, so they share one program with the other greybox views
 * and swapping a column's material never compiles anything. No lights.
 */
import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import type { GridTile } from '@core/generator';
import type { FlameState } from '@core/hazards';
import { TILE_SIZE, tileToWorld } from '@core/grid';
import { look } from './look';
import { color } from './palette';

const MATERIALS: Readonly<Record<FlameState, MeshStandardMaterial>> = {
  off: new MeshStandardMaterial({ color: color('EMBER_DARK'), roughness: 0.8 }),
  telegraph: new MeshStandardMaterial({
    color: color('FIRE_HOT'),
    emissive: color('EMBER'),
    roughness: 0.6,
  }),
  on: new MeshStandardMaterial({ color: color('FIRE'), emissive: color('FIRE'), roughness: 0.6 }),
};
const TRUTH = new MeshStandardMaterial({ color: color('BLOOD'), emissive: color('BLOOD') });

/** A unit-height column standing on the floor (scaled to `look.flame.columnHeight`). */
const COLUMN = new CylinderGeometry(0.25, 0.4, 1, 12).translate(0, 0.5, 0);
const TRUTH_SLAB = new BoxGeometry(TILE_SIZE * 0.96, 0.04, TILE_SIZE * 0.96).translate(0, 0.02, 0);

export interface FlameLayout {
  tile: GridTile;
}

export interface FlameStateNow extends FlameLayout {
  state: FlameState;
}

export interface FlamesView {
  readonly group: Group;
  /** The dev overlay is on (no-op without the `truth` option). */
  showTruth: boolean;
  /** Build a level's flames, replacing the last level's. */
  build(flames: readonly FlameLayout[]): void;
  /** Draw each flame's current state (same order as `build`). */
  update(flames: readonly FlameStateNow[]): void;
  /** Drop this level's flames. Geometry and materials are shared: nothing is disposed. */
  teardown(): void;
}

export function createFlamesView({ truth = false }: { truth?: boolean } = {}): FlamesView {
  const group = new Group();
  group.name = 'flames';
  let columns: Mesh[] = [];
  let slabs: Mesh[] = [];

  const place = (mesh: Mesh, tile: GridTile) => {
    const { x, z } = tileToWorld(tile.col, tile.row);
    mesh.position.set(x, 0, z);
    return mesh;
  };

  return {
    group,
    showTruth: false,
    build(flames) {
      this.teardown();
      columns = flames.map((f, i) => {
        const m = place(new Mesh(COLUMN, MATERIALS.off), f.tile);
        m.name = `flame_${i}`;
        m.castShadow = true;
        return m;
      });
      slabs = truth
        ? flames.map((f, i) => {
            const m = place(new Mesh(TRUTH_SLAB, TRUTH), f.tile);
            m.name = `truth_${i}`;
            m.visible = false;
            return m;
          })
        : [];
      group.add(...columns, ...slabs);
    },
    update(flames) {
      MATERIALS.on.emissiveIntensity = look.flame.onEmissive;
      MATERIALS.telegraph.emissiveIntensity = look.flame.telegraphEmissive;
      columns.forEach((m, i) => {
        m.material = MATERIALS[flames[i]?.state ?? 'off'];
        m.scale.y = look.flame.columnHeight;
      });
      slabs.forEach((m, i) => (m.visible = this.showTruth && flames[i]?.state === 'on'));
    },
    teardown() {
      group.clear();
      columns = [];
      slabs = [];
    },
  };
}
