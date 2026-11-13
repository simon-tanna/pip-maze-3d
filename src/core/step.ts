/**
 * One grid-snap step (spec: Simulation → Steps). The hero takes the destination tile at
 * step start; `stepPosition` is the only source of a body's mid-step position, so the view
 * (in `render(alpha)`) and blade contact (every tick) agree: what you see is what kills.
 */
import { tileToWorld } from './grid';
import type { GridPos, WorldXZ } from './grid';

/** Duration of one tile step in simulation milliseconds (v2: 120 ms tween). */
export const STEP_MS = 120;

/** Linear, constant-speed position from one tile centre to the next. `progress` is clamped to 0–1. */
export function stepPosition(from: GridPos, to: GridPos, progress: number): WorldXZ {
  const p = Math.min(Math.max(progress, 0), 1);
  const a = tileToWorld(from.col, from.row);
  const b = tileToWorld(to.col, to.row);
  return { x: a.x + (b.x - a.x) * p, z: a.z + (b.z - a.z) * p };
}
