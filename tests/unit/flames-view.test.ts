import { describe, expect, it } from 'vitest';
import { BoxGeometry, MeshStandardMaterial, PlaneGeometry, Scene } from 'three';
import type { Mesh, MeshStandardMaterial as Std, Object3D, ShaderMaterial } from 'three';
import type { Gltf } from '@assets/models';
import type { FlameState } from '@core/hazards';
import { HAZARD_TIMING } from '@core/hazards';
import { tileToWorld } from '@core/grid';
import { flameVisual } from '@render/flame-visual';
import { createFlamesView } from '@render/flames';
import type { FlameStateNow } from '@render/flames';
import { createLightRig } from '@render/lights';
import { look } from '@render/look';
import { color } from '@render/palette';

const fakeKit = (): Gltf => {
  const nodes = {
    bed: {
      geometry: new PlaneGeometry(),
      material: new MeshStandardMaterial({ color: color('EMBER_DARK') }),
    },
    grate: { geometry: new BoxGeometry(), material: new MeshStandardMaterial() },
    nozzle: { geometry: new BoxGeometry(), material: new MeshStandardMaterial() },
  };
  return {
    getNode: (name) => {
      const n = nodes[name as keyof typeof nodes];
      if (!n) throw new Error(`no ${name}`);
      return n;
    },
  };
};

const FLAMES = [
  { tile: { col: 2, row: 1 }, phase: 0 },
  { tile: { col: 5, row: 3 }, phase: 900 },
];

const named = (root: Object3D, name: string) => {
  const o = root.getObjectByName(name);
  if (!o) throw new Error(`no ${name}`);
  return o;
};
const part = (root: Object3D, i: number, name: string) =>
  named(named(root, `flame_${i}`), name) as Mesh;

const now = (...s: [FlameState, number][]): FlameStateNow[] =>
  FLAMES.map((f, i) => ({ ...f, state: s[i]?.[0] ?? 'off', intoMs: s[i]?.[1] ?? 5000 }));

const frame = (timeMs: number) => ({ timeMs, hero: { x: 0, z: 0 } });

