import { section } from './registry';

/** The DOM HUD's motion (spec: HUD and overlays). `main.ts` hands it to `src/ui`. */
export const hud = section(
  'hud',
  {
    /** Pickup sprite flight to its HUD target, ms (cubic in-out). */
    flyMs: 450,
    /** Landing pop: from this scale back to 1 (Back-out). */
    popScale: 1.3,
    popMs: 200,
    /** The coin "+1" float. */
    plusMs: 800,
    plusRisePx: 18,
    /** "Find the key first!": in (cubic-out), hold, out. */
    toastInMs: 180,
    toastHoldMs: 900,
    toastOutMs: 300,
  },
  {
    flyMs: [0, 1500, 10],
    popScale: [1, 2, 0.05],
    popMs: [0, 800, 10],
    plusMs: [0, 2000, 10],
    plusRisePx: [0, 60, 1],
    toastInMs: [0, 1000, 10],
    toastHoldMs: [0, 3000, 10],
    toastOutMs: [0, 1000, 10],
  },
);
