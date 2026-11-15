import { describe, expect, it } from 'vitest';
import { HAZARD_TIMING } from '@core/hazards';
import { flameVisual } from '@render/flame-visual';
import { look } from '@render/look';

const f = look.flame;

describe('flame visual (preset D curves, from the core flame clock)', () => {
  it('ignites on the go-live tick: back-out from 0.3 to 1 over 120 ms', () => {
    expect(flameVisual('on', 0).size).toBeCloseTo(f.igniteFrom, 6);
    expect(flameVisual('on', f.igniteMs).size).toBeCloseTo(1, 6);
    // Back-out overshoots before it settles.
    expect(flameVisual('on', f.igniteMs * 0.6).size).toBeGreaterThan(1);
    expect(flameVisual('on', 1500).size).toBe(1);
    expect(flameVisual('on', 0).alpha).toBe(1);
  });

  it('the column is below 0.25 on every non-lethal frame, collapse included', () => {
    for (let ms = 0; ms <= HAZARD_TIMING.flameOff + 600; ms += 1) {
      expect(flameVisual('off', ms).size).toBeLessThan(0.25);
    }
    for (let ms = 0; ms <= HAZARD_TIMING.telegraph; ms += 1) {
      expect(flameVisual('telegraph', ms).size).toBeLessThan(0.25);
    }
  });

  it('collapses on the off tick: shrinks to 0.2 and fades out over 120 ms', () => {
    const start = flameVisual('off', 0);
    expect(start.alpha).toBe(1);
    expect(start.size).toBeGreaterThan(f.collapseTo);
    const end = flameVisual('off', f.collapseMs);
    expect(end.size).toBeCloseTo(f.collapseTo, 6);
    expect(end.alpha).toBeCloseTo(0, 6);
    expect(flameVisual('off', f.collapseMs / 2).alpha).toBeLessThan(1);
    expect(flameVisual('off', 1000).alpha).toBe(0);
  });

  it('the grate heats sine-in through the telegraph and cools over 250 ms after', () => {
    expect(flameVisual('telegraph', 0).heat).toBe(0);
    const quarter = flameVisual('telegraph', HAZARD_TIMING.telegraph / 4).heat;
    expect(quarter).toBeCloseTo(1 - Math.cos(Math.PI / 8), 6); // sine-in, slow start
    expect(flameVisual('telegraph', HAZARD_TIMING.telegraph).heat).toBeCloseTo(1, 6);
    expect(flameVisual('on', 900).heat).toBe(1);
    expect(flameVisual('off', 0).heat).toBe(1);
    expect(flameVisual('off', f.coolMs / 2).heat).toBeCloseTo(0.5, 6);
    expect(flameVisual('off', f.coolMs).heat).toBe(0);
    expect(flameVisual('off', HAZARD_TIMING.flameOff).heat).toBe(0);
  });

  it('a telegraph shows no column at all', () => {
    expect(flameVisual('telegraph', 300)).toMatchObject({ size: 0, alpha: 0 });
  });
});
