/**
 * The blade asset's contract (slice ticket 13): one GLB, `hazards/blade.glb`, built by
 * `blender/scripts/build_blade.py` from `src/core/blade-shape.json` (the outline the
 * contact rule tests), with these node names. Each node's mesh is modelled in place in its
 * own frame (node transforms are identity), so a view can use its geometry directly.
 *
 * The blade frame: x along the swing plane (`u`, metres south of the tile centre), y up
 * from the floor, z off the plane. `BladesView` turns it so x points south.
 *
 * - `lintel_0`, `lintel_1`: `STONE_DARK` stone beams on the wall tops (bottom at
 *   `WALL_HEIGHT`), one each side of the swing plane (z < 0 and z > 0), spanning the
 *   corridor onto the slotted wall tiles. Blade frame.
 * - `axle`: steel, along z between the lintels at `BLADE_SHAPE.pivotHeight`. Blade frame.
 * - `haft`: steel, pivot-local (origin on the axle), running down −y to the head.
 * - `head`: the steel crescent, head-local (origin at the arm's end, edge toward −y), the
 *   outline `HEAD_RING` extruded ±`halfThickness` about the plane.
 *
 * Materials: `steel` (head, haft, axle) and `stone` (lintels), each baked to its own base
 * colour and ORM maps.
 */
export const BLADE_MODEL = 'hazards/blade';

export const BLADE_NODES = ['head', 'haft', 'axle', 'lintel_0', 'lintel_1'] as const;

export type BladeNode = (typeof BLADE_NODES)[number];
