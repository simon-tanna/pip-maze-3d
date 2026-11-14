import { describe, expect, it } from 'vitest';
import { createGameState } from '@game/state';
import type { MachineState } from '@game/state';

describe('game state machine', () => {
  it('starts loading and walks loading → building → entering → playing', () => {
    const machine = createGameState();
    const seen: string[] = [];
    machine.onChange((to, from) => seen.push(`${from}→${to}`));
    expect(machine.state).toBe('loading');
    machine.go('building');
    machine.go('entering');
    machine.go('playing');
    expect(machine.state).toBe('playing');
    expect(seen).toEqual(['loading→building', 'building→entering', 'entering→playing']);
  });

  it('refuses a transition the machine does not have', () => {
    const machine = createGameState();
    expect(() => machine.go('playing')).toThrow(/loading → playing/);
    expect(machine.state).toBe('loading');
  });
});

describe('the full machine', () => {
  const PATH = ['building', 'entering', 'playing', 'leaving', 'ended'] as const;
  const walk = (...states: MachineState[]) => {
    const machine = createGameState();
    for (const s of states) machine.go(s);
    return machine;
  };

  it('loops playing → leaving → building, and leaving → ended → building', () => {
    const m = walk('building', 'entering', 'playing', 'leaving', 'building', 'entering');
    m.go('playing');
    m.go('leaving');
    m.go('ended');
    m.go('building');
    expect(m.state).toBe('building');
  });

  it('refuses playing → ended and ended → playing', () => {
    expect(() => walk('building', 'entering', 'playing', 'ended')).toThrow();
    expect(() => walk(...PATH, 'playing')).toThrow();
  });

  it.each(['loading', ...PATH] as const)('reaches failed from %s; failed is terminal', (from) => {
    const m = walk(...PATH.slice(0, PATH.indexOf(from as (typeof PATH)[number]) + 1));
    expect(m.state).toBe(from);
    m.go('failed');
    expect(m.state).toBe('failed');
    expect(() => m.go('building')).toThrow();
  });
});
