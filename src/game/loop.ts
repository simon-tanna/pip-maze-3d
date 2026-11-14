/**
 * Fixed-timestep game loop.
 *
 * Simulation (`update`) always advances in constant `step`-sized ticks so grid
 * tweens, hazard timings and mummy AI are frame-rate independent and
 * deterministic (v2 relies on seeded, repeatable hazard phases). Rendering runs
 * once per animation frame with `alpha` in [0, 1) for interpolating between
 * the last two simulation states.
 */
export interface LoopHandlers {
  update(dt: number): void;
  render(alpha: number): void;
}

export interface FixedLoop {
  /** Feed elapsed real time (seconds) for one animation frame. While paused it only renders. */
  advance(frameSeconds: number): void;
  /** When true, `advance` runs no updates and banks no time (dev `sim.pause()`). */
  paused: boolean;
  /**
   * Run `ceil(ms / step)` updates directly, bypassing the frame clamp, then render once.
   * Works paused or not; drops any banked partial tick so the result is deterministic.
   * `render: false` skips the render (e2e walks render only their last step).
   */
  step(ms: number, opts?: { render?: boolean }): void;
}

/** Upper bound on one frame's elapsed time, so a backgrounded tab can't trigger a spiral of catch-up ticks. */
export const MAX_FRAME_SECONDS = 0.25;

/** Absorbs float noise in `ms / step` (100 ms at 1/60 s is 6.000000000000001 ticks). */
const TICK_EPSILON = 1e-9;

export function createFixedLoop(handlers: LoopHandlers, step = 1 / 60): FixedLoop {
  let accumulator = 0;
  return {
    paused: false,
    advance(frameSeconds) {
      if (!this.paused) {
        accumulator += Math.min(Math.max(frameSeconds, 0), MAX_FRAME_SECONDS);
        while (accumulator >= step) {
          handlers.update(step);
          accumulator -= step;
        }
      }
      handlers.render(accumulator / step);
    },
    step(ms, { render = true } = {}) {
      const ticks = Math.max(0, Math.ceil(ms / 1000 / step - TICK_EPSILON));
      for (let i = 0; i < ticks; i++) handlers.update(step);
      accumulator = 0;
      if (render) handlers.render(0);
    },
  };
}
