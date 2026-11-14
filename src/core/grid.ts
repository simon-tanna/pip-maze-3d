/**
 * Grid ↔ world mapping. The single source of truth for how v2's 2D tile grid
 * (`map[row][col]`, tile values 0 floor / 1 wall / 2 start / 3 chest) becomes
 * three.js world space (+Y up, right-handed).
 *
 * Convention: origin at the map's top-left corner, columns along +x, rows along
 * +z, positions at tile centres. A third-person camera at -z looking toward +z
 * sees the maze the way v2 draws it (row 0 at the far edge).
 *
 * Pure: no three.js import (src/core rule), so it returns plain {x, z}. Height (y)
 * is the caller's concern; the floor is y = 0. Blender exports 1 unit = 1 metre,
 * so TILE_SIZE is also the Blender module size for wall/floor pieces.
 */

/** Edge length of one maze tile in world units (metres). Mirrored in blender/scripts/lib/kit.py. */
export const TILE_SIZE = 2;

export interface GridPos {
  col: number;
  row: number;
}

export interface WorldXZ {
  x: number;
  z: number;
}

export interface MazeBounds {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
  centre: WorldXZ;
}

/** World-space position of the centre of tile (col, row). Replaces v2's `centre(n) = n * T + T / 2`. */
export function tileToWorld(col: number, row: number): WorldXZ {
  return { x: col * TILE_SIZE + TILE_SIZE / 2, z: row * TILE_SIZE + TILE_SIZE / 2 };
}

/**
 * Tile containing world point (x, z). A shared edge belongs to the higher tile.
 * Not clamped: points outside the map give out-of-range (possibly negative) tiles.
 */
export function worldToTile(x: number, z: number): GridPos {
  return { col: Math.floor(x / TILE_SIZE), row: Math.floor(z / TILE_SIZE) };
}

/** String key for Sets/Maps of tiles. Same format as v2's generator, so its port stays seed-identical. */
export function tileKey(col: number, row: number): string {
  return `${col},${row}`;
}

/** World-space rectangle covered by a cols × rows map (for camera clamps, shadow frustum). */
export function mazeBounds(cols: number, rows: number): MazeBounds {
  const maxX = cols * TILE_SIZE;
  const maxZ = rows * TILE_SIZE;
  return { minX: 0, minZ: 0, maxX, maxZ, centre: { x: maxX / 2, z: maxZ / 2 } };
}
