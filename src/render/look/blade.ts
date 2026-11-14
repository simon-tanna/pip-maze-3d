import { section } from './registry';

/** Blades (greybox steel until ticket 13's blade art). */
export const blade = section(
  'blade',
  {
    /** Roughness of the steel head. */
    headRoughness: 0.35,
    /** Roughness of the haft and axle. */
    haftRoughness: 0.45,
    /** Metalness of the head, haft and axle steel. */
    steelMetalness: 1,
    /** Roughness of the stone lintels. */
    stoneRoughness: 0.9,
  },
  {
    headRoughness: [0, 1, 0.01],
    haftRoughness: [0, 1, 0.01],
    steelMetalness: [0, 1, 0.01],
    stoneRoughness: [0, 1, 0.01],
  },
);
