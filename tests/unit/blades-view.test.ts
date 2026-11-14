import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import type { Mesh, Object3D } from 'three';
import { BLADE_SHAPE, bladeSegments, HEAD_RING } from '@core/blade';
import { tileToWorld } from '@core/grid';
import { createBladesView } from '@render/blades';
import { createBladeZone } from '@render/blade-zone';

const BLADES = [
  { tile: { col: 4, row: 3 }, phase: 0 },
  { tile: { col: 9, row: 7 }, phase: 300 },
];

const named = (root: Object3D, name: string) => {
  const o = root.getObjectByName(name);
  if (!o) throw new Error(`no ${name}`);
  return o as Mesh;
};

/** A swing-plane point (u, y) of the blade on `tile`, in world space. */
const planeToWorld = (tile: { col: number; row: number }, [u, y]: readonly [number, number]) => {
  const { x, z } = tileToWorld(tile.col, tile.row);
  return new Vector3(x, y, z + u);
};

describe('blades view (greybox)', () => {
  it('draws each head where the contact rule puts it, at every angle', () => {
    const view = createBladesView();
    view.build(BLADES);
    for (const angle of [0, 27, -90, 135, -180]) {
      view.update(BLADES.map((b) => ({ ...b, angle })));
      view.group.updateMatrixWorld(true);
      BLADES.forEach((b, i) => {
        const head = named(view.group, `blade_${i}`).getObjectByName('head') as Mesh;
        // The head mesh is head-local: its ring point 0 sits at the outline's first point.
        const [x, y] = HEAD_RING[0] ?? [0, 0];
        const got = new Vector3(x, y, 0).applyMatrix4(head.matrixWorld);
        const want = planeToWorld(b.tile, bladeSegments(angle)[0]?.[0] ?? [0, 0]);
        expect(got.distanceTo(want), `blade ${i} at ${angle}°`).toBeLessThan(1e-6);
      });
    }
  });

  it('spins about an axle at the pivot height, under two lintels', () => {
    const view = createBladesView();
    view.build(BLADES);
    view.group.updateMatrixWorld(true);
    const blade = named(view.group, 'blade_1');
    const lintels = blade.children.flatMap((c) => c.children).filter((c) => c.name === 'lintel');
    expect(lintels).toHaveLength(2);
    for (const l of lintels) {
      expect(l.getWorldPosition(new Vector3()).y).toBeCloseTo(BLADE_SHAPE.pivotHeight);
    }
  });

  it('shares materials and geometry across levels; teardown drops the level’s blades', () => {
    const view = createBladesView();
    view.build(BLADES);
    const head = named(view.group, 'blade_0').getObjectByName('head') as Mesh;
    const other = createBladesView();
    other.build(BLADES.slice(1));
    const head2 = named(other.group, 'blade_0').getObjectByName('head') as Mesh;
    expect(head2.material).toBe(head.material);
    expect(head2.geometry).toBe(head.geometry);
    view.teardown();
    expect(view.group.children).toHaveLength(0);
  });
});

describe('blade contact-zone overlay (dev)', () => {
  it('draws exactly the segments the contact test uses, at the current angle', () => {
    const zone = createBladeZone();
    zone.build(BLADES);
    zone.show = true;
    const angle = 17;
    zone.update(BLADES.map((b) => ({ ...b, angle })));
    zone.group.updateMatrixWorld(true);
    BLADES.forEach((b, i) => {
      const bars = named(zone.group, `zone_${i}`).children as Mesh[];
      const segs = bladeSegments(angle);
      expect(bars).toHaveLength(segs.length);
      segs.forEach(([p, q], k) => {
        const bar = bars[k] as Mesh;
        expect(bar.visible).toBe(true);
        // Each bar runs along local x from −½ to +½: its ends are the segment's ends.
        const a = new Vector3(-0.5, 0, 0).applyMatrix4(bar.matrixWorld);
        const c = new Vector3(0.5, 0, 0).applyMatrix4(bar.matrixWorld);
        expect(a.distanceTo(planeToWorld(b.tile, p))).toBeLessThan(1e-6);
        expect(c.distanceTo(planeToWorld(b.tile, q))).toBeLessThan(1e-6);
      });
    });
  });

  it('is hidden until shown', () => {
    const zone = createBladeZone();
    zone.build(BLADES);
    zone.update(BLADES.map((b) => ({ ...b, angle: 0 })));
    expect(named(zone.group, 'zone_0').visible).toBe(false);
    zone.teardown();
    expect(zone.group.children).toHaveLength(0);
  });
});
