/**
 * Grid ↔ world mapping. The single source of truth for how v2's 2D tile grid
 * (col → right, row → down, map tile values 0 floor / 1 wall / 2 start / 3 chest)
 * becomes three.js world space (+Y up, right-handed, camera looks down -Z).
 *
 * Pure: no three.js import (src/core rule), so it returns plain {x, z}.
 * Blender exports 1 unit = 1 metre, so TILE_SIZE is also the Blender module size
 * for wall/floor pieces.
 */

/** Edge length of one maze tile in world units (metres). */
export const TILE_SIZE = 2;

export interface WorldXZ {
  x: number;
  z: number;
}

/**
 * World-space position of the CENTRE of tile (col, row).
 *
 * TODO(you): decide the mapping. Choices that matter later:
 *  - row → +z or -z? (+z keeps v2's "row grows downward" when the camera looks toward -z.)
 *  - origin at tile (0,0) or at the maze centre? (Centre makes lighting/camera bounds symmetric
 *    but needs the map size as a parameter.)
 *  - centre vs corner: hero/hazard placement wants the centre; wall meshes from Blender should be
 *    modelled around their own centre to match.
 */
export function tileToWorld(col: number, row: number): WorldXZ {
  void col;
  void row;
  throw new Error('tileToWorld: not implemented yet');
}
