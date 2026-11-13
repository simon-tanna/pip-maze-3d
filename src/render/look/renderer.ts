import { section } from './registry';

/** Canvas and composer settings (ADR 0001, spec Render → Foundation). */
export const renderer = section(
  'renderer',
  {
    /** devicePixelRatio is capped here. */
    maxPixelRatio: 2,
    /** MSAA samples on the composer's HalfFloat target (the canvas itself has no AA). */
    msaaSamples: 4,
    /** NeutralToneMapping exposure. */
    exposure: 1,
  },
  { exposure: [0.2, 3, 0.01] },
);
