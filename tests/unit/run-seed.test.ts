import { describe, expect, it } from 'vitest';
import { levelSeed } from '@core/generator';
import { resolveRun, seedForLevel } from '@core/run-seed';

const draw = () => 777;
const run = (query: string) => resolveRun(new URLSearchParams(query), draw);

describe('resolveRun', () => {
  it('pins ?seed=S&level=i: level i is generated with S itself', () => {
    const r = run('seed=4242&level=1');
    expect(r).toMatchObject({ base: 4242, level: 1, seed: 4242, pinned: true, warnings: [] });
    expect(seedForLevel(r, 1)).toBe(4242);
    expect(seedForLevel(r, 0)).toBe(4242);
  });

  it('gives later levels levelSeed(S, j)', () => {
    const r = run('seed=4242&level=0');
    expect(seedForLevel(r, 1)).toBe(levelSeed(4242, 1));
  });

  it('defaults the pinned level to 0', () => {
    expect(run('seed=9')).toMatchObject({ level: 0, seed: 9, pinned: true, warnings: [] });
  });

  it('draws a base seed without params, and it is level 0’s seed', () => {
    const r = run('');
    expect(r).toMatchObject({ base: 777, level: 0, seed: 777, pinned: false, warnings: [] });
    expect(seedForLevel(r, 1)).toBe(levelSeed(777, 1));
  });

  it('starts an unpinned run at ?level=i alone, on levelSeed(base, i)', () => {
    const r = run('level=1');
    expect(r).toMatchObject({ base: 777, level: 1, pinned: false, warnings: [] });
    expect(r.seed).toBe(levelSeed(777, 1));
  });

  it('accepts the full uint32 range', () => {
    expect(run('seed=0').seed).toBe(0);
    expect(run('seed=4294967295').seed).toBe(4294967295);
  });

  it.each([
    'level=5',
    'seed=abc',
    'seed=-1',
    'seed=4294967296',
    'seed=1.5',
    'seed=0x10',
    'seed=',
    'seed=12&level=2',
    'seed=12&level=one',
  ])('warns on %s and falls back to an unpinned level 0', (query) => {
    const r = run(query);
    expect(r).toMatchObject({ base: 777, level: 0, seed: 777, pinned: false });
    expect(r.warnings).toHaveLength(1);
  });
});
