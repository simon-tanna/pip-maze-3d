import { describe, expect, it } from 'vitest';
import type { Dir } from '@core/grid-input';
import { bindKeyboard } from '@game/keyboard';

/** A keyboard-shaped event; Node has `Event` but no `KeyboardEvent`. */
const key = (type: 'keydown' | 'keyup', code: string, repeat = false) =>
  Object.assign(new Event(type, { cancelable: true }), { code, repeat });

function harness() {
  const target = new EventTarget();
  const log: string[] = [];
  const unbind = bindKeyboard(target, {
    press: (d: Dir) => log.push(`press ${d}`),
    release: (d: Dir) => log.push(`release ${d}`),
    clear: () => log.push('clear'),
  });
  return { target, log, unbind };
}

describe('bindKeyboard', () => {
  it('maps arrows and WASD 1:1 to world directions', () => {
    const h = harness();
    for (const code of ['ArrowUp', 'KeyD', 'ArrowDown', 'KeyA'])
      h.target.dispatchEvent(key('keydown', code));
    h.target.dispatchEvent(key('keyup', 'KeyW'));
    expect(h.log).toEqual([
      'press north',
      'press east',
      'press south',
      'press west',
      'release north',
    ]);
  });

  it('ignores auto-repeat keydowns and unmapped keys', () => {
    const h = harness();
    h.target.dispatchEvent(key('keydown', 'ArrowRight', true));
    h.target.dispatchEvent(key('keydown', 'KeyQ'));
    expect(h.log).toEqual([]);
  });

  it('clears on blur', () => {
    const h = harness();
    h.target.dispatchEvent(new Event('blur'));
    expect(h.log).toEqual(['clear']);
  });

  it('stops arrow keys scrolling the page', () => {
    const h = harness();
    const e = key('keydown', 'ArrowDown');
    h.target.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
  });

  it('unbinding removes every listener', () => {
    const h = harness();
    h.unbind();
    h.target.dispatchEvent(key('keydown', 'ArrowUp'));
    h.target.dispatchEvent(new Event('blur'));
    expect(h.log).toEqual([]);
  });
});
