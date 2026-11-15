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

/** Indices of the `slots` flames that get a pool light, best first. */
export function rankPoolFlames(
  flames: readonly PoolFlame[],
  hero: WorldXZ,
  slots: number,
): number[] {
  const d2 = (f: PoolFlame) => (f.x - hero.x) ** 2 + (f.z - hero.z) ** 2;
  return flames
    .map((f, i) => ({ i, p: PRIORITY[f.state], d: d2(f) }))
    .sort((a, b) => a.p - b.p || a.d - b.d || a.i - b.i)
    .slice(0, slots)
    .map((r) => r.i);
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
      const chosen = rankPoolFlames(flames, hero, pools.length);
      const kept = new Set(owner.filter((o) => chosen.includes(o)));
      const waiting = chosen.filter((i) => !kept.has(i));
      const peak = look.lights.poolIntensity * look.lights.poolPeakScale;
      const fadeMs = look.lights.poolFadeMs;
      const step = fadeMs > 0 ? (peak * Math.max(0, dtMs)) / fadeMs : Infinity;

      pools.forEach((light, s) => {
        const mine = owner[s] ?? -1;
        let goal: number;
        if (mine >= 0 && kept.has(mine)) {
          const f = flames[mine];
          // Re-placed every frame: the light bench may have borrowed the slot.
          if (f) light.position.set(f.x, look.lights.poolHeight, f.z);
          goal = target(f);
        } else if (light.intensity > 0 && mine >= 0) {
          goal = 0; // fade out where it stands before it moves
        } else {
          const next = waiting.shift();
          owner[s] = next ?? -1;
          const f = next === undefined ? undefined : flames[next];
          if (f) light.position.set(f.x, look.lights.poolHeight, f.z);
          goal = target(f);
        }
        const delta = goal - light.intensity;
        light.intensity += Math.sign(delta) * Math.min(Math.abs(delta), step);
        light.distance = look.lights.poolDistance;
      });
    },
    reset() {
      owner = pools.map(() => -1);
      for (const light of pools) light.intensity = 0;
    },
  };
}
