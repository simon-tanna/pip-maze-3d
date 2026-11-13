/**
 * A level's pickups (spec: Simulation → Pickups), as v2's `GameScene.checkWin` runs them.
 *
 * - `land(tile)` checks in v2's order: coin → key → chest. A key pickup ends the check
 *   (v2 returns), so the chest never opens on the landing that collects a key.
 * - Keys are collected in order: key 2 (`key2`, levels with index ≥ 3) is hidden until
 *   key 1 is collected, then revealed. The chest opens only with all required keys;
 *   without them it reports `chestLocked`, every time.
 * - `loseKey()` drops the most recent key: it respawns on its own tile. Losing key 1
 *   also hides an uncollected key 2 again (v2 `resetPip`).
 *
 * Coins bank wherever the caller keeps its session total; this only reports them.
 * Pure: no three.js, no DOM.
 */
import type { GridTile, TileMap } from './generator';

export interface PickupLayout {
  coins: readonly GridTile[];
  key: GridTile;
  key2: GridTile | null;
}

export type PickupHit =
  | { type: 'coin'; tile: GridTile; index: number }
  | { type: 'key'; tile: GridTile; index: number; keys: number }
  | { type: 'keyRevealed'; tile: GridTile; index: number }
  | { type: 'chestLocked'; tile: GridTile }
  | { type: 'chestOpened'; tile: GridTile };

export type KeyLoss =
  | { type: 'keyHidden'; tile: GridTile; index: number }
  | { type: 'keyLost'; tile: GridTile; index: number; keys: number };

export interface Pickups {
  readonly requiredKeys: 1 | 2;
  /** Keys collected this level. */
  readonly keys: number;
  readonly chestOpen: boolean;
  /** Hits for a landing on `tile`, in the order they happened. */
  land(tile: GridTile): PickupHit[];
  /** Drop the most recent key. Empty when no key is held. */
  loseKey(): KeyLoss[];
  /** Whether key `index` stands in the level (not collected, not hidden). */
  keyVisible(index: number): boolean;
  /** Whether coin `index` is still in the level. */
  coinVisible(index: number): boolean;
}

const same = (a: GridTile, b: GridTile) => a.col === b.col && a.row === b.row;

export function createPickups(map: TileMap, layout: PickupLayout): Pickups {
  const keyTiles = [layout.key, ...(layout.key2 ? [layout.key2] : [])];
  const requiredKeys = keyTiles.length as 1 | 2;
  const coinTaken = layout.coins.map(() => false);
  let keys = 0;
  let chestOpen = false;

  return {
    requiredKeys,
    get keys() {
      return keys;
    },
    get chestOpen() {
      return chestOpen;
    },
    land(tile) {
      if (chestOpen) return [];
      const hits: PickupHit[] = [];
      const coin = layout.coins.findIndex((c, i) => !coinTaken[i] && same(c, tile));
      if (coin >= 0) {
        coinTaken[coin] = true;
        hits.push({ type: 'coin', tile: { ...tile }, index: coin });
      }
      // Only the next key in order stands in the level, so only it can be collected.
      const next = keyTiles[keys];
      if (next && same(next, tile)) {
        const index = keys++;
        hits.push({ type: 'key', tile: { ...next }, index, keys });
        const reveal = keyTiles[keys];
        if (reveal) hits.push({ type: 'keyRevealed', tile: { ...reveal }, index: keys });
        return hits;
      }
      if (map[tile.row]?.[tile.col] === 3) {
        if (keys < requiredKeys) hits.push({ type: 'chestLocked', tile: { ...tile } });
        else {
          chestOpen = true;
          hits.push({ type: 'chestOpened', tile: { ...tile } });
        }
      }
      return hits;
    },
    loseKey() {
      if (keys === 0) return [];
      const index = --keys;
      const out: KeyLoss[] = [];
      const hidden = keyTiles[index + 1];
      if (hidden) out.push({ type: 'keyHidden', tile: { ...hidden }, index: index + 1 });
      const tile = keyTiles[index] as GridTile;
      out.push({ type: 'keyLost', tile: { ...tile }, index, keys });
      return out;
    },
    keyVisible: (index) => index === keys && index < requiredKeys,
    coinVisible: (index) => coinTaken[index] === false,
  };
}
