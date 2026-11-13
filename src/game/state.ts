/**
 * The game's state machine (spec: State machine). Ticket 04's minimal slice:
 * `loading → building → entering → playing`, with `main.ts` taking each transition
 * instantly. Ticket 06 adds `leaving`, `ended`, `failed` and the timed transitions.
 *
 * Layering: `src/game` imports nothing from `render` or `ui`.
 */

export type MachineState = 'loading' | 'building' | 'entering' | 'playing';

const NEXT: Readonly<Record<MachineState, readonly MachineState[]>> = {
  loading: ['building'],
  building: ['entering'],
  entering: ['playing'],
  playing: [],
};

export interface GameState {
  readonly state: MachineState;
  /** Take a transition; throws on one the machine doesn't have. */
  go(next: MachineState): void;
  onChange(listener: (to: MachineState, from: MachineState) => void): void;
}

export function createGameState(): GameState {
  let state: MachineState = 'loading';
  const listeners: ((to: MachineState, from: MachineState) => void)[] = [];
  return {
    get state() {
      return state;
    },
    go(next) {
      if (!NEXT[state].includes(next)) throw new Error(`no transition ${state} → ${next}`);
      const from = state;
      state = next;
      for (const l of listeners) l(next, from);
    },
    onChange(listener) {
      listeners.push(listener);
    },
  };
}
