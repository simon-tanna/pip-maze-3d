/**
 * Decor plan (slice ticket 16): v2's `planDecor` (environment.js). Purely visual: nothing
 * in play reads it, and it never mutates the level.
 *
 * Its rng is `tileRng(seed, col + 500, row + 500)`, a per-tile hash stream of its own, so
 * it never draws from the generator's `mulberry32` stream. The first two draws per tile are
 * v2's (the chance roll, then the kind), so the tiles and kinds match v2 seed for seed; the
 * 3D placement jitter comes from two more draws after them.
 */
import { criticalPath, SPAWN_SAFE_RADIUS, tileRng, tilesWithin } from './generator';
import type { Level, TileMap } from './generator';
import { tileKey } from './grid';
import { startTile } from './level';

/** v2's `DECOR_KINDS` (hazard-art.js), in its order: the kind draw indexes into it. */
export const DECOR_KINDS = ['bones', 'rubble', 'moss', 'pot'] as const;
export type DecorKind = (typeof DECOR_KINDS)[number];

/** Every prop the view instances: v2's kinds, then the vines (ticket 18, not a v2 port). */
export const PROP_KINDS = [...DECOR_KINDS, 'vine'] as const;
export type PropKind = (typeof PROP_KINDS)[number];

/** v2's `DECOR_CHANCE`: the share of eligible tiles that get a prop. */
export const DECOR_CHANCE = 0.12;

/** The default share of wall-north floor tiles that get a vine (`look.decor.vineChance`). */
export const VINE_CHANCE = 0.18;

/** The wall a prop hugs. v2 only dresses tiles with a wall north, west or east. */
export type DecorSide = 'n' | 'e' | 'w';

export interface DecorPlacement {
  col: number;
  row: number;
  kind: PropKind;
  side: DecorSide;
  /** Where along the wall the prop sits, in [0, 1) (render maps it to an offset). */
  shift: number;
  /** A jitter in [0, 1): a floor prop's yaw, a vine's length (render maps it). */
  turn: number;
}

/** v2's `isOpen`: inside the map and not a wall. */
function isOpen(map: TileMap, col: number, row: number): boolean {
  const v = map[row]?.[col];
  return v !== undefined && v !== 1;
}

/**
 * Tiles decor must leave clear, as `tileKey` strings: v2's set from Game.js (the critical
 * path, every trap tile and mummy patrol, the keys and the coins) plus the spawn zone.
 */
function avoidTiles(level: Level): Set<string> {
  const { map } = level;
  const start = startTile(map);
  const exit = { col: level.exitCol, row: level.exitRow };
  const avoid = criticalPath(map, start, level.key, level.key2, exit);
  for (const t of level.traps) {
    if (t.type === 'mummy') {
      for (let c = t.patrolCols[0]; c <= t.patrolCols[1]; c++) avoid.add(tileKey(c, t.row));
    } else avoid.add(tileKey(t.col, t.row));
  }
  for (const k of [level.key, level.key2, ...level.coins]) if (k) avoid.add(tileKey(k.col, k.row));
  for (const k of tilesWithin(map, start, SPAWN_SAFE_RADIUS)) avoid.add(k);
  return avoid;
}

/**
 * Sparse, wall-hugging decor for a level: only plain floor (map value 0) with a wall to the
 * north, west or east, never on a tile in `avoidTiles`. Moss only grows under a wall to
 * the north. Same level and seed, same plan.
 */
export function planDecor(level: Level, seed: number, chance = DECOR_CHANCE): DecorPlacement[] {
  const { map } = level;
  const avoid = avoidTiles(level);
  const out: DecorPlacement[] = [];
  for (let row = 0; row < map.length; row++) {
    const cells = map[row] ?? [];
    for (let col = 0; col < cells.length; col++) {
      if (cells[col] !== 0 || avoid.has(tileKey(col, row))) continue;
      const wallN = !isOpen(map, col, row - 1);
      const wallW = !isOpen(map, col - 1, row);
      const wallE = !isOpen(map, col + 1, row);
      if (!wallN && !wallW && !wallE) continue;
      const rng = tileRng(seed, col + 500, row + 500);
      if (rng() >= chance) continue;
      const kinds = wallN ? DECOR_KINDS : DECOR_KINDS.filter((k) => k !== 'moss');
      const kind = kinds[Math.floor(rng() * kinds.length)] ?? 'bones';
      const side: DecorSide = wallN ? 'n' : wallW ? 'w' : 'e';
      out.push({ col, row, kind, side, shift: rng(), turn: rng() });
    }
  }
  return out;
}

/**
 * Vines (ticket 18, not a v2 port) hanging from the cap of a wall to the north, over any
 * plain floor tile, never on a tile in `avoidTiles`. Their rng is
 * `tileRng(seed, col + 1500, row + 1500)`, a per-tile stream of their own, so they never
 * touch v2's draws (or the generator's): a vine may share its tile with moss or any other
 * prop, or have it to itself. Same level, seed and chance, same vines.
 */
export function planVines(level: Level, seed: number, chance = VINE_CHANCE): DecorPlacement[] {
  const { map } = level;
  const avoid = avoidTiles(level);
  const out: DecorPlacement[] = [];
  for (let row = 0; row < map.length; row++) {
    const cells = map[row] ?? [];
    for (let col = 0; col < cells.length; col++) {
      if (cells[col] !== 0 || isOpen(map, col, row - 1) || avoid.has(tileKey(col, row))) continue;
      const rng = tileRng(seed, col + 1500, row + 1500);
      if (rng() >= chance) continue;
      out.push({ col, row, kind: 'vine', side: 'n', shift: rng(), turn: rng() });
    }
  }
  return out;
}
