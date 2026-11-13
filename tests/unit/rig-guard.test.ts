import { describe, expect, it } from 'vitest';
import { createRigGuard } from '@render/rig-guard';

describe('rig guard', () => {
  it('passes while every probe stays at its armed baseline', () => {
    let lights = 7;
    const guard = createRigGuard({ lights: () => lights, programs: () => 12 });
    guard.arm();
    guard.check();
    lights = 7;
    guard.check();
    expect(guard.violations).toEqual([]);
    expect(guard.baseline).toEqual({ lights: 7, programs: 12 });
  });

  it('records a violation when a probe drifts, once per change', () => {
    let programs = 12;
    const guard = createRigGuard({ lights: () => 7, programs: () => programs });
    guard.arm();
    programs = 13;
    guard.check();
    guard.check();
    expect(guard.violations).toEqual([{ probe: 'programs', expected: 12, actual: 13 }]);
  });

  it('does nothing until armed', () => {
    let lights = 6;
    const guard = createRigGuard({ lights: () => lights });
    guard.check();
    lights = 7;
    guard.arm();
    guard.check();
    expect(guard.violations).toEqual([]);
  });

  it('reports each violation to the onViolation hook', () => {
    const seen: string[] = [];
    let lights = 7;
    const guard = createRigGuard({ lights: () => lights }, (v) => seen.push(v.probe));
    guard.arm();
    lights = 8;
    guard.check();
    expect(seen).toEqual(['lights']);
  });
});
