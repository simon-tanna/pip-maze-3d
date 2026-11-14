/**
 * The spinning blade's contact rule (ADR 0002, map ticket 09). A blade turns a full 360°
 * every `HAZARD_TIMING.bladeSpin` ms in the vertical north–south plane through its tile
 * centre, and kills only when its outline touches a body's capsule.
 *
 * Frames:
 * - The swing plane: `u` along it (metres south of the tile centre, +z), `y` up from the
 *   floor. `n` is a body's offset off the plane (metres east, +x).
 * - θ (degrees, in [-180, 180)): 0 is the head straight down; θ increases as the head
 *   swings south at the bottom. Every blade turns the same way.
 *
 * The outline comes from `blade-shape.json`, which the bpy blade builder (ticket 13) also
 * reads, so the rule and the mesh can't drift. `bladeTouches` / `segSeg` / `pointSeg`
 * are vendored from the hazards prototype (tag `proto-hazards-9f022b3`).
 *
 * Pure: no three.js, no DOM.
 */
import shape from './blade-shape.json';
import type { GridTile, Trap } from './generator';
import { flamePhase, HAZARD_TIMING } from './hazards';

export type Pt = readonly [number, number];
export type Segment = readonly [Pt, Pt];
type Quad = readonly [Pt, Pt, Pt];

export interface BladeShape {
  /** Axle height above the floor, m. */
  pivotHeight: number;
  /** Pivot to the head's origin, m. */
  arm: number;
  /** Half the blade's thickness off the swing plane, m. */
  halfThickness: number;
  /** The crescent's outer and inner edges: quadratic (start, control, end), head-local. */
  outer: Quad;
  inner: Quad;
  /** Straight segments each curve is sampled into. */
  samples: { outer: number; inner: number };
}

export const BLADE_SHAPE: BladeShape = shape as unknown as BladeShape;

/** A body's hit volume: an upright capsule standing on the floor (ADR 0002). */
export interface BodyCapsule {
  radius: number;
  height: number;
}

/** The one body capsule every character uses (hero now, mummies later). */
export const BODY_CAPSULE: BodyCapsule = { radius: 0.4, height: 1.5 };

const quad = ([a, c, b]: Quad, n: number): Pt[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    const k = (1 - t) ** 2;
    const m = 2 * (1 - t) * t;
    return [k * a[0] + m * c[0] + t * t * b[0], k * a[1] + m * c[1] + t * t * b[1]] as const;
  });

/** The crescent as a closed ring of points, head-local (origin at the arm's end, edge −y). */
export const HEAD_RING: readonly Pt[] = [
  ...quad(BLADE_SHAPE.outer, BLADE_SHAPE.samples.outer),
  ...quad(BLADE_SHAPE.inner, BLADE_SHAPE.samples.inner),
];

/** Outline segments, pivot-local at θ = 0: the head ring, then the arm. */
const OUTLINE: readonly Segment[] = (() => {
  const ring = HEAD_RING.map(([x, y]) => [x, y - BLADE_SHAPE.arm] as const);
  const segs: Segment[] = ring.map((p, i) => [p, ring[(i + 1) % ring.length] as Pt]);
  segs.push([
    [0, 0],
    [0, -BLADE_SHAPE.arm],
  ]);
  return segs;
})();

/**
 * The blade's contact segments at angle θ, in the swing plane (`u`, `y`). These are the
 * exact segments `bladeTouches` tests; the dev contact-zone overlay draws them.
 */
export function bladeSegments(angleDeg: number): Segment[] {
  const a = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const place = ([x, y]: Pt): Pt => [
    x * cos - y * sin,
    BLADE_SHAPE.pivotHeight + x * sin + y * cos,
  ];
  return OUTLINE.map(([p, q]) => [place(p), place(q)] as const);
}

const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
const dot = (a: Pt, b: Pt) => a[0] * b[0] + a[1] * b[1];
const cross = (a: Pt, b: Pt) => a[0] * b[1] - a[1] * b[0];

function pointSeg(p: Pt, a: Pt, b: Pt): number {
  const ab = sub(b, a);
  const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / (dot(ab, ab) || 1)));
  return Math.hypot(p[0] - a[0] - ab[0] * t, p[1] - a[1] - ab[1] * t);
}

function segSeg(a: Pt, b: Pt, c: Pt, d: Pt): number {
  const ab = sub(b, a);
  const cd = sub(d, c);
  const d1 = cross(ab, sub(c, a));
  const d2 = cross(ab, sub(d, a));
  const d3 = cross(cd, sub(a, c));
  const d4 = cross(cd, sub(b, c));
  if (d1 * d2 < 0 && d3 * d4 < 0) return 0;
  return Math.min(pointSeg(a, c, d), pointSeg(b, c, d), pointSeg(c, a, b), pointSeg(d, a, b));
}

/** Blade angle θ at hazard-clock time `t`, ms: `phase` ms into its turn at t = 0. */
export function bladeAngle(t: number, phase: number): number {
  const spin = HAZARD_TIMING.bladeSpin;
  const u = ((((t + phase) % spin) + spin) % spin) / spin;
  return u < 0.5 ? u * 360 : u * 360 - 360;
}

export interface Blade {
  tile: GridTile;
  /** Start offset into the turn, ms (θ at t = 0 is `bladeAngle(0, phase)`). */
  phase: number;
}

/**
 * A level's blades, in trap order, each with its seeded phase. Blades in a shared-wall
 * chain (same column, two rows apart, repeated) take the chain's northernmost phase, so
 * neighbours are shifted copies 4 m apart and their heads never cross over the wall.
 */
export function levelBlades(traps: readonly Trap[], seed: number): Blade[] {
  const tiles = traps.filter((t) => t.type === 'blade').map((t) => ({ col: t.col, row: t.row }));
  const at = new Set(tiles.map((t) => `${t.col},${t.row}`));
  return tiles.map((tile) => {
    let row = tile.row;
    while (at.has(`${tile.col},${row - 2}`)) row -= 2;
    return { tile, phase: flamePhase(seed, { col: tile.col, row }, HAZARD_TIMING.bladeSpin) };
  });
}

/**
 * Does the blade at θ touch a body standing at (`u` along the plane, `n` off it) from the
 * blade's floor point? The capsule's slice through the blade's slab is a 2D capsule of
 * radius √(R² − d²), where d is how far the slab sits from the body's axis.
 */
export function bladeTouches(
  angleDeg: number,
  u: number,
  n: number,
  capsule: BodyCapsule = BODY_CAPSULE,
): boolean {
  const d = Math.max(0, Math.abs(n) - BLADE_SHAPE.halfThickness);
  if (d >= capsule.radius) return false;
  const r = Math.sqrt(capsule.radius ** 2 - d ** 2);
  const lo: Pt = [u, capsule.radius];
  const hi: Pt = [u, Math.max(capsule.radius, capsule.height - capsule.radius)];
  return bladeSegments(angleDeg).some(([p, q]) => segSeg(p, q, lo, hi) < r);
}
