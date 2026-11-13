import { describe, expect, it } from 'vitest';
import { createFrameStats } from '@render/frame-stats';

describe('frame stats', () => {
  it('summarises mean, p95, worst and frames over 33 ms', () => {
    const stats = createFrameStats();
    // 95 frames at 10 ms, 4 at 20 ms, 1 at 40 ms
    for (let i = 0; i < 95; i++) stats.record(10);
    for (let i = 0; i < 4; i++) stats.record(20);
    stats.record(40);
    expect(stats.summary()).toEqual({
      frames: 100,
      meanMs: 10.7,
      p95Ms: 10,
      worstMs: 40,
      over33: 1,
    });
  });

  it('uses nearest-rank p95', () => {
    const stats = createFrameStats();
    for (let i = 1; i <= 20; i++) stats.record(i); // rank ceil(0.95 * 20) = 19
    expect(stats.summary().p95Ms).toBe(19);
  });

  it('keeps only the most recent window of frames', () => {
    const stats = createFrameStats(3);
    for (const ms of [100, 1, 2, 3]) stats.record(ms);
    expect(stats.summary()).toMatchObject({ frames: 3, worstMs: 3, meanMs: 2 });
  });

  it('resets, and summarises an empty window as zeros', () => {
    const stats = createFrameStats();
    stats.record(50);
    stats.reset();
    expect(stats.summary()).toEqual({ frames: 0, meanMs: 0, p95Ms: 0, worstMs: 0, over33: 0 });
  });
});
