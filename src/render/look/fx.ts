import { section } from './registry';

/**
 * Particles and the death shake (ticket 15). Counts, lifetimes, speeds and sizes start at
 * v2's `createWorldFx` (48 px tiles: 1 px = 1/24 m). Times are simulation ms.
 */
export const fx = section(
  'fx',
  {
    /** Burst counts per event (v2). */
    dustLand: 3,
    dustRespawn: 6,
    puffDeath: 10,
    sparkleKey: 16,
    sparkleCoin: 8,
    sparkleChest: 28,
    sparkleKeyAppear: 10,
    /** Dust (SAND / STONE_LIGHT): 12–40 px/s rising, 360 ms, 8 px quads scaling 1 → 0.4. */
    dustLifeMs: 360,
    dustSpeedMin: 0.5,
    dustSpeedMax: 1.67,
    dustSize: 0.33,
    dustAlpha: 0.9,
    /** Puff (dust colours): 30–90 px/s every way, 420 ms, scaling 1.6 → 0.3. */
    puffLifeMs: 420,
    puffSpeedMin: 1.25,
    puffSpeedMax: 3.75,
    puffSize: 0.33,
    puffAlpha: 0.9,
    /** Puff height above the floor, m. */
    puffHeight: 0.6,
    /** Sparkle (GOLD_LIGHT, additive): 60–180 px/s, 520 ms, 120 px/s² gravity, 1.2 → 0.2. */
    sparkleLifeMs: 520,
    sparkleSpeedMin: 2.5,
    sparkleSpeedMax: 7.5,
    sparkleGravity: 5,
    sparkleSize: 0.29,
    /** Sparkle colour intensity: ≥ 2 blooms (the post chain's threshold). */
    sparkleIntensity: 2.4,
    /** Chest sparkles burst from this high, m. */
    chestHeight: 0.8,
    /** Death camera shake (v2 `shake(120, 0.003)`; the chest's is 0.004 → 0.12 m). */
    deathShakeAmplitude: 0.09,
    deathShakeMs: 120,
    deathShakeCyclesX: 3,
    deathShakeCyclesY: 2,
  },
  {
    dustLand: [0, 24, 1],
    dustRespawn: [0, 24, 1],
    puffDeath: [0, 32, 1],
    sparkleKey: [0, 48, 1],
    sparkleCoin: [0, 48, 1],
    sparkleChest: [0, 64, 1],
    sparkleKeyAppear: [0, 48, 1],
    dustLifeMs: [50, 2000, 10],
    dustSpeedMin: [0, 5, 0.05],
    dustSpeedMax: [0, 5, 0.05],
    dustSize: [0.05, 1.5, 0.01],
    dustAlpha: [0, 1, 0.01],
    puffLifeMs: [50, 2000, 10],
    puffSpeedMin: [0, 8, 0.05],
    puffSpeedMax: [0, 8, 0.05],
    puffSize: [0.05, 1.5, 0.01],
    puffAlpha: [0, 1, 0.01],
    puffHeight: [0, 2, 0.05],
    sparkleLifeMs: [50, 2000, 10],
    sparkleSpeedMin: [0, 12, 0.1],
    sparkleSpeedMax: [0, 12, 0.1],
    sparkleGravity: [0, 20, 0.1],
    sparkleSize: [0.05, 1.5, 0.01],
    sparkleIntensity: [0, 6, 0.05],
    chestHeight: [0, 2, 0.05],
    deathShakeAmplitude: [0, 0.5, 0.005],
    deathShakeMs: [0, 500, 5],
    deathShakeCyclesX: [0, 8, 0.5],
    deathShakeCyclesY: [0, 8, 0.5],
  },
);
