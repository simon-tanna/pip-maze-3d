import { describe, expect, it } from 'vitest';
import { DECOR_KINDS, planDecor } from '@core/decor';
import { criticalPath, generateLevel, SPAWN_SAFE_RADIUS, tilesWithin } from '@core/generator';
import type { Level } from '@core/generator';
import { tileKey } from '@core/grid';
import { startTile } from '@core/level';
import v2 from '../fixtures/decor-baseline.json';

// v2's own seed set for property tests (tests/generator-coins.test.mjs).
const SEEDS = Array.from({ length: 60 }, (_, n) => n * 7919 + 1);
const key = (t: { col: number; row: number }) => tileKey(t.col, t.row);
const wall = (level: Level, col: number, row: number) => (level.map[row]?.[col] ?? 1) === 1;

describe('planDecor', () => {
  it('matches v2 tile for tile and kind for kind, outside the spawn zone', () => {
    // Fixture: v2's planDecor(map, levelSeed, avoid) with Game.js's avoid set. The spawn
    // zone is the one 3D addition.
    for (const { index, seed, decor } of v2) {
      const level = generateLevel(index, seed);
      const spawn = tilesWithin(level.map, startTile(level.map), SPAWN_SAFE_RADIUS);
      const expected = decor.filter((d) => !spawn.has(key(d)));
      expect(expected.length, `level ${index} seed ${seed}`).toBeGreaterThan(10);
      const got = planDecor(level, seed).map(({ col, row, kind }) => ({ col, row, kind }));
      expect(got, `level ${index} seed ${seed}`).toEqual(expected);
    }
  });

  it('gives the same decor for the same seed, and different decor for another', () => {
    const level = generateLevel(1, 42);
    expect(planDecor(generateLevel(1, 42), 42)).toEqual(planDecor(level, 42));
    expect(planDecor(level, 43)).not.toEqual(planDecor(level, 42));
  });

  it('never touches a hazard, pickup, the critical path or the spawn zone', () => {
    for (const index of [0, 1, 3]) {
      for (const seed of SEEDS) {
        const level = generateLevel(index, seed);
        const start = startTile(level.map);
        const exit = { col: level.exitCol, row: level.exitRow };
        const banned = new Set([
          ...criticalPath(level.map, start, level.key, level.key2, exit),
          ...tilesWithin(level.map, start, SPAWN_SAFE_RADIUS),
          ...level.coins.map(key),
          key(level.key),
          ...(level.key2 ? [key(level.key2)] : []),
          key(exit),
        ]);
        for (const t of level.traps) {
          if (t.type === 'mummy') {
            for (let c = t.patrolCols[0]; c <= t.patrolCols[1]; c++) banned.add(tileKey(c, t.row));
          } else banned.add(key(t));
        }
        for (const d of planDecor(level, seed)) {
          expect(banned.has(key(d)), `${index}/${seed} ${key(d)}`).toBe(false);
          expect(level.map[d.row]?.[d.col], `${key(d)} is plain floor`).toBe(0);
        }
      }
    }
  });

  it('hugs a wall: north if there is one, else west, else east; moss only under a north wall', () => {
    for (const seed of SEEDS) {
      const level = generateLevel(1, seed);
      for (const d of planDecor(level, seed)) {
        const n = wall(level, d.col, d.row - 1);
        const w = wall(level, d.col - 1, d.row);
        expect(d.side).toBe(n ? 'n' : w ? 'w' : 'e');
        if (d.side === 'e') expect(wall(level, d.col + 1, d.row)).toBe(true);
        if (d.kind === 'moss') expect(d.side).toBe('n');
      }
    }
  });

  it('is sparse, uses all four kinds, and keeps its jitter in [0, 1)', () => {
    const all = SEEDS.flatMap((seed) => planDecor(generateLevel(1, seed), seed));
    expect(new Set(all.map((d) => d.kind))).toEqual(new Set(DECOR_KINDS));
    expect(DECOR_KINDS).toEqual(['bones', 'rubble', 'moss', 'pot']);
    for (const seed of SEEDS.slice(0, 10)) {
      const level = generateLevel(1, seed);
      const floor = level.map.flat().filter((v) => v === 0).length;
      expect(planDecor(level, seed).length).toBeLessThan(floor * 0.12);
    }
    for (const d of all) {
      for (const v of [d.shift, d.turn]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(1);
      }
    }
  });

  it('leaves the level untouched (decor never feeds back into play)', () => {
    const level = generateLevel(1, 42);
    const before = JSON.stringify(level);
    planDecor(level, 42);
    expect(JSON.stringify(level)).toBe(before);
  });
});
