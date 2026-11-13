/**
 * The chamber HUD, in the DOM inside `#hud` (spec: HUD and overlays). Being DOM, the
 * post chain never touches it. It reacts to simulation events that `main.ts` forwards;
 * it never reads the scene and never imports three.js: `project(world)` is injected.
 *
 * - Top-left: the "CHAMBER N" title panel, then the coin panel (session total).
 * - Top-right: 1 or 2 key slots, empty as an `INK` silhouette at 0.75, filled in gold.
 * - Fly-to: on pickup the world position is projected once; a sprite flies to the target
 *   over `flyMs` (cubic in-out). On landing the coin count updates and pops with a "+1",
 *   or the key slot fills and pops. Reduced motion skips the pops and the "+1", never
 *   the flight. Key slots follow `key-slots.ts`: the sim's current count, not the count
 *   at pickup; `keyLost()` cancels in-flight key sprites.
 * - Toast: centred, in / hold / out (`toastOpacity`).
 *
 * Every animation runs on the injected clock (`now()` at an event, `update(now)` per frame).
 * Colours come from the palette's CSS variables (`main.ts` sets them from `css()`).
 */
import type { WorldXZ } from '@core/grid';
import { createKeySlots } from './key-slots';
import type { KeySlots } from './key-slots';
import { createTweens, ease, toastOpacity } from './tweens';
import type { ToastTiming } from './tweens';
import './hud.css';

export interface HudTiming extends ToastTiming {
  flyMs: number;
  /** Pop start scale (eases Back-out to 1). */
  popScale: number;
  popMs: number;
  /** The "+1" float: duration and rise. */
  plusMs: number;
  plusRisePx: number;
}

export interface ScreenPoint {
  x: number;
  y: number;
}

export interface HudOptions {
  root: HTMLElement;
  /** The HUD clock, ms (render-interpolated simulation time in the game). */
  now(): number;
  /** World → CSS pixels in the viewport; null when off screen. */
  project(world: WorldXZ): ScreenPoint | null;
  /** The sim's current key count (key slots render from it). */
  keys(): number;
  /** Live tunables (`look.hud`), read when an animation starts. */
  timing: HudTiming;
  reducedMotion(): boolean;
  /** The session coin total at boot. */
  coins: number;
}

export interface HudLevel {
  /** Level index; the title shows index + 1. */
  index: number;
  requiredKeys: number;
}

export interface Hud {
  /** Build the chamber's panels (each level). */
  level(level: HudLevel): void;
  coin(event: { world: WorldXZ; total: number }): void;
  key(event: { world: WorldXZ; index: number }): void;
  keyLost(): void;
  toast(text: string): void;
  update(now: number): void;
}

const KEY_SVG = `<svg viewBox="0 0 26 24" aria-hidden="true"><path fill="currentColor" d="M7 4a7 7 0 1 1 0 14A7 7 0 0 1 7 4Zm0 4.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5ZM13 9h13v4h-2v4h-4v-4h-2v3h-4v-3h-1Z"/></svg>`;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  attrs: Record<string, string> = {},
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = className;
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

const centre = (e: Element): ScreenPoint => {
  const r = e.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
};

