import { section } from './registry';

/**
 * Flames (ticket 12, map ticket 07 preset D): light, not geometry. A shader column, a
 * heating grate bed, telegraph embers, a floor glow decal and the pool-light allocator.
 * Every curve runs on the core flame clock (`FlameNow.intoMs`); the ms here are feel.
 */
export const flame = section(
  'flame',
  {
    /** Column height at full size, m (exaggerated: ≈ 1.5 m on screen at the ≈ 65° pitch). */
    height: 3.6,
    /** HDR gain on the fire ramp, so the column core blooms. */
    gain: 2.4,
    /** fbm scroll speed up the column. */
    scroll: 3.2,
    /** Ignite: the column grows back-out from this size to 1 … */
    igniteFrom: 0.3,
    /** … over this many ms from the go-live tick. */
    igniteMs: 120,
    /** Collapse: on the off tick the column is already this small (under 0.25) … */
    collapseFrom: 0.24,
    /** … and shrinks to this size … */
    collapseTo: 0.2,
    /** … fading out over this many ms. */
    collapseMs: 120,
    /** The grate bed cools this many ms after the flame goes off. */
    coolMs: 250,
    /** Grate bed emissive at full heat in the telegraph. */
    bedTelegraph: 2,
    /** Grate bed emissive while live (flickers). */
    bedLive: 2.6,
    /** Grate bed roughness. */
    bedRoughness: 1,
    /** Embers per second from the grate through the telegraph. */
    embersPerSecond: 36,
    /** Ember size at birth, m. */
    emberSize: 0.13,
    /** Ember HDR gain. */
    emberGain: 3,
    /** Ember rise speed, m/s (each ember draws between min and max). */
    emberRiseMin: 0.9,
    emberRiseMax: 1.8,
    /** Ember life, ms. */
    emberLifeMin: 500,
    emberLifeMax: 900,
    /** Glow decal size, m (square). */
    glowSize: 3.4,
    /** Glow intensity at full heat in the telegraph (EMBER → FIRE_HOT). */
    glowTelegraph: 1.04,
    /** Glow intensity while live (FIRE, with flicker). */
    glowLive: 1.2,
    /** Glow intensity as the grate cools. */
    glowCool: 0.72,
    /** Flicker depth on the live glow, grate and pool (0 = steady). */
    flicker: 0.12,
    /** A telegraphing flame's pool light ramps to this fraction of peak. */
    poolTelegraph: 0.45,
  },
  {
    height: [0.5, 6, 0.05],
    gain: [0, 6, 0.05],
    scroll: [0, 10, 0.1],
    igniteFrom: [0, 1, 0.01],
    igniteMs: [0, 500, 5],
    collapseFrom: [0, 0.25, 0.01],
    collapseTo: [0, 0.25, 0.01],
    collapseMs: [0, 500, 5],
    coolMs: [0, 1000, 10],
    bedTelegraph: [0, 6, 0.05],
    bedLive: [0, 6, 0.05],
    bedRoughness: [0, 1, 0.01],
    embersPerSecond: [0, 120, 1],
    emberSize: [0.02, 0.5, 0.01],
    emberGain: [0, 8, 0.1],
    emberRiseMin: [0, 4, 0.05],
    emberRiseMax: [0, 4, 0.05],
    emberLifeMin: [50, 2000, 10],
    emberLifeMax: [50, 2000, 10],
    glowSize: [0.5, 6, 0.05],
    glowTelegraph: [0, 4, 0.01],
    glowLive: [0, 4, 0.01],
    glowCool: [0, 4, 0.01],
    flicker: [0, 0.5, 0.01],
    poolTelegraph: [0, 1, 0.01],
  },
);
