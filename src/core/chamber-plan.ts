/**
 * Chamber plan: which kit piece goes on which tile (map ticket 05). Pure data, no three.js;
 * `src/render/chamber.ts` turns it into instance matrices.
 */
import { tileRng } from './generator';
import type { Level } from './generator';

export type ChamberPiece = 'cap' | 'face' | 'floor' | 'contact';

export interface Placement {
  piece: ChamberPiece;
  variant: number;
  col: number;
  row: number;
  /** Yaw in radians about +y. Turns the piece's local +z (south) towards `side`. */
  rotation: number;
  /** Face: the open neighbour it looks at. Contact strip: the wall it runs along. */
  side?: Side;
  /** Contact strip: metres it reaches into the floor tile from the wall edge. */
  depth?: number;
  /** Render-only cap outside the map. Never casts a shadow. */
  padding?: true;
}

export type Side = 'n' | 'e' | 's' | 'w';

/** (dcol, drow) to the neighbour on each side. */
export const SIDE_STEP: Readonly<Record<Side, readonly [number, number]>> = {
  n: [0, -1],
  e: [1, 0],
  s: [0, 1],
  w: [-1, 0],
};

/** v2's `wallMask` bits (environment.js): set when that neighbour is open floor. */
export const OPEN: Readonly<Record<Side, number>> = { n: 1, e: 2, s: 4, w: 8 };

const SIDES: readonly Side[] = ['n', 'e', 's', 'w'];
const ROTATION: Readonly<Record<Side, number>> = {
  s: 0,
  e: Math.PI / 2,
  n: Math.PI,
  w: -Math.PI / 2,
};

/**
 * Tiles of render-only caps beyond each map edge, from the camera frustum at cap height
 * (map ticket 05), so the chase camera never shows the void past the map.
 */
export const PADDING = { east: 9, west: 9, north: 5, south: 4 } as const;

/**
 * Contact-strip reach into the floor, in metres: v2's `paintAO` bands (12 px of a 48 px
 * tile on the north and west, 3 px on the east and south) at 2 m per tile.
 */
export const CONTACT_DEPTH = { wide: 0.5, narrow: 0.125 } as const;

export const CAP_VARIANTS = 3;
export const FACE_VARIANTS = 3;
export const FLOOR_VARIANTS = 5;

/** v2's `drawChamber` flagstone pick: variants 0–4 weighted 40/20/15/15/10. */
function flagstoneVariant(v: number): number {
  return v < 0.4 ? 0 : v < 0.6 ? 1 : v < 0.75 ? 2 : v < 0.9 ? 3 : 4;
}

/** v2's `isOpen`: inside the map and not a wall. */
function isOpen(map: Level['map'], col: number, row: number): boolean {
  const v = map[row]?.[col];
  return v !== undefined && v !== 1;
}

/** v2's 4-bit `wallMask` for tile (col, row). */
export function wallMask(map: Level['map'], col: number, row: number): number {
  return SIDES.reduce((m, s) => {
    const [dc, dr] = SIDE_STEP[s];
    return isOpen(map, col + dc, row + dr) ? m | OPEN[s] : m;
  }, 0);
}

/** v2's map size; every slice level is this big. */
export const MAP_COLS = 40;
export const MAP_ROWS = 15;

/**
 * Worst-case instance count per piece on a `cols × rows` map, the size each piece's
 * InstancedMeshes are allocated at (one per variant, since any variant can take them all).
 */
export function planCapacity(cols: number, rows: number): Record<ChamberPiece, number> {
  const tiles = cols * rows;
  const innerEdges = (cols - 1) * rows + cols * (rows - 1);
  const rim = 2 * (cols + rows);
  const padded = (cols + PADDING.west + PADDING.east) * (rows + PADDING.north + PADDING.south);
  return {
    cap: padded, // every map tile a wall, plus the padding ring
    face: innerEdges, // one per wall–floor edge; the rim faces the padding, never open
    floor: tiles,
    contact: innerEdges + rim, // wall–floor edges, plus floor along the map's rim
  };
}

export const PLAN_CAPACITY: Readonly<Record<ChamberPiece, number>> = planCapacity(
  MAP_COLS,
  MAP_ROWS,
);

export function planChamber(level: Level, seed: number): Placement[] {
  const { map } = level;
  const out: Placement[] = [];
  map.forEach((cells, row) =>
    cells.forEach((v, col) => {
      const rng = tileRng(seed, col, row);
      if (v === 1) {
        out.push({
          piece: 'cap',
          variant: Math.floor(rng() * CAP_VARIANTS),
          col,
          row,
          rotation: 0,
        });
        const mask = wallMask(map, col, row);
        for (const side of SIDES) {
          const variant = Math.floor(rng() * FACE_VARIANTS);
          if (mask & OPEN[side]) {
            out.push({ piece: 'face', variant, col, row, rotation: ROTATION[side], side });
          }
        }
      } else {
        out.push({ piece: 'floor', variant: flagstoneVariant(rng()), col, row, rotation: 0 });
        const mask = wallMask(map, col, row);
        for (const side of SIDES) {
          if (mask & OPEN[side]) continue;
          const depth = side === 'n' || side === 'w' ? CONTACT_DEPTH.wide : CONTACT_DEPTH.narrow;
          out.push({
            piece: 'contact',
            variant: 0,
            col,
            row,
            rotation: ROTATION[side],
            side,
            depth,
          });
        }
      }
    }),
  );
  const cols = map[0]?.length ?? 0;
  const rows = map.length;
  for (let row = -PADDING.north; row < rows + PADDING.south; row++) {
    for (let col = -PADDING.west; col < cols + PADDING.east; col++) {
      if (row >= 0 && row < rows && col >= 0 && col < cols) continue;
      const variant = Math.floor(tileRng(seed, col, row)() * CAP_VARIANTS);
      out.push({ piece: 'cap', variant, col, row, rotation: 0, padding: true });
    }
  }
  return out;
}
