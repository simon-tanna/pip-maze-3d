import { VINE_CHANCE } from '@core/decor';
import { section } from './registry';

/** Decor (slice tickets 16 and 18): where each prop sits on its wall-hugging tile. */
export const decor = section(
  'decor',
  {
    /** Metres from the wall to a floor prop's pivot (props reach `PROP_RADIUS` from it). */
    inset: 0.55,
    /** Metres of slide along the wall the plan's `shift` spans, centred on the tile. */
    shift: 0.6,
    /** Most yaw jitter either way for a floor prop, in degrees. Moss and vines never turn. */
    turnDeg: 25,
    /** Uniform scale of the moss patch (its slide shrinks so it stays on its wall). */
    mossScale: 1,
    /** Metres south of the wall line the moss's back sits, off the face's worn bricks. */
    mossOffset: 0.015,
    /** Metres a vine hangs below the cap at its longest (capped at the wall's height). */
    vineLength: 1.7,
    /** Share of `vineLength` the plan's jitter can take off a vine. */
    vineJitter: 0.4,
    /**
     * Share of wall-north floor tiles that get a vine. Read when a level is built, so a
     * panel edit shows on the next level.
     */
    vineChance: VINE_CHANCE,
  },
  {
    inset: [0.5, 1, 0.01],
    shift: [0, 0.8, 0.01],
    turnDeg: [0, 90, 1],
    mossScale: [0.5, 1.2, 0.01],
    mossOffset: [0, 0.1, 0.005],
    vineLength: [0.4, 2.2, 0.05],
    vineJitter: [0, 0.8, 0.05],
    vineChance: [0, 1, 0.01],
  },
);
