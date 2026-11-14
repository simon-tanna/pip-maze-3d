import { section } from './registry';

/** Pickups (greybox until ticket 14's gold art). */
export const pickups = section(
  'pickups',
  {
    /** How far keys and coins float above the floor, m (also where the fly-to starts). */
    floatHeight: 0.5,
    /** Metalness of every gold surface (coins, keys, chest). */
    goldMetalness: 0.6,
    /** Roughness of the coins and keys. */
    goldRoughness: 0.4,
    /** Roughness of the chest (darker gold). */
    chestRoughness: 0.5,
  },
  {
    floatHeight: [0, 2, 0.05],
    goldMetalness: [0, 1, 0.01],
    goldRoughness: [0, 1, 0.01],
    chestRoughness: [0, 1, 0.01],
  },
);
