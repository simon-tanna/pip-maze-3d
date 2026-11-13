import { describe, expect, it } from 'vitest';
import { createKeySlots } from '@ui/key-slots';

function slots(required: 1 | 2) {
  let keys = 0;
  const model = createKeySlots(required, () => keys);
  return {
    model,
    set: (n: number) => {
      keys = n;
    },
  };
}

describe('key slots', () => {
  it('fill when the key’s flight lands, not at pickup', () => {
    const { model, set } = slots(1);
    set(1);
    const flight = model.launch(0);
    expect(model.filled()).toEqual([false]);
    expect(model.land(flight)).toBe(true);
    expect(model.filled()).toEqual([true]);
  });

  it('a key flight that lands after the key count dropped leaves the slot empty', () => {
    const { model, set } = slots(1);
    set(1);
    const flight = model.launch(0);
    set(0); // the key was lost mid-flight (no keyLost delivered yet)
    expect(model.land(flight)).toBe(false);
    expect(model.filled()).toEqual([false]);
  });

  it('keyLost cancels in-flight sprites for keys no longer held', () => {
    const { model, set } = slots(2);
    set(1);
    const first = model.launch(0);
    model.land(first);
    set(2);
    const second = model.launch(1);
    set(1);
    expect(model.lost()).toEqual([second]);
    expect(model.land(second)).toBe(false);
    expect(model.filled()).toEqual([true, false]);
  });

  it('keyLost empties a filled slot from the current count', () => {
    const { model, set } = slots(2);
    set(1);
    model.land(model.launch(0));
    set(0);
    expect(model.lost()).toEqual([]);
    expect(model.filled()).toEqual([false, false]);
  });
});
