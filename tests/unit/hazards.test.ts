import { describe, expect, it } from 'vitest';
import { generateLevel, tileRng } from '@core/generator';
import {
  FLAME_CYCLE,
  flameClock,
  flamePhase,
  flameState,
  HAZARD_TIMING,
  levelFlames,
} from '@core/hazards';

describe('flame cycle', () => {
  it('ports v2’s flame timing unchanged, plus the blade’s spin', () => {
    expect(HAZARD_TIMING).toEqual({
      telegraph: 500,
      flameOn: 2000,
      flameOff: 2000,
      bladeSpin: 1600,
    });
    expect(FLAME_CYCLE).toBe(4500);
  });

  it('runs telegraph → on → off over one cycle after its phase', () => {
    const phase = 700;
    const at = (ms: number) => flameState(phase + ms, phase);
    expect(at(0)).toBe('telegraph');
    expect(at(499)).toBe('telegraph');
    expect(at(500)).toBe('on');
    expect(at(2499)).toBe('on');
    expect(at(2500)).toBe('off');
    expect(at(4499)).toBe('off');
    expect(at(4500)).toBe('telegraph');
    expect(at(4500 * 7 + 600)).toBe('on');
  });

  it('every flame is off for t < phase', () => {
    for (const phase of [1, 500, 2500, 4499]) {
      for (const t of [0, phase / 2, phase - 0.001]) expect(flameState(t, phase)).toBe('off');
    }
  });

  it('a zero phase starts in the telegraph at t = 0', () => {
    expect(flameState(0, 0)).toBe('telegraph');
  });
});

describe('flame clock (how long a flame has been in its state)', () => {
  it('agrees with flameState and counts ms into the current state', () => {
    const phase = 700;
    const at = (ms: number) => flameClock(phase + ms, phase);
    expect(at(0)).toEqual({ state: 'telegraph', intoMs: 0 });
    expect(at(300).intoMs).toBeCloseTo(300, 6);
    expect(at(500).state).toBe('on');
    expect(at(500).intoMs).toBeCloseTo(0, 6);
    expect(at(2600).state).toBe('off');
    expect(at(2600).intoMs).toBeCloseTo(100, 6);
    expect(at(4500 * 3 + 520).intoMs).toBeCloseTo(20, 6);
    for (let t = 0; t < 12000; t += 37) {
      expect(flameClock(t, phase).state).toBe(flameState(t, phase));
    }
  });

  it('before its phase a flame has been off for at least a whole off window (settled)', () => {
    expect(flameClock(0, 900)).toEqual({ state: 'off', intoMs: HAZARD_TIMING.flameOff });
    expect(flameClock(400, 900).intoMs).toBe(HAZARD_TIMING.flameOff + 400);
  });

  it('a threshold reached by tick arithmetic counts as reached, at intoMs ≥ 0', () => {
    const t = (1000 / 60) * 30; // 500 ms in ticks
    const c = flameClock(t, 0);
    expect(c.state).toBe('on');
    expect(c.intoMs).toBeGreaterThanOrEqual(0);
  });
});

describe('flame phases', () => {
  it('match v2’s derivation: floor(tileRng(seed, col + 1000, row + 1000)() × 4500)', () => {
    const seed = 2067236868;
    expect(flamePhase(seed, { col: 5, row: 1 })).toBe(
      Math.floor(tileRng(seed, 1005, 1001)() * 4500),
    );
    const phase = flamePhase(seed, { col: 13, row: 1 });
    expect(Number.isInteger(phase)).toBe(true);
    expect(phase).toBeGreaterThanOrEqual(0);
    expect(phase).toBeLessThan(4500);
  });

  it('levelFlames lists every flame trap (and only flames) with its seeded phase', () => {
    const seed = 42;
    const level = generateLevel(0, seed);
    const flames = levelFlames(level.traps, seed);
    const traps = level.traps.filter((t) => t.type === 'flame');
    expect(flames.map((f) => f.tile)).toEqual(traps.map((t) => ({ col: t.col, row: t.row })));
    for (const f of flames) expect(f.phase).toBe(flamePhase(seed, f.tile));
    // They ripple: not every flame shares one phase.
    expect(new Set(flames.map((f) => f.phase)).size).toBeGreaterThan(1);
  });
});
