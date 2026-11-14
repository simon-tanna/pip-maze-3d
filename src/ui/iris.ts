/**
 * The iris (spec: HUD and overlays → Iris): a DOM `INK` overlay with a radial-gradient
 * mask. It closes on a world point's projected position (cubic-in) and opens on another
 * (cubic-out); a 0 ms iris is an instant cut (reduced motion). The state machine
 * (`@game/state`) decides when and how long; this only draws.
 *
 * It starts closed (full `INK`), so loading and the first build happen behind it.
 * The centre is re-projected every frame, so an open on the hero tracks the camera as
 * it cuts to the new level. Runs on the injected clock (render-interpolated sim time).
 *
 * Observable for e2e: `data-iris` is `closed | closing | opening | open`, `data-iris-at` is
 * when the last close/open started (clock ms), and `--iris-open` is the open fraction
 * (0 shut … 1 fully open).
 */
import type { WorldXZ } from '@core/grid';
import type { ScreenPoint } from './hud';
import { ease } from './tweens';

export interface IrisPhase {
  kind: 'close' | 'open';
  /** Start time, ms on the iris clock. */
  at: number;
  ms: number;
}

/** How open the iris is at `now`: 1 fully open, 0 shut. */
export function irisOpenness(phase: IrisPhase, now: number): number {
  const t = phase.ms > 0 ? Math.min(Math.max((now - phase.at) / phase.ms, 0), 1) : 1;
  return phase.kind === 'close' ? 1 - t ** 3 : ease.cubicOut(t);
}

export interface IrisOptions {
  root: HTMLElement;
  now(): number;
  project(world: WorldXZ): ScreenPoint | null;
}

export interface Iris {
  close(at: WorldXZ, ms: number): void;
  open(at: WorldXZ, ms: number): void;
  update(now: number): void;
  readonly element: HTMLElement;
}

export function createIris({ root, now, project }: IrisOptions): Iris {
  const element = document.createElement('div');
  element.className = 'iris';
  element.dataset['iris'] = 'closed';
  element.style.setProperty('--iris-open', '0');
  root.append(element);

  let phase: (IrisPhase & { target: WorldXZ }) | null = null;

  const draw = (open: number, target: WorldXZ) => {
    element.style.setProperty('--iris-open', String(open));
    if (open <= 0) {
      element.style.display = '';
      element.style.maskImage = 'none';
      return;
    }
    if (open >= 1) {
      element.style.display = 'none';
      return;
    }
    const w = window.innerWidth;
    const h = window.innerHeight;
    const c = project(target) ?? { x: w / 2, y: h / 2 };
    // Radius that uncovers the farthest viewport corner from the centre.
    const max = Math.hypot(Math.max(c.x, w - c.x), Math.max(c.y, h - c.y));
    const r = max * open;
    element.style.display = '';
    element.style.maskImage = `radial-gradient(circle at ${c.x}px ${c.y}px, transparent ${r}px, var(--ink) ${r + 1}px)`;
  };

  const update = (t: number) => {
    if (!phase) return;
    const open = irisOpenness(phase, t);
    const done = phase.ms <= 0 || t >= phase.at + phase.ms;
    const state =
      phase.kind === 'close' ? (done ? 'closed' : 'closing') : done ? 'open' : 'opening';
    if (element.dataset['iris'] !== state) {
      element.dataset['iris'] = state;
      // Synchronous, so a dev recorder sees every state even within one advance.
      element.dispatchEvent(new CustomEvent('iris', { detail: { state, at: phase.at } }));
    }
    draw(open, phase.target);
  };

  const start = (kind: IrisPhase['kind'], target: WorldXZ, ms: number) => {
    phase = { kind, at: now(), ms, target };
    element.dataset['irisAt'] = String(phase.at);
    update(phase.at);
  };

  return {
    element,
    close: (at, ms) => start('close', at, ms),
    open: (at, ms) => start('open', at, ms),
    update,
  };
}
