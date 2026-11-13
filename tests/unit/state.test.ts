import { describe, expect, it } from 'vitest';
import { createGameState } from '@game/state';

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
