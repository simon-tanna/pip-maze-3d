import { describe, expect, it } from 'vitest';
import type { Object3D } from 'three';
import { tileToWorld } from '@core/grid';
import { look } from '@render/look';
import { createPickupsView } from '@render/pickups';

const LAYOUT = {
  coins: [
    { col: 2, row: 1 },
    { col: 3, row: 1 },
  ],
  key: { col: 4, row: 1 },
  key2: { col: 6, row: 1 },
  exitCol: 9,
  exitRow: 1,
};

const named = (root: Object3D, name: string) => {
  const o = root.getObjectByName(name);
  if (!o) throw new Error(`no ${name}`);
  return o;
};

describe('pickups view (greybox)', () => {
  it('places coins and keys floating over their tiles and the chest on the floor', () => {
    const view = createPickupsView();
    view.build(LAYOUT);
    const coin = named(view.group, 'coin_1');
    expect(coin.position.x).toBe(tileToWorld(3, 1).x);
    expect(coin.position.y).toBeGreaterThanOrEqual(look.pickups.floatHeight);
    expect(named(view.group, 'key_0').position.z).toBe(tileToWorld(4, 1).z);
    expect(named(view.group, 'chest').position.x).toBe(tileToWorld(9, 1).x);
  });

  it('shows what the simulation says stands in the level', () => {
    const view = createPickupsView();
    view.build(LAYOUT);
    view.update({ coinVisible: (i) => i !== 0, keyVisible: (i) => i === 1 });
    expect(named(view.group, 'coin_0').visible).toBe(false);
    expect(named(view.group, 'coin_1').visible).toBe(true);
    expect(named(view.group, 'key_0').visible).toBe(false);
    expect(named(view.group, 'key_1').visible).toBe(true);
  });

  it('a level without key 2 builds one key', () => {
    const view = createPickupsView();
    view.build({ ...LAYOUT, key2: null });
    expect(view.group.getObjectByName('key_1')).toBeUndefined();
  });

  it('rebuilding drops the previous level’s pickups', () => {
    const view = createPickupsView();
    view.build(LAYOUT);
    view.build({ ...LAYOUT, coins: [{ col: 5, row: 1 }] });
    expect(view.group.getObjectByName('coin_1')).toBeUndefined();
    expect(named(view.group, 'coin_0').position.x).toBe(tileToWorld(5, 1).x);
  });
});
