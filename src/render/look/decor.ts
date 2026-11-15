import { section } from './registry';

/** Decor (slice ticket 16): where each prop sits on its wall-hugging tile. */
export const decor = section(
  'decor',
  {
    /** Metres from the wall to a floor prop's pivot (props reach `PROP_RADIUS` from it). */
    inset: 0.55,
    /** Metres of slide along the wall the plan's `shift` spans, centred on the tile. */
    shift: 0.6,
    /** Most yaw jitter either way for a floor prop, in degrees. Moss never turns. */
    turnDeg: 25,
  },
  {
    inset: [0.5, 1, 0.01],
    shift: [0, 0.8, 0.01],
    turnDeg: [0, 90, 1],
  },
);
