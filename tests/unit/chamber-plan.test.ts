import { describe, expect, it } from 'vitest';
import { generateLevel, MAP_COLS, MAP_ROWS, tileRng } from '@core/generator';
import {
  CONTACT_DEPTH,
  FACE_SLOT_VARIANT,
  FACE_VARIANTS,
  PADDING,
  PLAN_CAPACITY,
  planChamber,
  SIDE_STEP,
} from '@core/chamber-plan';
import type { ChamberPiece, Side } from '@core/chamber-plan';
import type { Level } from '@core/generator';
import baseline from '../fixtures/generator-baseline.json';

const SEED = 12345;
// v2's own seed set for property tests (tests/generator-coins.test.mjs).
const SEEDS = Array.from({ length: 60 }, (_, n) => n * 7919 + 1);
const level = generateLevel(0, SEED);
const plan = planChamber(level, SEED);
const at = (piece: string) => plan.filter((p) => p.piece === piece);
const inMap = (col: number, row: number) =>
  row >= 0 && row < level.map.length && col >= 0 && col < (level.map[0]?.length ?? 0);

describe('planChamber', () => {
  it('gives the same plan for the same seed', () => {
    expect(planChamber(generateLevel(0, SEED), SEED)).toEqual(plan);
    expect(planChamber(level, SEED + 1)).not.toEqual(plan);
  });

  it('caps every wall tile once', () => {
    const caps = at('cap').filter((p) => inMap(p.col, p.row));
    const walls = level.map.flatMap((cells, row) =>
      cells.flatMap((v, col) => (v === 1 ? [`${col},${row}`] : [])),
    );
    expect(caps.map((p) => `${p.col},${p.row}`).sort()).toEqual(walls.sort());
  });

  it('faces a wall tile only towards its open neighbours, rotated to look at them', () => {
    const open = (c: number, r: number) => inMap(c, r) && level.map[r]?.[c] !== 1;
    const faces = at('face');
    level.map.forEach((cells, row) =>
      cells.forEach((v, col) => {
        const sides = faces
          .filter((f) => f.col === col && f.row === row)
          .map((f) => f.side)
          .sort();
        const expected =
          v === 1
            ? (Object.entries(SIDE_STEP) as [Side, [number, number]][])
                .filter(([, [dc, dr]]) => open(col + dc, row + dr))
                .map(([s]) => s)
                .sort()
            : [];
        expect(sides, `${col},${row}`).toEqual(expected);
      }),
    );
    expect(faces.length).toBeGreaterThan(0);
    for (const f of faces) {
      // Rotation turns the piece's local +z (south) towards its side.
      const [dc, dr] = SIDE_STEP[f.side as Side];
      expect(Math.sin(f.rotation)).toBeCloseTo(dc);
      expect(Math.cos(f.rotation)).toBeCloseTo(dr);
    }
  });

  it('lays one flagstone per floor, start and chest tile, picked as v2 picks it', () => {
    const floors = at('floor');
    const open = level.map.flatMap((cells, row) =>
      cells.flatMap((v, col) => (v === 1 ? [] : [`${col},${row}`])),
    );
    expect(floors.map((p) => `${p.col},${p.row}`).sort()).toEqual(open.sort());
    for (const f of floors) {
      const v = tileRng(SEED, f.col, f.row)();
      expect(f.variant).toBe(v < 0.4 ? 0 : v < 0.6 ? 1 : v < 0.75 ? 2 : v < 0.9 ? 3 : 4);
    }
  });

  it('weights flagstone variants 40/20/15/15/10 over many chambers', () => {
    const counts = [0, 0, 0, 0, 0];
    for (const seed of SEEDS) {
      for (const f of planChamber(generateLevel(0, seed), seed)) {
        if (f.piece === 'floor') counts[f.variant] = (counts[f.variant] ?? 0) + 1;
      }
    }
    const total = counts.reduce((a, b) => a + b, 0);
    [0.4, 0.2, 0.15, 0.15, 0.1].forEach((w, i) => {
      expect((counts[i] ?? 0) / total).toBeCloseTo(w, 1);
    });
  });

  it('rings the map with padding caps (9 E/W, 5 N, 4 S) that never overlap it', () => {
    expect(PADDING).toEqual({ east: 9, west: 9, north: 5, south: 4 });
    const cols = level.map[0]?.length ?? 0;
    const rows = level.map.length;
    const padding = plan.filter((p) => p.padding);
    expect(padding.every((p) => p.piece === 'cap')).toBe(true);
    expect(padding.some((p) => inMap(p.col, p.row))).toBe(false);
    expect(plan.filter((p) => !p.padding).every((p) => inMap(p.col, p.row))).toBe(true);
    const ring = new Set(padding.map((p) => `${p.col},${p.row}`));
    expect(ring.size).toBe(padding.length);
    expect(ring.size).toBe((cols + 18) * (rows + 9) - cols * rows);
    for (const [c, r] of [
      [-9, -5],
      [cols + 8, rows + 3],
      [-1, 0],
      [cols, rows - 1],
    ] as const) {
      expect(ring.has(`${c},${r}`), `${c},${r}`).toBe(true);
    }
  });

  it('runs a contact strip along every wall–floor edge, wider on the north and west', () => {
    const open = (c: number, r: number) => inMap(c, r) && level.map[r]?.[c] !== 1;
    const strips = at('contact');
    const expected: string[] = [];
    level.map.forEach((cells, row) =>
      cells.forEach((v, col) => {
        if (v === 1) return;
        for (const [side, [dc, dr]] of Object.entries(SIDE_STEP)) {
          if (!open(col + dc, row + dr)) expected.push(`${col},${row},${side}`);
        }
      }),
    );
    expect(strips.map((p) => `${p.col},${p.row},${p.side}`).sort()).toEqual(expected.sort());
    for (const p of strips) {
      // The strip sits on the floor tile; local +z points at the wall.
      const [dc, dr] = SIDE_STEP[p.side as Side];
      expect(Math.sin(p.rotation)).toBeCloseTo(dc);
      expect(Math.cos(p.rotation)).toBeCloseTo(dr);
      const wide = p.side === 'n' || p.side === 'w';
      expect(p.depth).toBe(wide ? CONTACT_DEPTH.wide : CONTACT_DEPTH.narrow);
    }
    expect(CONTACT_DEPTH.wide).toBeGreaterThan(CONTACT_DEPTH.narrow);
  });

  it('slots the wall faces north and south of each blade, and only those', () => {
    const blades = level.traps.filter((t) => t.type === 'blade');
    expect(blades.length).toBeGreaterThan(0);
    const slots = at('face').filter((f) => f.variant === FACE_SLOT_VARIANT);
    const expected = blades.flatMap((b) => [`${b.col},${b.row - 1},s`, `${b.col},${b.row + 1},n`]);
    expect(slots.map((f) => `${f.col},${f.row},${f.side}`).sort()).toEqual(expected.sort());
    // Every other face keeps the variant it had without blades.
    const bare = planChamber({ ...level, traps: [] }, SEED);
    expect(bare.some((f) => f.piece === 'face' && f.variant === FACE_SLOT_VARIANT)).toBe(false);
    const other = (p: typeof plan) =>
      p.filter((f) => !(f.piece === 'face' && f.variant === FACE_SLOT_VARIANT));
    const slotted = new Set(expected);
    expect(other(plan)).toEqual(
      bare.filter((f) => !(f.piece === 'face' && slotted.has(`${f.col},${f.row},${f.side}`))),
    );
    expect(FACE_SLOT_VARIANT).toBe(FACE_VARIANTS);
  });

  it('generated maps are the generator’s MAP_COLS × MAP_ROWS', () => {
    for (const b of baseline) {
      const { map } = generateLevel(b.i, b.seed);
      expect(map).toHaveLength(MAP_ROWS);
      for (const row of map) expect(row).toHaveLength(MAP_COLS);
    }
  });

  it('never exceeds PLAN_CAPACITY, on the baseline seeds or on worst-case full-size maps', () => {
    const synthetic = (wall: (c: number, r: number) => boolean): Level => ({
      ...level,
      map: Array.from({ length: MAP_ROWS }, (_, r) =>
        Array.from({ length: MAP_COLS }, (_, c) => (wall(c, r) ? 1 : 0)),
      ),
    });
    const levels = [
      ...baseline.map((b) => generateLevel(b.i, b.seed)),
      synthetic(() => true),
      synthetic(() => false),
      synthetic((c, r) => (c + r) % 2 === 0),
      synthetic((c, r) => (c + r) % 2 === 1),
    ];
    const peak: Record<string, number> = {};
    for (const [i, l] of levels.entries()) {
      const counts: Record<string, number> = {};
      for (const p of planChamber(l, i)) counts[p.piece] = (counts[p.piece] ?? 0) + 1;
      for (const [piece, n] of Object.entries(counts)) {
        expect(n, piece).toBeLessThanOrEqual(PLAN_CAPACITY[piece as ChamberPiece]);
        peak[piece] = Math.max(peak[piece] ?? 0, n);
      }
    }
    // All-wall and the checkerboards reach the bound, so it is not slack.
    for (const piece of ['cap', 'face', 'floor'] as const) {
      expect(peak[piece], piece).toBe(PLAN_CAPACITY[piece]);
    }
  });
});
