import { describe, expect, it } from 'vitest';
import {
  COIN_MAX,
  COIN_MIN,
  generateLevel,
  isFair,
  LEVEL_CONFIGS,
  levelSeed,
  mulberry32,
  SPAWN_SAFE_RADIUS,
  tilesWithin,
} from '@core/generator';
import { tileKey } from '@core/grid';
import baseline from '../fixtures/generator-baseline.json';
import coinsRoute from '../fixtures/generator-coins-route.json';

// v2's own seed set for property tests (tests/generator-coins.test.mjs).
const SEEDS = Array.from({ length: 60 }, (_, n) => n * 7919 + 1);

describe('generateLevel parity with v2', () => {
  it('keeps every baseline seed’s maze, keys, traps and exit, field for field', () => {
    expect(baseline).toHaveLength(72);
    for (const b of baseline) {
      const l = generateLevel(b.i, b.seed);
      expect(
        {
          map: l.map,
          key: l.key,
          key2: l.key2,
          traps: l.traps,
          exitCol: l.exitCol,
          exitRow: l.exitRow,
        },
        `level ${b.i} seed ${b.seed}`,
      ).toEqual({
        map: b.map,
        key: b.key,
        key2: b.key2,
        traps: b.traps,
        exitCol: b.exitCol,
        exitRow: b.exitRow,
      });
    }
  });

  it('places the same coins and walks the same isFair route as v2', () => {
    expect(coinsRoute).toHaveLength(72);
    for (const f of coinsRoute) {
      const l = generateLevel(f.i, f.seed);
      const fair = isFair(l);
      expect(fair.fair, `level ${f.i} seed ${f.seed}`).toBe(true);
      expect(l.coins, `coins, level ${f.i} seed ${f.seed}`).toEqual(f.coins);
      expect(fair.fair && fair.route, `route, level ${f.i} seed ${f.seed}`).toEqual(f.route);
    }
  });
});

describe('generateLevel', () => {
  it('is pure and deterministic: same input, deep-equal output', () => {
    for (let i = 0; i < LEVEL_CONFIGS.length; i++) {
      expect(generateLevel(i, 777)).toEqual(generateLevel(i, 777));
    }
  });

  it('places 2-5 coins on safe, distinct route floor tiles', () => {
    for (let i = 0; i < LEVEL_CONFIGS.length; i++) {
      for (const seed of SEEDS) {
        const l = generateLevel(i, seed);
        const where = `level ${i} seed ${seed}`;
        expect(l.coins.length, where).toBeGreaterThanOrEqual(COIN_MIN);
        expect(l.coins.length, where).toBeLessThanOrEqual(COIN_MAX);
        const keys = l.coins.map((c) => tileKey(c.col, c.row));
        expect(new Set(keys).size, where).toBe(keys.length);
        const fair = isFair(l);
        if (!fair.fair) throw new Error(`${where}: ${fair.reason}`);
        const route = new Set(fair.route.map(([c, r]) => tileKey(c, r)));
        const spawn = tilesWithin(l.map, { col: 1, row: 1 }, SPAWN_SAFE_RADIUS);
        const blocked = new Set([
          tileKey(l.key.col, l.key.row),
          ...(l.key2 ? [tileKey(l.key2.col, l.key2.row)] : []),
          tileKey(l.exitCol, l.exitRow),
          ...l.traps.flatMap((t) =>
            t.type === 'mummy'
              ? Array.from({ length: t.patrolCols[1] - t.patrolCols[0] + 1 }, (_, d) =>
                  tileKey(t.patrolCols[0] + d, t.row),
                )
              : [tileKey(t.col, t.row)],
          ),
        ]);
        for (const c of l.coins) {
          const k = tileKey(c.col, c.row);
          expect(l.map[c.row]?.[c.col], where).toBe(0);
          expect(route.has(k), `${where}: coin off the route`).toBe(true);
          expect(blocked.has(k), `${where}: coin on key/chest/trap`).toBe(false);
          expect(spawn.has(k), `${where}: coin in spawn zone`).toBe(false);
        }
      }
    }
  });
});

describe('isFair', () => {
  it('rejects a coin on a trap', () => {
    const l = generateLevel(2, 5);
    const t = l.traps.find((x) => x.type !== 'mummy');
    if (!t) throw new Error('level 2 seed 5 has no static trap');
    expect(isFair({ ...l, coins: [{ col: t.col, row: t.row }] })).toEqual({
      fair: false,
      reason: 'coin under a hazard',
    });
  });
});

describe('levelSeed', () => {
  const BASES = [0, 1, 42, 99999, 2 ** 31 - 1, 4294967295];

  it('gives level 0 the base seed itself', () => {
    for (const b of BASES) expect(levelSeed(b, 0)).toBe(b);
  });

  it('is deterministic', () => {
    for (const b of BASES) {
      for (let i = 1; i <= 8; i++) expect(levelSeed(b, i)).toBe(levelSeed(b, i));
    }
  });

  it('returns a uint32', () => {
    for (const b of BASES) {
      for (let i = 1; i <= 8; i++) {
        const s = levelSeed(b, i);
        expect(Number.isInteger(s)).toBe(true);
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThanOrEqual(4294967295);
      }
    }
  });

  it('gives levels 1 and 2 distinct seeds', () => {
    for (const b of BASES) expect(levelSeed(b, 1)).not.toBe(levelSeed(b, 2));
  });

  it('draws the i-th uint32 from mulberry32(base ^ 0x9e3779b9)', () => {
    const rng = mulberry32(42 ^ 0x9e3779b9);
    const draws = [rng(), rng(), rng()].map((x) => x * 4294967296);
    expect([1, 2, 3].map((i) => levelSeed(42, i))).toEqual(draws);
  });
});