const place = (e: HTMLElement, p: ScreenPoint) => {
  e.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%)`;
};

export function createHud(opts: HudOptions): Hud {
  const { root, timing } = opts;
  const tweens = createTweens();
  root.replaceChildren();
  root.classList.add('hud');

  const left = el('div', 'hud-left');
  const title = el('div', 'hud-panel hud-title', { 'data-hud': 'chamber' });
  const coinPanel = el('div', 'hud-panel hud-coins', { 'data-hud': 'coins' });
  const coinIcon = el('span', 'hud-coin-icon', { 'data-hud': 'coin-icon' });
  const coinCount = el('span', 'hud-coin-count', { 'data-hud': 'coin-count' });
  coinCount.textContent = String(opts.coins);
  coinPanel.append(coinIcon, coinCount);
  left.append(title, coinPanel);
  const keyBar = el('div', 'hud-keys', { 'data-hud': 'keys' });
  const toast = el('div', 'hud-toast', { 'data-hud': 'toast', role: 'status' });
  toast.style.opacity = '0';
  const flyers = el('div', 'hud-flyers');
  root.append(left, keyBar, toast, flyers);

  let slots: KeySlots = createKeySlots(0, opts.keys);
  let slotEls: HTMLElement[] = [];
  const keyFlights = new Map<number, { tween: number; sprite: HTMLElement }>();
  let toastTween: number | null = null;

  const renderSlots = () => {
    slots.filled().forEach((filled, i) => {
      const slot = slotEls[i];
      if (slot) slot.dataset['filled'] = String(filled);
    });
  };

  /** Scale `targets` from `popScale` back to 1 (Back-out). Skipped under reduced motion. */
  const pop = (targets: HTMLElement[]) => {
    if (opts.reducedMotion()) return;
    const from = timing.popScale;
    tweens.add({
      at: opts.now(),
      ms: timing.popMs,
      update: (t) => {
        const s = from + (1 - from) * ease.backOut(t);
        for (const e of targets) e.style.scale = String(s);
      },
      done: () => {
        for (const e of targets) e.style.scale = '';
      },
    });
  };

  const plusOne = () => {
    if (opts.reducedMotion()) return;
    const plus = el('div', 'hud-plus', { 'data-hud': 'plus' });
    plus.textContent = '+1';
    const at = centre(coinIcon);
    const rise = timing.plusRisePx;
    flyers.append(plus);
    tweens.add({
      at: opts.now(),
      ms: timing.plusMs,
      update: (t) => {
        place(plus, { x: at.x + 6, y: at.y + 30 - rise * t });
        plus.style.opacity = String(1 - t);
      },
      done: () => plus.remove(),
    });
  };

  /** Fly a sprite from `world` to `target`; `land` runs on arrival (at once if off screen). */
  const fly = (kind: 'coin' | 'key', world: WorldXZ, target: Element, land: () => void) => {
    const from = opts.project(world);
    if (!from) {
      land();
      return null;
    }
    const to = centre(target);
    const sprite = el('div', `hud-flyer hud-flyer-${kind}`, { 'data-hud': `flyer-${kind}` });
    if (kind === 'key') sprite.innerHTML = KEY_SVG;
    place(sprite, from);
    flyers.append(sprite);
    const tween = tweens.add({
      at: opts.now(),
      ms: timing.flyMs,
      update: (t) => {
        const k = ease.cubicInOut(t);
        place(sprite, { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k });
      },
      done: () => {
        sprite.remove();
        land();
      },
    });
    return { tween, sprite };
  };

  return {
    level({ index, requiredKeys }) {
      title.textContent = `CHAMBER ${index + 1}`;
      for (const { tween, sprite } of keyFlights.values()) {
        tweens.cancel(tween);
        sprite.remove();
      }
      keyFlights.clear();
      slots = createKeySlots(requiredKeys, opts.keys);
      slotEls = Array.from({ length: requiredKeys }, () => {
        const slot = el('div', 'hud-panel hud-key-slot', { 'data-hud': 'key-slot' });
        const icon = el('span', 'hud-key-icon', { 'data-hud': 'key-icon' });
        icon.innerHTML = KEY_SVG;
        slot.append(icon);
        return slot;
      });
      keyBar.replaceChildren(...slotEls);
      renderSlots();
    },
    coin({ world, total }) {
      fly('coin', world, coinIcon, () => {
        coinCount.textContent = String(total);
        pop([coinIcon, coinCount]);
        plusOne();
      });
    },
    key({ world, index }) {
      const id = slots.launch(index);
      const slotEl = slotEls[index];
      if (!slotEl) return;
      const arrive = () => {
        keyFlights.delete(id);
        const fill = slots.land(id);
        renderSlots();
        const icon = slotEl.firstElementChild;
        if (fill && icon instanceof HTMLElement) pop([icon]);
      };
      const flight = fly('key', world, slotEl, arrive);
      if (flight) keyFlights.set(id, flight);
    },
    keyLost() {
      for (const id of slots.lost()) {
        const flight = keyFlights.get(id);
        if (!flight) continue;
        tweens.cancel(flight.tween);
        flight.sprite.remove();
        keyFlights.delete(id);
      }
      renderSlots();
    },
    toast(text) {
      if (toastTween !== null) tweens.cancel(toastTween);
      toast.textContent = text;
      const total = timing.toastInMs + timing.toastHoldMs + timing.toastOutMs;
      const t0 = opts.now();
      const snapshot = { ...timing };
      toastTween = tweens.add({
        at: t0,
        ms: total,
        update: (t) => {
          const ms = t * total;
          toast.style.opacity = String(toastOpacity(ms, snapshot));
          // v2 drifts up 10 px in, 10 px more out.
          const out = Math.max(0, ms - snapshot.toastInMs - snapshot.toastHoldMs);
          const y =
            10 * (1 - ease.cubicOut(Math.min(ms / snapshot.toastInMs, 1))) -
            10 * Math.min(out / snapshot.toastOutMs, 1);
          toast.style.translate = `0 ${y}px`;
        },
        done: () => {
          toastTween = null;
        },
      });
    },
    update(now) {
      tweens.update(now);
    },
  };
}
