import { describe, expect, it } from 'vitest';
import { irisOpenness } from '@ui/iris';

describe('irisOpenness', () => {
  it('closes cubic-in: still mostly open early, shut at the end', () => {
    const close = { kind: 'close' as const, at: 0, ms: 420 };
    expect(irisOpenness(close, 0)).toBe(1);
    expect(irisOpenness(close, 210)).toBeCloseTo(1 - 0.5 ** 3, 9);
    expect(irisOpenness(close, 420)).toBe(0);
    expect(irisOpenness(close, 999)).toBe(0);
  });

  it('opens cubic-out: mostly open early, fully open at the end', () => {
    const open = { kind: 'open' as const, at: 100, ms: 420 };
    expect(irisOpenness(open, 100)).toBe(0);
    expect(irisOpenness(open, 310)).toBeCloseTo(1 - 0.5 ** 3, 9);
    expect(irisOpenness(open, 520)).toBe(1);
  });

  it('a 0 ms iris is an instant cut', () => {
    expect(irisOpenness({ kind: 'close', at: 5, ms: 0 }, 5)).toBe(0);
    expect(irisOpenness({ kind: 'open', at: 5, ms: 0 }, 5)).toBe(1);
  });
});
