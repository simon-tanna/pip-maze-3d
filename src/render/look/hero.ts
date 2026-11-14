import { section } from './registry';

/** The hero view (capsule stand-in until ticket 10's Pip). */
export const hero = section(
  'hero',
  {
    /** Render-only turn to a new facing, shortest arc, ms. */
    turnMs: 60,
    /** Roughness of the capsule body and nose. */
    roughness: 0.8,
  },
  {
    turnMs: [0, 300, 5],
    roughness: [0, 1, 0.01],
  },
);
