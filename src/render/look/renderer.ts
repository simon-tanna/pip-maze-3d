import { section } from './registry';

/** Canvas and composer settings (ADR 0001, spec Render → Foundation). */
export const renderer = section(
  'renderer',
  {
    /**
     * devicePixelRatio is capped here. 1, not 2: every pass is fill-bound, and DPR 2 on a
     * Retina M3 quadruples the 4x-MSAA HalfFloat target and bloom (≈50 ms frames vs 16.7).
     */
    maxPixelRatio: 1,
    /** MSAA samples on the composer's HalfFloat target (the canvas itself has no AA). */
    msaaSamples: 4,
    /** NeutralToneMapping exposure. */
    exposure: 1,
  },
  { exposure: [0.2, 3, 0.01] },
);
