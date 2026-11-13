import { section } from './registry';

/** Pickups (greybox until ticket 14's gold art). */
export const pickups = section(
  'pickups',
  {
    /** How far keys and coins float above the floor, m (also where the fly-to starts). */
    floatHeight: 0.5,
  },
  {
    floatHeight: [0, 2, 0.05],
  },
);
