import { describe, expect, it } from 'vitest';
import { BODY_CAPSULE, bladeAngle, bladeTouches, levelBlades } from '@core/blade';
import { generateLevel, tileRng } from '@core/generator';
import type { Trap } from '@core/generator';
import { HAZARD_TIMING } from '@core/hazards';
import baseline from '../fixtures/generator-baseline.json';

const blade = (col: number, row: number): Trap => ({ type: 'blade', col, row });

/** Angles (deg, 0.01° steps over one turn) at which `touches` holds. */
function lethalAngles(touches: (deg: number) => boolean): number[] {
  const out: number[] = [];
  for (let i = -18000; i < 18000; i++) if (touches(i / 100)) out.push(i / 100);
  return out;
}

/** ms lethal per turn for a body at offset (u, n) from the blade's floor point. */
const lethalMs = (u: number, n: number, capsule = BODY_CAPSULE) =>
  (lethalAngles((deg) => bladeTouches(deg, u, n, capsule)).length / 36000) *
  HAZARD_TIMING.bladeSpin;

describe('blade contact', () => {
  it('spins once every 1.6 s', () => {
    expect(HAZARD_TIMING.bladeSpin).toBe(1600);
  });

  it('is lethal about 249 ms per turn at the tile centre, while |θ| < 28°', () => {
    expect(lethalMs(0, 0)).toBeGreaterThan(244);
    expect(lethalMs(0, 0)).toBeLessThan(254);
    const angles = lethalAngles((deg) => bladeTouches(deg, 0, 0));
    expect(Math.min(...angles)).toBeCloseTo(-28, 0);
    expect(Math.max(...angles)).toBeCloseTo(28, 0);
    expect(bladeTouches(0, 0, 0)).toBe(true);
    expect(bladeTouches(180, 0, 0)).toBe(false); // overhead: walk under it
    expect(bladeTouches(-90, 0, 0)).toBe(false);
  });

  it('takes the body capsule as a parameter: radius is the difficulty dial, height isn’t', () => {
    expect(BODY_CAPSULE).toEqual({ radius: 0.4, height: 1.5 });
    for (const [radius, ms] of [
      [0.3, 224],
      [0.35, 236],
      [0.45, 263],
    ] as const) {
      expect(lethalMs(0, 0, { radius, height: 1.5 }), `r ${radius}`).toBeCloseTo(ms, -1);
      expect(Math.abs(lethalMs(0, 0, { radius, height: 1.5 }) - ms), `r ${radius}`).toBeLessThan(5);
    }
    expect(lethalMs(0, 0, { radius: 0.4, height: 1.7 })).toBeCloseTo(lethalMs(0, 0), 5);
  });

  it('clips a hero mid-step 0.44 m off the plane within about ±19°, and none past 0.45 m', () => {
    const angles = lethalAngles((deg) => bladeTouches(deg, 0, 0.44));
    expect(angles.length).toBeGreaterThan(0);
    expect(Math.abs(Math.min(...angles) + 19)).toBeLessThan(1.5);
    expect(Math.abs(Math.max(...angles) - 19)).toBeLessThan(1.5);
    expect(lethalAngles((deg) => bladeTouches(deg, 0, -0.44))).toEqual(angles);
    expect(lethalAngles((deg) => bladeTouches(deg, 0, 0.45))).toEqual([]);
  });
});

/** The derivation the ticket names: tileRng(seed, col + 1000, row + 1000) over one turn. */
const seededPhase = (seed: number, t: { col: number; row: number }) =>
  Math.floor(tileRng(seed, t.col + 1000, t.row + 1000)() * HAZARD_TIMING.bladeSpin);

describe('blade phase', () => {
  const SEED = 9001;
  const rngPhase = (col: number, row: number) => seededPhase(SEED, { col, row });

  it('turns once per bladeSpin at constant speed, starting at its phase', () => {
    expect(bladeAngle(0, 0)).toBe(0);
    expect(bladeAngle(400, 0)).toBeCloseTo(90);
    expect(bladeAngle(800, 0)).toBe(-180);
    expect(bladeAngle(1200, 0)).toBeCloseTo(-90);
    expect(bladeAngle(1600 * 5 + 100, 0)).toBeCloseTo(22.5);
    expect(bladeAngle(0, 400)).toBeCloseTo(90);
    expect(bladeAngle(100, 400)).toBeCloseTo(bladeAngle(500, 0));
    for (let t = 0; t < 4000; t += 37) {
      const a = bladeAngle(t, 123);
      expect(a).toBeGreaterThanOrEqual(-180);
      expect(a).toBeLessThan(180);
    }
  });

  it('seeds each blade’s phase from tileRng(seed, col + 1000, row + 1000), in trap order', () => {
    const traps: Trap[] = [blade(4, 3), { type: 'flame', col: 5, row: 1 }, blade(9, 7)];
    expect(levelBlades(traps, SEED)).toEqual([
      { tile: { col: 4, row: 3 }, phase: rngPhase(4, 3) },
      { tile: { col: 9, row: 7 }, phase: rngPhase(9, 7) },
    ]);
    for (const b of levelBlades(traps, SEED)) {
      expect(b.phase).toBeGreaterThanOrEqual(0);
      expect(b.phase).toBeLessThan(HAZARD_TIMING.bladeSpin);
    }
    expect(levelBlades(traps, SEED + 1)).not.toEqual(levelBlades(traps, SEED));
  });

  it('locks a shared-wall pair to the northern blade’s phase', () => {
    expect(rngPhase(6, 5)).not.toBe(rngPhase(6, 3));
    const [south, north] = levelBlades([blade(6, 5), blade(6, 3)], SEED);
    expect(south?.tile).toEqual({ col: 6, row: 5 });
    expect(south?.phase).toBe(rngPhase(6, 3));
    expect(north?.phase).toBe(rngPhase(6, 3));
  });

  it('locks a three-blade chain to its northernmost blade, but not unchained blades', () => {
    const traps = [blade(10, 7), blade(10, 3), blade(10, 5), blade(10, 11), blade(12, 5)];
    const phases = levelBlades(traps, SEED).map((b) => b.phase);
    expect(new Set([rngPhase(10, 7), rngPhase(10, 5), rngPhase(10, 3)]).size).toBe(3);
    expect(phases.slice(0, 3)).toEqual([rngPhase(10, 3), rngPhase(10, 3), rngPhase(10, 3)]);
    expect(phases[3]).toBe(rngPhase(10, 11)); // 4 rows below the chain: no shared wall
    expect(phases[4]).toBe(rngPhase(12, 5));
  });

  it('finds no shared-wall chain in the 72 baseline levels, so every phase is its own', () => {
    let blades = 0;
    for (const b of baseline) {
      const level = generateLevel(b.i, b.seed);
      const own = level.traps.filter((t) => t.type === 'blade');
      blades += own.length;
      expect(levelBlades(level.traps, b.seed).map((x) => x.phase)).toEqual(
        own.map((t) => seededPhase(b.seed, t)),
      );
    }
    expect(blades).toBe(163);
  });
});
