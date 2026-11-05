import { describe, expect, it, vi } from 'vitest';
import { createFixedLoop, MAX_FRAME_SECONDS } from '@game/loop';

describe('createFixedLoop', () => {
  it('runs whole steps and carries the remainder as alpha', () => {
    const update = vi.fn();
    const render = vi.fn();
    const loop = createFixedLoop({ update, render }, 0.1);

    loop.advance(0.25);

    expect(update).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenCalledWith(0.1);
    expect(render.mock.calls[0]?.[0]).toBeCloseTo(0.5);
  });

  it('clamps huge frames so a backgrounded tab cannot spiral', () => {
    const update = vi.fn();
    const loop = createFixedLoop({ update, render: () => {} }, 1 / 64); // binary-exact step

    loop.advance(10);

    expect(update).toHaveBeenCalledTimes(MAX_FRAME_SECONDS * 64);
  });
});
