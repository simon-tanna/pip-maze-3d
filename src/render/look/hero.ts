import { section } from './registry';

/** The hero view: Pip (ticket 10). */
export const hero = section(
  'hero',
  {
    /** Render-only turn to a new facing, shortest arc, ms. */
    turnMs: 60,
    /** Crossfade between idle and walk when walking starts or stops, ms of sim time. */
    fadeMs: 100,
    /** Roughness of every Pip material. */
    roughness: 0.8,
    /** CREAM fresnel rim: emissive strength at grazing angles (keep under bloom's 2). */
    rimStrength: 0.35,
    /** Rim falloff exponent: higher hugs the silhouette tighter. */
    rimPower: 3,
    /** INK blob shadow radius under the feet, m. */
    blobRadius: 0.45,
    /** Blob shadow opacity at its centre. */
    blobOpacity: 0.55,
    /** Blob falloff exponent on (1 − r): higher tightens it around the feet. */
    blobFalloff: 1.5,
  },
  {
    turnMs: [0, 300, 5],
    fadeMs: [0, 300, 5],
    roughness: [0, 1, 0.01],
    rimStrength: [0, 1.5, 0.01],
    rimPower: [0.5, 8, 0.1],
    blobRadius: [0.1, 1, 0.01],
    blobOpacity: [0, 1, 0.01],
    blobFalloff: [0.5, 4, 0.1],
  },
);
