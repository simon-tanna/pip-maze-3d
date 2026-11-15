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
    /** Death (ticket 15, v2 `hero.die`): CREAM emissive hit flash, ms and strength. */
    hitFlashMs: 80,
    hitFlash: 1.2,
    /** Knockback opposite the facing, m, over ms (cubic-out); held through the collapse. */
    knockbackM: 0.25,
    knockbackMs: 110,
    /** Collapse to nothing (cubic-in), ending at the sim's `gone`: ms, and the stretch at its end. */
    collapseMs: 160,
    collapseStretch: 1.4,
    /** Respawn pop: from this scale to 1 over ms (Back-out), from `gone`. */
    popFrom: 0.4,
    popMs: 260,
    /** Grace: the hero mesh toggles every this many ms (v2's 80). */
    flickerMs: 80,
    /** Grace under reduced motion: a steady rim this strong instead of the flicker. */
    graceRim: 1,
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
    hitFlashMs: [0, 300, 5],
    hitFlash: [0, 4, 0.05],
    knockbackM: [0, 1, 0.01],
    knockbackMs: [0, 270, 5],
    collapseMs: [10, 270, 5],
    collapseStretch: [1, 2, 0.05],
    popFrom: [0, 1, 0.01],
    popMs: [0, 600, 10],
    flickerMs: [20, 300, 5],
    graceRim: [0, 3, 0.05],
  },
);
