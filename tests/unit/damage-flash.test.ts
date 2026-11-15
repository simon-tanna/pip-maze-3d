import { describe, expect, it } from 'vitest';
import { damageFlashOpacity } from '@ui/damage-flash';

const TIMING = { damageFlashAlpha: 0.22, damageFlashMs: 300 };

describe('damage flash (v2 flash(BLOOD, 0.22, 300))', () => {
  it('starts at 0.22 and fades linearly to 0 over 300 ms', () => {
    expect(damageFlashOpacity(0, TIMING, false)).toBeCloseTo(0.22, 9);
    expect(damageFlashOpacity(150, TIMING, false)).toBeCloseTo(0.11, 9);
    expect(damageFlashOpacity(300, TIMING, false)).toBe(0);
    expect(damageFlashOpacity(-1, TIMING, false)).toBe(0);
    expect(damageFlashOpacity(null, TIMING, false)).toBe(0);
  });

  it('never shows under reduced motion', () => {
    for (const ms of [0, 50, 150, 299]) expect(damageFlashOpacity(ms, TIMING, true)).toBe(0);
  });
});
