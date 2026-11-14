import { section } from './registry';

/** Flames (greybox: a column coloured by state, until ticket 12's preset-D look). */
export const flame = section(
  'flame',
  {
    /** Greybox column height, m. */
    columnHeight: 1.6,
    /** Emissive intensity of a firing column (≥ 2 reaches the bloom). */
    onEmissive: 2,
    /** Emissive intensity of a telegraphing column. */
    telegraphEmissive: 0.6,
    /** Roughness of an unlit (off) column. */
    offRoughness: 0.8,
    /** Roughness of a telegraphing or firing column. */
    litRoughness: 0.6,
  },
  {
    offRoughness: [0, 1, 0.01],
    litRoughness: [0, 1, 0.01],
    columnHeight: [0.2, 4, 0.05],
    onEmissive: [0, 6, 0.1],
    telegraphEmissive: [0, 6, 0.1],
  },
);
