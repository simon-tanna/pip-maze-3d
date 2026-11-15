/**
 * A flame's look at one instant, from the core flame clock alone (`state`, `intoMs`), so
 * the view can neither lead nor lag the rule (map ticket 07, preset D):
 *
 * - `size`: the column's scale, 0–1 (back-out overshoots a little). Ignite starts on the
 *   go-live tick at `igniteFrom` and grows back-out to 1 over `igniteMs`. On the off tick
 *   the column is already below 0.25 (`collapseFrom`) and shrinks to `collapseTo` over
 *   `collapseMs`, so no frame shows a tall column on a tile that isn't lethal.
 * - `alpha`: the column's strength (1 while live; fades to 0 through the collapse).
 * - `heat`: the grate bed, 0–1: sine-in through the telegraph, 1 while live, cooling
 *   linearly over `coolMs` after the off tick.
 */
import type { FlameState } from '@core/hazards';
import { HAZARD_TIMING } from '@core/hazards';
import { look } from './look';

export interface FlameVisual {
  size: number;
  alpha: number;
  heat: number;
}

const backOut = (x: number) => 1 + 2.70158 * (x - 1) ** 3 + 1.70158 * (x - 1) ** 2;
const sineIn = (x: number) => 1 - Math.cos((x * Math.PI) / 2);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
/** `ms / span` clamped to 0–1; a zero span is already done. */
const progress = (ms: number, span: number) => (span > 0 ? clamp01(ms / span) : 1);

/** Writes into `out` when given (the view reuses one per flame), and returns it. */
export function flameVisual(
  state: FlameState,
  intoMs: number,
  out: FlameVisual = { size: 0, alpha: 0, heat: 0 },
): FlameVisual {
  const f = look.flame;
  if (state === 'on') {
    const k = progress(intoMs, f.igniteMs);
    out.size = k >= 1 ? 1 : f.igniteFrom + (1 - f.igniteFrom) * backOut(k);
    out.alpha = 1;
    out.heat = 1;
  } else if (state === 'telegraph') {
    out.size = 0;
    out.alpha = 0;
    out.heat = sineIn(progress(intoMs, HAZARD_TIMING.telegraph));
  } else {
    const k = progress(intoMs, f.collapseMs);
    out.size = f.collapseFrom + (f.collapseTo - f.collapseFrom) * k;
    out.alpha = 1 - k;
    out.heat = 1 - progress(intoMs, f.coolMs);
  }
  return out;
}
