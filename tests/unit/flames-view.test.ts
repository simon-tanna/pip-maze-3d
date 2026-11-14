import { describe, expect, it } from 'vitest';
import type { Mesh, Object3D } from 'three';
import type { FlameState } from '@core/hazards';
import { tileToWorld } from '@core/grid';
import { createFlamesView } from '@render/flames';

const FLAMES = [
  { tile: { col: 2, row: 1 }, phase: 0 },
  { tile: { col: 5, row: 3 }, phase: 900 },
];

const named = (root: Object3D, name: string) => {
  const o = root.getObjectByName(name);
  if (!o) throw new Error(`no ${name}`);
  return o as Mesh;
};

const states = (...s: FlameState[]) => FLAMES.map((f, i) => ({ ...f, state: s[i] ?? 'off' }));

describe('flames view (greybox)', () => {
  it('stands a column on each flame tile', () => {
    const view = createFlamesView();
    view.build(FLAMES);
    const col = named(view.group, 'flame_1');
    expect(col.position.x).toBe(tileToWorld(5, 3).x);
    expect(col.position.z).toBe(tileToWorld(5, 3).z);
  });

  it('colours each column by its state, from shared materials', () => {
    const view = createFlamesView();
    view.build(FLAMES);
    view.update(states('off', 'telegraph'));
    const a = named(view.group, 'flame_0');
    const b = named(view.group, 'flame_1');
    expect(a.material).not.toBe(b.material);
    view.update(states('on', 'on'));
    expect(a.material).toBe(b.material);
    const on = a.material;
    view.update(states('off', 'off'));
    expect(a.material).not.toBe(on);
    // Another level's view reuses the same materials: none is per level.
    const other = createFlamesView();
    other.build(FLAMES);
    other.update(states('on'));
    expect(named(other.group, 'flame_0').material).toBe(on);
  });

  it('teardown drops the level’s columns', () => {
    const view = createFlamesView();
    view.build(FLAMES);
    view.teardown();
    expect(view.group.children).toHaveLength(0);
    view.build(FLAMES.slice(0, 1));
    expect(view.group.getObjectByName('flame_1')).toBeUndefined();
  });

  it('the ground-truth overlay marks exactly the lethal tiles, only while shown', () => {
    const view = createFlamesView({ truth: true });
    view.build(FLAMES);
    view.update(states('on', 'telegraph'));
    const shown = () => FLAMES.map((_, i) => named(view.group, `truth_${i}`).visible);
    expect(shown()).toEqual([false, false]); // hidden until toggled
    view.showTruth = true;
    view.update(states('on', 'telegraph'));
    expect(shown()).toEqual([true, false]);
    view.update(states('off', 'on'));
    expect(shown()).toEqual([false, true]);
  });

  it('without the overlay option there are no truth tiles', () => {
    const view = createFlamesView();
    view.build(FLAMES);
    expect(view.group.getObjectByName('truth_0')).toBeUndefined();
  });
});
