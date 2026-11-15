/**
 * Eases and their helpers, shared by render (flames, pickups) and ui (HUD tweens, iris).
 * Phaser's curves, as v2 names them (`Cubic.easeInOut`, `Back.easeOut`, …), each on
 * progress in [0, 1].
 */

/** Phaser's `Back` overshoot. */
const BACK = 1.70158;

export const ease = {
  linear: (t: number) => t,
  cubicIn: (t: number) => t ** 3,
  cubicOut: (t: number) => 1 - (1 - t) ** 3,
  cubicInOut: (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2),
  /** Phaser `Back.easeOut`, overshoot 1.70158. */
  backOut: (t: number) => {
    const u = t - 1;
    return u * u * ((BACK + 1) * u + BACK) + 1;
  },
  sineIn: (t: number) => 1 - Math.cos((t * Math.PI) / 2),
  sineInOut: (t: number) => (1 - Math.cos(Math.PI * t)) / 2,
};

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** Sine yoyo on a clock: 0 → 1 over `legMs`, back to 0 over the next `legMs`. */
export const yoyo = (t: number, legMs: number) => ease.sineInOut(t / legMs);
