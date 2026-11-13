/**
 * The HUD's key slots (spec: HUD and overlays → Fly-to). A slot fills when its key's
 * flight lands, and always renders from the simulation's *current* key count, never the
 * count at pickup: a key lost mid-flight leaves its slot empty. `lost()` (on `keyLost`)
 * cancels the flights of keys no longer held, so the HUD can remove their sprites.
 * DOM-free, so it unit-tests in Node.
 */
export interface KeySlots {
  readonly required: number;
  /** A key `index` flight started; returns its id. */
  launch(index: number): number;
  /** Flight `id` arrived. True when its slot is now shown filled (pop it). */
  land(id: number): boolean;
  /** The key count dropped: the ids of cancelled flights. */
  lost(): number[];
  /** Per slot, whether it shows a key. */
  filled(): boolean[];
}

export function createKeySlots(required: number, keys: () => number): KeySlots {
  /** Slots whose flight has landed (or that need none). */
  let landed = 0;
  let nextId = 0;
  const flights = new Map<number, number>(); // id → key index

  const shown = () => Math.min(landed, keys());

  return {
    required,
    launch(index) {
      const id = nextId++;
      flights.set(id, index);
      return id;
    },
    land(id) {
      const index = flights.get(id);
      if (index === undefined) return false;
      flights.delete(id);
      if (index >= keys()) return false;
      landed = Math.max(landed, index + 1);
      return shown() > index;
    },
    lost() {
      const held = keys();
      const cancelled = [...flights].filter(([, index]) => index >= held).map(([id]) => id);
      for (const id of cancelled) flights.delete(id);
      landed = Math.min(landed, held);
      return cancelled;
    },
    filled() {
      const n = shown();
      return Array.from({ length: required }, (_, i) => i < n);
    },
  };
}
