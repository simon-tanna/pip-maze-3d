/**
 * The damage flash (spec: HUD and overlays → Damage flash; v2 `flash(scene, BLOOD, 0.22,
 * 300)`): a full-screen DOM `BLOOD` overlay that starts at `damageFlashAlpha` on a death
 * and fades linearly to 0 over `damageFlashMs`. None under reduced motion. It runs on the
 * injected clock (`update(now)` per frame) and reads the death time from `diedAt` (the
 * sim's `heroDiedAt`, wired by `main.ts`), so it pauses and freezes with the simulation.
 */
import './damage-flash.css';

export interface DamageFlashTiming {
  damageFlashAlpha: number;
  damageFlashMs: number;
}

/** The overlay's opacity `ms` after the hit (null: no hit yet). */
export function damageFlashOpacity(
  ms: number | null,
  { damageFlashAlpha, damageFlashMs }: DamageFlashTiming,
  reducedMotion: boolean,
): number {
  if (reducedMotion || ms === null || ms < 0 || ms >= damageFlashMs) return 0;
  return damageFlashAlpha * (1 - ms / damageFlashMs);
}

export interface DamageFlash {
  readonly element: HTMLElement;
  update(nowMs: number): void;
  /** The opacity drawn on the last update. */
  opacity(): number;
}

export interface DamageFlashOptions {
  /** Where the overlay goes: it is prepended, so it sits under the HUD panels. */
  root: HTMLElement;
  /** Live tunables (`look.hud`), read every update. */
  timing: DamageFlashTiming;
  /** The last death's time (null: none this level), on the same clock as `update`. */
  diedAt(): number | null;
  reducedMotion(): boolean;
}

export function createDamageFlash(opts: DamageFlashOptions): DamageFlash {
  const element = document.createElement('div');
  element.className = 'damage-flash';
  element.dataset['fx'] = 'damage-flash';
  opts.root.prepend(element);
  let shown = 0;
  return {
    element,
    update(nowMs) {
      const hitAt = opts.diedAt();
      const ms = hitAt === null ? null : nowMs - hitAt;
      const o = damageFlashOpacity(ms, opts.timing, opts.reducedMotion());
      if (o === shown) return;
      shown = o;
      element.style.opacity = String(o);
    },
    opacity: () => shown,
  };
}
