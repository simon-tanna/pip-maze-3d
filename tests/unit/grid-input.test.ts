import { describe, expect, it } from 'vitest';
import { BUFFER_MS, createGridInput } from '@core/grid-input';
import type { Dir } from '@core/grid-input';

/** A fake world: `open` directions succeed (unless busy mid-step); every attempt is logged. */
function harness(open: Dir[] = ['north', 'east', 'south', 'west']) {
  let now = 0;
  let busy = false;
  const moves: Dir[] = [];
  const world = { open: new Set(open) };
  const input = createGridInput({
    now: () => now,
    move(dir) {
      if (busy || !world.open.has(dir)) return false;
      moves.push(dir);
      return true;
    },
  });
  return {
    input,
    moves,
    world,
    at(ms: number) {
      now = ms;
    },
    setBusy(b: boolean) {
      busy = b;
    },
  };
}

describe('grid input', () => {
  it('a press moves at once; holding moves again on every update', () => {
    const h = harness();
    h.input.press('east');
    expect(h.moves).toEqual(['east']);
    h.input.update();
    expect(h.moves).toEqual(['east', 'east']);
    h.input.release('east');
    h.input.update();
    expect(h.moves).toEqual(['east', 'east']);
  });

  it('newest held wins, and the older one is the fallback when it is blocked', () => {
    const h = harness();
    h.input.press('east');
    h.input.press('north');
    h.moves.length = 0;
    h.input.update();
    expect(h.moves).toEqual(['north']);

    h.world.open.delete('north');
    h.input.update();
    expect(h.moves).toEqual(['north', 'east']); // slides along the wall
  });

  it('a press mid-step is buffered and fires on the next update within 180 ms of sim time', () => {
    const h = harness();
    h.setBusy(true);
    h.at(1000);
    h.input.press('south');
    h.input.release('south'); // a tap
    expect(h.moves).toEqual([]);

    h.setBusy(false);
    h.at(1000 + BUFFER_MS);
    h.input.update();
    expect(h.moves).toEqual(['south']);
    h.input.update();
    expect(h.moves).toEqual(['south']); // consumed
  });

  it('a buffered press older than 180 ms of sim time expires', () => {
    const h = harness();
    h.setBusy(true);
    h.at(0);
    h.input.press('south');
    h.input.release('south');
    h.setBusy(false);
    h.at(BUFFER_MS + 1);
    h.input.update();
    expect(h.moves).toEqual([]);
  });

  it('corner assist: a buffered turn into a wall stays queued until the junction opens', () => {
    const h = harness(['east']);
    h.input.press('east'); // walking east
    h.at(50);
    h.input.press('north'); // a tile early: north is a wall here
    h.input.release('north');
    expect(h.moves).toEqual(['east', 'east']); // north blocked, held east carries on

    h.world.open.add('north'); // landed at the junction
    h.at(150);
    h.input.update();
    expect(h.moves.at(-1)).toBe('north');
  });

  it('clear() drops held and buffered directions', () => {
    const h = harness();
    h.setBusy(true);
    h.input.press('west');
    h.input.clear();
    h.setBusy(false);
    h.input.update();
    expect(h.moves).toEqual([]);
  });
});
