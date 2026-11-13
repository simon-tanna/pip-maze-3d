import { section } from './registry';

/** Post chain: bloom → vignette → OutputPass. Only emissive at intensity ≥ 2 should cross the bloom threshold. */
export const post = section(
  'post',
  {
    bloom: true,
    bloomThreshold: 1.0,
    bloomStrength: 0.45,
    bloomRadius: 0.4,
    vignette: true,
    vignetteOffset: 1.0,
    vignetteDarkness: 0.8,
  },
  {
    bloomThreshold: [0, 4, 0.01],
    bloomStrength: [0, 2, 0.01],
    bloomRadius: [0, 1, 0.01],
    vignetteOffset: [0, 2, 0.01],
    vignetteDarkness: [0, 2, 0.01],
  },
);
