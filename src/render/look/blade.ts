import { section } from './registry';

/**
 * Blades (ticket 13's steel `hazards/blade.glb`). Roughness is baked into each material's
 * ORM map (steel 0.3–0.45, stone 0.85–0.95); these scale it live.
 */
export const blade = section(
  'blade',
  {
    /** Scale on the steel's baked roughness (head, haft, axle). */
    steelRoughness: 1,
    /** The palette environment's strength in the steel (the chamber's is `lights.envIntensity`). */
    steelEnvIntensity: 1,
    /** Scale on the lintel stone's baked roughness. */
    stoneRoughness: 1,
  },
  {
    steelRoughness: [0, 2, 0.01],
    steelEnvIntensity: [0, 3, 0.01],
    stoneRoughness: [0, 1.2, 0.01],
  },
);
