import { describe, expect, it } from 'vitest';
import { generateLevel } from '@core/generator';
import { startTile } from '@core/level';

describe('startTile', () => {
  it('finds the map’s start tile (value 2)', () => {
    const { map } = generateLevel(0, 1);
    const { col, row } = startTile(map);
    expect(map[row]?.[col]).toBe(2);
  });

  it('throws on a map without one', () => {
    expect(() => startTile([[0, 1]])).toThrow();
  });
});
