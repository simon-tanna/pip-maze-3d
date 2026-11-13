import { describe, expect, it } from 'vitest';
import { tileToWorld } from '@core/grid';
import { STEP_MS, stepPosition } from '@core/step';

const from = { col: 3, row: 4 };
const east = { col: 4, row: 4 };
const north = { col: 3, row: 3 };

describe('stepPosition', () => {
  it('starts on the from tile centre and ends on the to tile centre', () => {
    expect(stepPosition(from, east, 0)).toEqual(tileToWorld(3, 4));
    expect(stepPosition(from, east, 1)).toEqual(tileToWorld(4, 4));
    expect(stepPosition(from, north, 1)).toEqual(tileToWorld(3, 3));
  });

  it('moves at constant speed: equal progress covers equal distance', () => {
    const xs = [0, 0.25, 0.5, 0.75, 1].map((p) => stepPosition(from, east, p).x);
    const gaps = xs.slice(1).map((x, i) => x - (xs[i] ?? 0));
    for (const gap of gaps) expect(gap).toBeCloseTo(gaps[0] ?? 0, 10);
    expect(stepPosition(from, east, 0.5).z).toBe(tileToWorld(3, 4).z);
  });

  it('clamps progress to 0–1', () => {
    expect(stepPosition(from, east, -0.5)).toEqual(stepPosition(from, east, 0));
    expect(stepPosition(from, east, 1.7)).toEqual(stepPosition(from, east, 1));
  });

  it('a step lasts v2’s 120 ms', () => {
    expect(STEP_MS).toBe(120);
  });
});
