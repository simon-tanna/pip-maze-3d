/**
 * The chamber kit's contract (map ticket 05, slice ticket 09): one GLB with these node
 * names, modelled in a tile's local frame. Ticket 09 swaps the placeholder for the
 * sandstone kit by changing `CHAMBER_KIT` only.
 *
 * - `cap_*`: the tile's top slab, x/z over the whole tile, top at `WALL_HEIGHT`.
 * - `face_*`, `face_slot`: the wall side that looks south (+z), inside the tile, from the
 *   floor up to the cap. Chamber placements rotate local +z towards the open neighbour.
 * - `floor_*`: a flagstone, flat at y = 0 over the whole tile.
 * - `contact`: a strip whose wall edge is z = 0, reaching 1 m back to z = −1, just above
 *   the floor; uv.y runs 0 at the wall edge to 1 at the far edge. Placements scale z to
 *   the plan's `depth` and rotate local +z towards the wall.
 */
export const CHAMBER_KIT = 'placeholders/chamber';

/** Metres from floor to cap top. Kept in sync with `WALL_HEIGHT` in build_placeholders.py. */
export const WALL_HEIGHT = 2.2;

export const KIT_NODES = [
  'cap_0',
  'cap_1',
  'cap_2',
  'face_0',
  'face_1',
  'face_2',
  'face_slot',
  'floor_0',
  'floor_1',
  'floor_2',
  'floor_3',
  'floor_4',
  'contact',
] as const;

export type KitNode = (typeof KIT_NODES)[number];

/** Kit node for each (piece, variant) a chamber plan can name, in variant order. */
export const CHAMBER_KIT_VARIANTS = {
  cap: ['cap_0', 'cap_1', 'cap_2'],
  face: ['face_0', 'face_1', 'face_2'],
  floor: ['floor_0', 'floor_1', 'floor_2', 'floor_3', 'floor_4'],
  contact: ['contact'],
} as const satisfies Record<string, readonly KitNode[]>;
