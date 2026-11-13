import { describe, expect, it } from 'vitest';
import { ease, createTweens, toastOpacity } from '@ui/tweens';

describe('eases', () => {
  it('run 0 → 1 with Phaser’s shapes', () => {
    for (const f of Object.values(ease)) {
      expect(f(0)).toBeCloseTo(0, 9);
      expect(f(1)).toBeCloseTo(1, 9);
    }
    expect(ease.cubicInOut(0.25)).toBeCloseTo(0.0625, 9);
    expect(ease.cubicInOut(0.5)).toBeCloseTo(0.5, 9);
    expect(ease.cubicOut(0.5)).toBeCloseTo(0.875, 9);
    expect(Math.max(...[0.5, 0.6, 0.7, 0.8].map(ease.backOut))).toBeGreaterThan(1); // overshoots
  });
});

describe('tweens', () => {
  it('drive progress off the clock they are updated with, then complete once', () => {
    const tweens = createTweens();
    const seen: number[] = [];
    let done = 0;
    tweens.add({ at: 100, ms: 200, update: (t) => seen.push(t), done: () => done++ });
    tweens.update(100);
    tweens.update(200);
    tweens.update(400);
    tweens.update(500);
    expect(seen).toEqual([0, 0.5, 1]);
    expect(done).toBe(1);
    expect(tweens.size).toBe(0);
  });

  it('cancel stops a tween without completing it', () => {
    const tweens = createTweens();
    let done = 0;
    const id = tweens.add({ at: 0, ms: 100, update: () => {}, done: () => done++ });
    tweens.cancel(id);
    tweens.update(200);
    expect(done).toBe(0);
  });
});

describe('toast opacity', () => {
  const timing = { toastInMs: 180, toastHoldMs: 900, toastOutMs: 300 };
  it('fades in over 180 ms, holds 900 ms, fades out over 300 ms', () => {
    expect(toastOpacity(0, timing)).toBe(0);
    expect(toastOpacity(90, timing)).toBeCloseTo(ease.cubicOut(0.5), 9);
    expect(toastOpacity(180, timing)).toBe(1);
    expect(toastOpacity(1080, timing)).toBe(1);
    expect(toastOpacity(1230, timing)).toBeCloseTo(0.5, 9);
    expect(toastOpacity(1380, timing)).toBe(0);
    expect(toastOpacity(2000, timing)).toBe(0);
  });
});
