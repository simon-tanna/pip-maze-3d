import { section } from './registry';

/** Blades (greybox steel until ticket 13's blade art). */
export const blade = section(
  'blade',
  {
    /** Roughness of the steel head. */
    headRoughness: 0.35,
    /** Roughness of the haft and axle. */
    haftRoughness: 0.45,
  },
  {
    headRoughness: [0, 1, 0.01],
    haftRoughness: [0, 1, 0.01],
  },
);
