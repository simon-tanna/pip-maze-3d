/**
 * HUD animation on an injected clock. Every HUD tween runs off the time `update(now)` is
 * called with (main.ts passes render-interpolated simulation time), not wall-clock time,
 * so a paused sim freezes the HUD too and dev `advance(ms)` steps it deterministically.
 * DOM-free.
 */

/** Phaser's eases, as v2 names them (`Cubic.easeInOut`, `Back.easeOut`, …). */
export const ease = {
  linear: (t: number) => t,
  cubicOut: (t: number) => 1 - (1 - t) ** 3,
  cubicInOut: (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2),
  /** Phaser `Back.easeOut`, overshoot 1.70158. */
  backOut: (t: number) => {
    const s = 1.70158;
    const u = t - 1;
    return u * u * ((s + 1) * u + s) + 1;
  },
};

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
