import { section } from './registry';

/** Chamber build (map ticket 05): the contact strips' darkening where floor meets wall. */
export const chamber = section(
  'chamber',
  {
    /** Peak darkening at the wall edge: 0 none, 1 multiplies the floor fully by INK. */
    contactStrength: 0.55,
    /** Falloff exponent from the wall edge to the strip's far edge. */
    contactFalloff: 2,
  },
  {
    contactStrength: [0, 1, 0.01],
    contactFalloff: [0.25, 6, 0.05],
  },
);