describe('flames view (preset D)', () => {
  it('stands a grate, nozzle, bed, glow and column on each flame tile', () => {
    const view = createFlamesView(fakeKit());
    view.build(FLAMES);
    const root = named(view.group, 'flame_1');
    expect(root.position.x).toBe(tileToWorld(5, 3).x);
    expect(root.position.z).toBe(tileToWorld(5, 3).z);
    for (const name of ['bed', 'grate', 'nozzle', 'glow', 'column']) {
      expect(part(view.group, 1, name).isMesh, name).toBe(true);
    }
  });

  it('draws the core flame clock: the column follows flameVisual, at look.flame.height', () => {
    const view = createFlamesView(fakeKit());
    view.build(FLAMES);
    for (const [state, into] of [
      ['on', 0],
      ['on', 60],
      ['on', 900],
      ['off', 0],
      ['off', 60],
      ['telegraph', 250],
    ] as [FlameState, number][]) {
      view.update(now([state, into]), frame(1000));
      const want = flameVisual(state, into);
      expect(view.visuals()[0]).toEqual(want);
      const column = part(view.group, 0, 'column');
      expect(column.scale.y).toBeCloseTo(look.flame.height * want.size, 6);
      expect((column.material as ShaderMaterial).uniforms['uAlpha']?.value).toBe(want.alpha);
    }
  });

  it('never hides a quiet flame (so no program compiles mid-play); it draws at strength 0', () => {
    const view = createFlamesView(fakeKit());
    view.build(FLAMES);
    view.update(now(['off', 3000], ['telegraph', 10]), frame(0));
    view.group.traverse((o) => {
      if (!o.name.startsWith('truth_')) expect(o.visible, o.name).toBe(true);
    });
    const column = part(view.group, 0, 'column').material as ShaderMaterial;
    expect(column.uniforms['uAlpha']?.value).toBe(0);
  });

  it('the bed heats EMBER_DARK → FIRE_HOT through the telegraph', () => {
    const view = createFlamesView(fakeKit());
    view.build(FLAMES);
    const bed = () => part(view.group, 0, 'bed').material as Std;
    view.update(now(['telegraph', 0]), frame(0));
    expect(bed().emissiveIntensity).toBe(0);
    view.update(now(['telegraph', HAZARD_TIMING.telegraph]), frame(0));
    expect(bed().emissive.getHex()).toBe(color('FIRE_HOT').getHex());
    expect(bed().emissiveIntensity).toBeCloseTo(look.flame.bedTelegraph, 6);
    // Each flame heats its own bed.
    expect(part(view.group, 1, 'bed').material).not.toBe(bed());
  });

  it('flame i draws with the same materials on every level (pools never dispose)', () => {
    const view = createFlamesView(fakeKit());
    view.build(FLAMES);
    const column = part(view.group, 0, 'column').material;
    const glow = part(view.group, 0, 'glow').material;
    view.teardown();
    view.build(FLAMES.slice(0, 1));
    expect(part(view.group, 0, 'column').material).toBe(column);
    expect(part(view.group, 0, 'glow').material).toBe(glow);
  });

  it('embers rise from the grate through the telegraph, about 36 a second', () => {
    const view = createFlamesView(fakeKit());
    view.build(FLAMES);
    view.update(now(['off', 3000]), frame(0));
    for (let t = 16; t <= 480; t += 16) view.update(now(['telegraph', t]), frame(t));
    const spawned = view.embers();
    expect(spawned).toBeGreaterThanOrEqual(15);
    expect(spawned).toBeLessThanOrEqual(19);
    // None spawn while live or off; the live ones age out.
    for (let t = 496; t <= 2496; t += 16) view.update(now(['on', t - 496]), frame(t));
    expect(view.embers()).toBe(0);
  });

  it('drives the rig’s pool slots: a firing flame’s slot reaches peak; teardown drops it to 0', () => {
    const scene = new Scene();
    const rig = createLightRig(scene);
    const view = createFlamesView(fakeKit(), { pools: rig.pools });
    view.build(FLAMES);
    for (let t = 0; t <= 400; t += 16) view.update(now(['on', 600 + t]), frame(t));
    const { x, z } = tileToWorld(2, 1);
    const slot = rig.pools.find((p) => p.position.x === x && p.position.z === z);
    const peak = look.lights.poolIntensity * look.lights.poolPeakScale;
    expect(slot?.intensity).toBeGreaterThan(peak * (1 - 2 * look.flame.flicker));
    view.teardown();
    for (const p of rig.pools) expect(p.intensity).toBe(0);
  });

  it('teardown drops the level’s flames', () => {
    const view = createFlamesView(fakeKit());
    view.build(FLAMES);
    view.teardown();
    expect(view.group.getObjectByName('flame_0')).toBeUndefined();
    view.build(FLAMES.slice(0, 1));
    expect(view.group.getObjectByName('flame_1')).toBeUndefined();
  });

  it('the ground-truth overlay marks exactly the lethal tiles, only while shown', () => {
    const view = createFlamesView(fakeKit(), { truth: true });
    view.build(FLAMES);
    view.update(now(['on', 10], ['telegraph', 10]), frame(0));
    const shown = () => FLAMES.map((_, i) => named(view.group, `truth_${i}`).visible);
    expect(shown()).toEqual([false, false]); // hidden until toggled
    view.showTruth = true;
    view.update(now(['on', 10], ['telegraph', 10]), frame(0));
    expect(shown()).toEqual([true, false]);
    view.update(now(['off', 10], ['on', 10]), frame(0));
    expect(shown()).toEqual([false, true]);
  });

  it('without the overlay option there are no truth tiles', () => {
    const view = createFlamesView(fakeKit());
    view.build(FLAMES);
    expect(view.group.getObjectByName('truth_0')).toBeUndefined();
  });
});
