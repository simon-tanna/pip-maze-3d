import { describe, expect, it } from 'vitest';
import type { Dir } from '@core/grid-input';
import { bindKeyboard, bindRestart } from '@game/keyboard';

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

describe('bindRestart', () => {
  function restartHarness(state: { ended: boolean }) {
    const target = new EventTarget();
    const log: string[] = [];
    bindRestart(target, {
      ended: () => state.ended,
      restart: () => {
        log.push('restart');
        return true;
      },
    });
    bindKeyboard(target, {
      press: (d: Dir) => log.push(`press ${d}`),
      release: () => {},
      clear: () => {},
    });
    return { target, log };
  }

  it('restarts on a fresh key press while ended and consumes the key', () => {
    const h = restartHarness({ ended: true });
    const e = key('keydown', 'ArrowUp');
    h.target.dispatchEvent(e);
    expect(h.log).toEqual(['restart']);
    expect(e.defaultPrevented).toBe(true);
  });

  it('is persistent: every fresh press while ended restarts', () => {
    const h = restartHarness({ ended: true });
    h.target.dispatchEvent(key('keydown', 'Space'));
    h.target.dispatchEvent(key('keydown', 'KeyQ'));
    expect(h.log).toEqual(['restart', 'restart']);
  });

  it('ignores repeats (a held arrow from the last step)', () => {
    const h = restartHarness({ ended: true });
    h.target.dispatchEvent(key('keydown', 'ArrowUp', true));
    expect(h.log).toEqual([]);
  });

  it('does nothing outside ended: the key reaches grid input', () => {
    const h = restartHarness({ ended: false });
    h.target.dispatchEvent(key('keydown', 'ArrowUp'));
    expect(h.log).toEqual(['press north']);
  });
});
