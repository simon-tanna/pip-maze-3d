/**
 * Greybox pickups (ticket 05; ticket 14 swaps in `pickups.glb` and the gold look): a coin
 * disc and a key bar floating `look.pickups.floatHeight` over their tiles, and a chest box
 * on the chest tile. The view draws what the simulation says stands in the level
 * (`update`), so it needs no event wiring. Materials and geometry are module-scoped and
 * shared across levels; no lights (pickups glow through emissive + bloom, later).
 */
import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import type { GridTile } from '@core/generator';
import { tileToWorld } from '@core/grid';
import { look } from './look';
import { color } from './palette';

const gold = new MeshStandardMaterial({ color: color('GOLD'), metalness: 0.6, roughness: 0.4 });
const goldDark = new MeshStandardMaterial({
  color: color('GOLD_DARK'),
  metalness: 0.6,
  roughness: 0.5,
});
const COIN = new CylinderGeometry(0.2, 0.2, 0.06, 16).rotateX(Math.PI / 2);
const KEY = new BoxGeometry(0.6, 0.14, 0.14);
const CHEST = new BoxGeometry(1.2, 0.6, 0.8).translate(0, 0.3, 0);
/** The lid, hinged on the chest's back (north) edge: its pivot sits at the hinge. */
const LID = new BoxGeometry(1.2, 0.2, 0.8).translate(0, 0.1, 0.4);
/** Placeholder open angle (ticket 14 animates the swing to ~110°). */
const LID_OPEN = (-110 * Math.PI) / 180;

export interface PickupsLayout {
  coins: readonly GridTile[];
  key: GridTile;
  key2: GridTile | null;
  exitCol: number;
  exitRow: number;
}

export interface PickupsState {
  coinVisible(index: number): boolean;
  keyVisible(index: number): boolean;
}

export interface PickupsView {
  readonly group: Group;
  /** Build a level's pickups, replacing the last level's. */
  build(layout: PickupsLayout): void;
  update(state: PickupsState): void;
  /** `chestOpened`: the lid snaps open (placeholder; ticket 14 owns the full moment). */
  openChest(): void;
  /** Drop this level's pickups. Geometry and materials are shared, so nothing is disposed. */
  teardown(): void;
}

export function createPickupsView(): PickupsView {
  const group = new Group();
  group.name = 'pickups';
  let coins: Mesh[] = [];
  let keys: Mesh[] = [];
  let lid: Mesh | null = null;

  const at = (mesh: Mesh, tile: GridTile, y: number) => {
    const { x, z } = tileToWorld(tile.col, tile.row);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    return mesh;
  };

  return {
    group,
    build(layout) {
      this.teardown();
      const lift = look.pickups.floatHeight + 0.2;
      coins = layout.coins.map((tile, i) => {
        const m = at(new Mesh(COIN, gold), tile, lift);
        m.name = `coin_${i}`;
        return m;
      });
      keys = [layout.key, ...(layout.key2 ? [layout.key2] : [])].map((tile, i) => {
        const m = at(new Mesh(KEY, gold), tile, lift);
        m.name = `key_${i}`;
        return m;
      });
      const chest = at(new Mesh(CHEST, goldDark), { col: layout.exitCol, row: layout.exitRow }, 0);
      chest.name = 'chest';
      chest.receiveShadow = true;
      lid = new Mesh(LID, goldDark);
      lid.name = 'chest_lid';
      lid.position.set(0, 0.6, -0.4);
      lid.castShadow = true;
      chest.add(lid);
      group.add(...coins, ...keys, chest);
    },
    openChest() {
      if (lid) lid.rotation.x = LID_OPEN;
    },
    teardown() {
      group.clear();
      coins = [];
      keys = [];
      lid = null;
    },
    update(state) {
      coins.forEach((m, i) => (m.visible = state.coinVisible(i)));
      keys.forEach((m, i) => (m.visible = state.keyVisible(i)));
    },
  };
}
