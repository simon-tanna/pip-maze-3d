/**
 * The flame-pool allocator (spec Render → Flame, map ticket 03): the rig's fixed pool
 * slots (`look.lights.poolSlots`, confirmed at 4 by ticket 02's bench) go to firing flames
 * first, then telegraphing ones, then the nearest to the hero, so a slot is usually in
 * place before its flame telegraphs.
 *
 * Intensity-only: lights are never added, removed or hidden. Each slot fades linearly
 * toward its target, a full peak in `look.lights.poolFadeMs`. Peak is `poolIntensity ×
 * poolPeakScale` while firing; a telegraph ramps to `look.flame.poolTelegraph` of peak with
 * the grate heat. A slot handed to another flame fades out where it stands, then moves.
 */
import type { PointLight } from 'three';
import type { FlameState } from '@core/hazards';
import type { WorldXZ } from '@core/grid';
import { look } from './look';

export interface PoolFlame extends WorldXZ {
  state: FlameState;
  /** Grate heat, 0–1 (`flameVisual`). */
  heat: number;
  /** Multiplier on the target (the live flicker). Default 1. */
  flicker?: number;
}

const PRIORITY: Readonly<Record<FlameState, number>> = { on: 0, telegraph: 1, off: 2 };

/** Flame `a` ranks before flame `b`: firing, then telegraphing, then nearest, then index. */
function ranksBefore(flames: readonly PoolFlame[], hero: WorldXZ, a: number, b: number): boolean {
  const fa = flames[a];
  const fb = flames[b];
  if (!fa || !fb) return false;
  const pa = PRIORITY[fa.state];
  const pb = PRIORITY[fb.state];
  if (pa !== pb) return pa < pb;
  const da = (fa.x - hero.x) ** 2 + (fa.z - hero.z) ** 2;
  const db = (fb.x - hero.x) ** 2 + (fb.z - hero.z) ** 2;
  if (da !== db) return da < db;
  return a < b;
}

/** `rankPoolFlames` into `out` (cleared first), without allocating: a partial insertion sort. */
function rankInto(out: number[], flames: readonly PoolFlame[], hero: WorldXZ, slots: number) {
  out.length = 0;
  if (slots <= 0) return out;
  for (let i = 0; i < flames.length; i++) {
    if (out.length < slots) out.push(i);
    else if (ranksBefore(flames, hero, i, out[slots - 1] ?? -1)) out[slots - 1] = i;
    else continue;
    for (let j = out.length - 1; j > 0; j--) {
      const here = out[j] ?? -1;
      const above = out[j - 1] ?? -1;
      if (!ranksBefore(flames, hero, here, above)) break;
      out[j] = above;
      out[j - 1] = here;
    }
  }
  return out;
}

/** Indices of the `slots` flames that get a pool light, best first. */
export function rankPoolFlames(
  flames: readonly PoolFlame[],
  hero: WorldXZ,
  slots: number,
): number[] {
  return rankInto([], flames, hero, slots);
}

export interface FlamePools {
  /** Assign and fade the slots for this frame; `dtMs` is frame time on the sim clock. */
  update(flames: readonly PoolFlame[], hero: WorldXZ, dtMs: number): void;
  /** Level teardown: every slot unassigned at intensity 0. */
  reset(): void;
}

export function createFlamePools(pools: readonly PointLight[]): FlamePools {
  /** The flame index each slot lights (or is fading out from), or -1. */
  let owner: number[] = pools.map(() => -1);
  /** Per-frame scratch: this frame's chosen flames, and those still without a slot. */
  const chosen: number[] = [];
  const waiting: number[] = [];

  const target = (f: PoolFlame | undefined) => {
    if (!f) return 0;
    const peak = look.lights.poolIntensity * look.lights.poolPeakScale;
    const k = f.flicker ?? 1;
    if (f.state === 'on') return peak * k;
    if (f.state === 'telegraph') return peak * look.flame.poolTelegraph * f.heat;
    return 0;
  };

  return {
    update(flames, hero, dtMs) {
      rankInto(chosen, flames, hero, pools.length);
      // A slot keeps a chosen flame it already owns; the other chosen flames wait for one.
      waiting.length = 0;
      for (const i of chosen) if (!owner.includes(i)) waiting.push(i);
      let next = 0;
      const peak = look.lights.poolIntensity * look.lights.poolPeakScale;
      const fadeMs = look.lights.poolFadeMs;
      const step = fadeMs > 0 ? (peak * Math.max(0, dtMs)) / fadeMs : Infinity;

      for (let s = 0; s < pools.length; s++) {
        const light = pools[s];
        if (!light) continue;
        const mine = owner[s] ?? -1;
        let goal: number;
        if (mine >= 0 && chosen.includes(mine)) {
          const f = flames[mine];
          // Re-placed every frame: the light bench may have borrowed the slot.
          if (f) light.position.set(f.x, look.lights.poolHeight, f.z);
          goal = target(f);
        } else if (light.intensity > 0 && mine >= 0) {
          goal = 0; // fade out where it stands before it moves
        } else {
          const i = waiting[next++];
          owner[s] = i ?? -1;
          const f = i === undefined ? undefined : flames[i];
          if (f) light.position.set(f.x, look.lights.poolHeight, f.z);
          goal = target(f);
        }
        const delta = goal - light.intensity;
        light.intensity += Math.sign(delta) * Math.min(Math.abs(delta), step);
        light.distance = look.lights.poolDistance;
      }
    },
    reset() {
      owner = pools.map(() => -1);
      for (const light of pools) light.intensity = 0;
    },
  };
}
