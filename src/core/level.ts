import type { GridTile, TileMap } from './generator';

/** The start tile (map value 2). Every generated map has exactly one. */
export function startTile(map: TileMap): GridTile {
  for (const [row, cells] of map.entries()) {
    const col = cells.indexOf(2);
    if (col >= 0) return { col, row };
  }
  throw new Error('map has no start tile');
}
