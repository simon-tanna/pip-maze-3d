import { section } from './registry';

/**
 * Gold pickups (ticket 14): sizes, the float, bob and turn, the chest pulse, the
 * chest-open moment and the key fade-in. Times are simulation ms.
 */
export const pickups = section(
  'pickups',
  {
    /** How high keys and coins float (their centre above the floor), m; the fly-to starts here. */
    floatHeight: 0.5,
    /** Keys and coins lean back toward the chase camera by this much, degrees, and spin
     * about their own leaned axis, so they read face-on from above. */
    tiltDeg: 55,
    /** Key length, m (the model is 0.6 m). */
    keySize: 0.6,
    /** Coin diameter, m (the model is 0.4 m). */
    coinSize: 0.4,
    /** Chest width, m (the model is 1.2 m). */
    chestSize: 1.2,
    /** Bob travel, m: up by this much and back (sine yoyo). */
    bobAmplitude: 0.12,
    /** One leg of the bob yoyo, ms. */
    bobMs: 900,
    /** One full key turn, ms (0: no turn). */
    keyTurnMs: 3000,
    /** One full coin turn, ms (each coin starts at a seeded phase). */
    coinTurnMs: 3000,
    /** Key and coin emissive intensity (GOLD_LIGHT). */
    goldEmissive: 0.9,
    /** Chest emissive intensity at the bottom of its pulse. */
    chestEmissive: 0.15,
    /** Pulse travel above `chestEmissive`. */
    chestPulse: 0.35,
    /** One leg of the chest pulse yoyo, ms. */
    chestPulseMs: 900,
    /** Extra chest emissive at the peak of the opening burst. */
    burstEmissive: 2.5,
    /** How long the burst takes to fade, ms. */
    burstMs: 450,
    /** Metalness of every gold surface (coins, keys, chest). */
    goldMetalness: 1,
    /** Roughness of the key and coin gold. */
    goldRoughness: 0.3,
    /** Roughness of the chest gold. */
    chestRoughness: 0.42,
    /** Chest-open squash: (wide, tall) scale keys and each leg's ms, then back to (1, 1). */
    squashWide: 1.2,
    squashLow: 0.8,
    squashMs: 80,
    stretchNarrow: 0.9,
    stretchTall: 1.2,
    stretchMs: 140,
    settleMs: 120,
    /** Lid open angle, degrees, and how long the swing takes, ms (cubic-out). */
    lidOpenDeg: 110,
    lidOpenMs: 220,
    /** Chest-open camera shake: peak offset, m, and duration, ms. */
    shakeAmplitude: 0.12,
    shakeMs: 160,
    /** Key fade-in (reveal and respawn): start scale and duration, ms (Back-out). */
    keyAppearFrom: 0.4,
    keyAppearMs: 500,
    /** Additive GOLD_LIGHT floor glow under each pickup: diameter, m, and opacity. */
    glowSize: 1.3,
    glowOpacity: 0.35,
    chestGlowSize: 2.6,
    chestGlowOpacity: 0.4,
    /** Glow falloff exponent, `(1 − r)^falloff`. */
    glowFalloff: 2,
  },
  {
    floatHeight: [0, 2, 0.05],
    tiltDeg: [0, 90, 1],
    keySize: [0.2, 1.5, 0.01],
    coinSize: [0.1, 1, 0.01],
    chestSize: [0.5, 2, 0.01],
    bobAmplitude: [0, 0.5, 0.01],
    bobMs: [100, 3000, 10],
    keyTurnMs: [0, 10000, 50],
    coinTurnMs: [0, 10000, 50],
    goldEmissive: [0, 5, 0.05],
    chestEmissive: [0, 5, 0.05],
    chestPulse: [0, 5, 0.05],
    chestPulseMs: [100, 3000, 10],
    burstEmissive: [0, 20, 0.1],
    burstMs: [50, 2000, 10],
    goldMetalness: [0, 1, 0.01],
    goldRoughness: [0, 1, 0.01],
    chestRoughness: [0, 1, 0.01],
    squashWide: [0.5, 2, 0.01],
    squashLow: [0.5, 2, 0.01],
    squashMs: [0, 500, 5],
    stretchNarrow: [0.5, 2, 0.01],
    stretchTall: [0.5, 2, 0.01],
    stretchMs: [0, 500, 5],
    settleMs: [0, 500, 5],
    lidOpenDeg: [0, 180, 1],
    lidOpenMs: [20, 1000, 10],
    shakeAmplitude: [0, 1, 0.01],
    shakeMs: [0, 1000, 10],
    keyAppearFrom: [0, 1, 0.01],
    keyAppearMs: [50, 2000, 10],
    glowSize: [0, 4, 0.05],
    glowOpacity: [0, 1, 0.01],
    chestGlowSize: [0, 6, 0.05],
    chestGlowOpacity: [0, 1, 0.01],
    glowFalloff: [0.5, 6, 0.1],
  },
);
