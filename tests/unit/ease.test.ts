import { describe, expect, it } from 'vitest';
import { clamp01, ease, yoyo } from '@core/ease';

describe('ease', () => {
  it('every ease runs 0 → 1', () => {
    for (const [name, f] of Object.entries(ease)) {
      expect(f(0), name).toBeCloseTo(0, 9);
      expect(f(1), name).toBeCloseTo(1, 9);
    }
  });

  it('matches Phaser: cubic, back overshoot, sine', () => {
    expect(ease.cubicOut(0.5)).toBeCloseTo(0.875, 9);
    expect(ease.backOut(0.5)).toBeCloseTo(1 + 2.70158 * -0.125 + 1.70158 * 0.25, 9);
    expect(ease.sineIn(0.5)).toBeCloseTo(1 - Math.SQRT1_2, 9);
    expect(ease.sineInOut(0.5)).toBeCloseTo(0.5, 9);
  });

  it('clamp01 and the sine yoyo', () => {
    expect([clamp01(-1), clamp01(0.3), clamp01(2)]).toEqual([0, 0.3, 1]);
    expect(yoyo(0, 900)).toBeCloseTo(0, 9);
    expect(yoyo(900, 900)).toBeCloseTo(1, 9);
    expect(yoyo(1800, 900)).toBeCloseTo(0, 9);
  });
});
