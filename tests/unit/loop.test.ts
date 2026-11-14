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

describe('FixedLoop.step and paused', () => {
  it('step(1000) runs 60 updates despite the 0.25 s frame clamp, then one render', () => {
    const update = vi.fn();
    const render = vi.fn();
    const loop = createFixedLoop({ update, render });

    loop.step(1000);

    expect(update).toHaveBeenCalledTimes(60);
    expect(render).toHaveBeenCalledTimes(1);
  });

  it('step(ms, { render: false }) runs the same updates without rendering', () => {
    const update = vi.fn();
    const render = vi.fn();
    const loop = createFixedLoop({ update, render });

    loop.step(100, { render: false });

    expect(update).toHaveBeenCalledTimes(6);
    expect(render).not.toHaveBeenCalled();
  });

  it('step(ms) runs ceil(ms / tick) updates, with no float drift on whole ticks', () => {
    const update = vi.fn();
    const loop = createFixedLoop({ update, render: () => {} });

    loop.step(100); // exactly 6 ticks
    expect(update).toHaveBeenCalledTimes(6);
    loop.step(120); // 7.2 ticks
    expect(update).toHaveBeenCalledTimes(6 + 8);
    loop.step(0);
    expect(update).toHaveBeenCalledTimes(14);
  });

  it('nothing advances while paused, and step still works', () => {
    const update = vi.fn();
    const loop = createFixedLoop({ update, render: () => {} });

    loop.paused = true;
    loop.advance(0.2);
    loop.advance(0.2);
    expect(update).not.toHaveBeenCalled();

    loop.step(50);
    expect(update).toHaveBeenCalledTimes(3);

    loop.paused = false;
    loop.advance(1 / 60);
    expect(update).toHaveBeenCalledTimes(4); // the paused frames were not banked
  });
});
