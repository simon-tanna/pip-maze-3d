/**
 * HUD animation on an injected clock. Every HUD tween runs off the time `update(now)` is
 * called with (main.ts passes render-interpolated simulation time), not wall-clock time,
 * so a paused sim freezes the HUD too and dev `advance(ms)` steps it deterministically.
 * DOM-free.
 */

import { ease } from '@core/ease';

/** The shared eases (`@core/ease`), re-exported for the HUD. */
export { ease };

export interface TweenSpec {
  /** Start time on the HUD clock, ms. */
  at: number;
  ms: number;
  /** Raw progress in [0, 1]; apply an ease yourself. */
  update(t: number): void;
  done?(): void;
}

export interface Tweens {
  add(spec: TweenSpec): number;
  cancel(id: number): void;
  update(now: number): void;
  readonly size: number;
}

export function createTweens(): Tweens {
  const live = new Map<number, TweenSpec>();
  let nextId = 0;
  return {
    add(spec) {
      const id = nextId++;
      live.set(id, spec);
      return id;
    },
    cancel(id) {
      live.delete(id);
    },
    update(now) {
      for (const [id, spec] of [...live]) {
        if (!live.has(id)) continue; // cancelled by an earlier tween's callback
        const t = spec.ms > 0 ? Math.min(Math.max((now - spec.at) / spec.ms, 0), 1) : 1;
        spec.update(t);
        if (t >= 1) {
          live.delete(id);
          spec.done?.();
        }
      }
    },
    get size() {
      return live.size;
    },
  };
}

export interface ToastTiming {
  toastInMs: number;
  toastHoldMs: number;
  toastOutMs: number;
}

/** The toast's opacity `ms` after it shows: in (cubic-out), hold, out (linear). */
export function toastOpacity(ms: number, { toastInMs, toastHoldMs, toastOutMs }: ToastTiming) {
  if (ms <= 0) return 0;
  if (ms < toastInMs) return ease.cubicOut(ms / toastInMs);
  const out = ms - toastInMs - toastHoldMs;
  if (out <= 0) return 1;
  return out >= toastOutMs ? 0 : 1 - out / toastOutMs;
}
