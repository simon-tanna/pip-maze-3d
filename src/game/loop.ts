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
  /** Feed elapsed real time (seconds) for one animation frame. */
  advance(frameSeconds: number): void;
}

/** Upper bound on one frame's elapsed time, so a backgrounded tab can't trigger a spiral of catch-up ticks. */
export const MAX_FRAME_SECONDS = 0.25;

export function createFixedLoop(handlers: LoopHandlers, step = 1 / 60): FixedLoop {
  let accumulator = 0;
  return {
    advance(frameSeconds) {
      accumulator += Math.min(Math.max(frameSeconds, 0), MAX_FRAME_SECONDS);
      while (accumulator >= step) {
        handlers.update(step);
        accumulator -= step;
      }
      handlers.render(accumulator / step);
    },
  };
}
