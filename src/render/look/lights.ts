import { section } from './registry';

/**
 * The fixed light rig (ADR 0001, map ticket 03): 1 shadowed north-west key, 1 hemisphere
 * fill, 1 torch, `poolSlots` flame-pool point lights, and a palette-gradient env map.
 * Only intensities, colours and positions change at runtime; the light count never does.
 * Intensities are physical (three r155+): directional/hemisphere in lux, points in candela.
 */
export const lights = section(
  'lights',
  {
    keyIntensity: 2.2,
    /** Elevation above the horizon, degrees. The azimuth is fixed to north-west. */
    keyElevationDeg: 57.5,
    keyDistance: 60,
    keyShadowBias: -0.0005,
    keyShadowNormalBias: 0.02,
    hemiIntensity: 0.6,
    envIntensity: 0.25,
    torchIntensity: 6,
    torchDistance: 9,
    torchHeight: 1.6,
    /** Metres in front of the hero (south, toward the camera). */
    torchLeadSouth: 0.5,
    /** Fixed slot count; ticket 02's light bench confirms it. Not tunable at runtime. */
    poolSlots: 4,
    poolIntensity: 8,
    /** A firing flame's pool light is poolIntensity × poolPeakScale. */
    poolPeakScale: 2,
    poolDistance: 7,
    poolHeight: 1.2,
    poolFadeMs: 100,
  },
  {
    keyIntensity: [0, 8, 0.05],
    keyElevationDeg: [55, 60, 0.5],
    keyShadowBias: [-0.005, 0.005, 0.0001],
    keyShadowNormalBias: [0, 0.2, 0.005],
    hemiIntensity: [0, 3, 0.01],
    envIntensity: [0, 2, 0.01],
    torchIntensity: [0, 40, 0.1],
    torchDistance: [1, 20, 0.1],
    torchHeight: [0, 4, 0.05],
    torchLeadSouth: [-2, 2, 0.05],
    poolIntensity: [0, 40, 0.1],
    poolPeakScale: [0, 4, 0.05],
    poolDistance: [1, 20, 0.1],
    poolHeight: [0, 4, 0.05],
    poolFadeMs: [0, 500, 5],
  },
);

/** Shadow map resolution for the key light: fixed, because resizing it reallocates. */
export const KEY_SHADOW_MAP_SIZE = 2048;
