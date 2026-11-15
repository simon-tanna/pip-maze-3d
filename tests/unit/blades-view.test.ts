import { beforeAll, describe, expect, it } from 'vitest';
import { Box3, Vector3 } from 'three';
import type { Mesh, Object3D } from 'three';
import { gltfKit } from '@assets/models';
import type { Gltf } from '@assets/models';
import { BLADE_SHAPE, bladeSegments, HEAD_RING } from '@core/blade';
import type { Pt } from '@core/blade';
import { tileToWorld } from '@core/grid';
import { BLADE_MODEL } from '@render/blade-kit';
import { WALL_HEIGHT } from '@render/chamber-kit';
import { createBladesView } from '@render/blades';
import { createBladeZone } from '@render/blade-zone';
import { parseModel } from './support/glb';

let kit: Gltf;
beforeAll(async () => {
  kit = gltfKit(await parseModel(BLADE_MODEL, { skipTextures: true }), BLADE_MODEL);
});

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
/** Even–odd point-in-polygon. */
const contains = (ring: readonly Pt[], [x, y]: Pt) => {
  let inside = false;
  ring.forEach(([xi, yi], i) => {
    const [xj, yj] = ring[(i + ring.length - 1) % ring.length] ?? [0, 0];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  });
  return inside;
};
const boundaryDistance = (ring: readonly Pt[], p: Pt) =>
  Math.min(
    ...ring.map((a, i) => {
      const b = ring[(i + 1) % ring.length] ?? a;
      const ab = [b[0] - a[0], b[1] - a[1]] as const;
      const len = ab[0] ** 2 + ab[1] ** 2 || 1;
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / len));
      return Math.hypot(p[0] - a[0] - ab[0] * t, p[1] - a[1] - ab[1] * t);
    }),
  );

const planeToWorld = (tile: { col: number; row: number }, [u, y]: readonly [number, number]) => {
  const { x, z } = tileToWorld(tile.col, tile.row);
  return new Vector3(x, y, z + u);
};

describe('blades view (steel blade GLB)', () => {
  it('draws each head where the contact rule puts it, at every angle', () => {
    const view = createBladesView(kit);
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

  it('spins about an axle at the pivot height, between two lintels on the wall tops', () => {
    const view = createBladesView(kit);
    view.build(BLADES);
    view.group.updateMatrixWorld(true);
    const blade = named(view.group, 'blade_1');
    const { x } = tileToWorld(9, 7);
    const box = (name: string) => new Box3().setFromObject(named(blade, name));
    const [west, east] = [box('lintel_0'), box('lintel_1')].sort((a, b) => a.min.x - b.min.x);
    for (const l of [west, east]) {
      expect(l?.min.y).toBeCloseTo(WALL_HEIGHT);
      // Each runs north–south, across the corridor.
      expect((l?.max.z ?? 0) - (l?.min.z ?? 0)).toBeGreaterThan(2);
    }
    expect(west?.max.x).toBeLessThan(x);
    expect(east?.min.x).toBeGreaterThan(x);
    const axle = box('axle').getCenter(new Vector3());
    expect(axle.y).toBeCloseTo(BLADE_SHAPE.pivotHeight);
    expect(axle.x).toBeCloseTo(x);
  });

  it('draws the head on the contact zone (overlay on) within 0.05 m at 0°, ±28°, 90°, 180°', () => {
    const view = createBladesView(kit);
    const zone = createBladeZone();
    view.build(BLADES);
    zone.build(BLADES);
    zone.show = true;
    const TOL = 0.05;
    for (const angle of [0, 28, -28, 90, 180]) {
      const now = BLADES.map((b) => ({ ...b, angle }));
      view.update(now);
      zone.update(now);
      view.group.updateMatrixWorld(true);
      zone.group.updateMatrixWorld(true);
      BLADES.forEach((b, i) => {
        const at = `blade ${i} at ${angle}°`;
        const { x: x0, z: z0 } = tileToWorld(b.tile.col, b.tile.row);
        // The overlay's head ring, read off its bars: (u, y) in the swing plane.
        const bars = (named(zone.group, `zone_${i}`).children as Mesh[]).slice(0, HEAD_RING.length);
        expect(bars.every((bar) => bar.visible)).toBe(true);
        const ring: Pt[] = bars.map((bar) => {
          const p = new Vector3(-0.5, 0, 0).applyMatrix4(bar.matrixWorld);
          return [p.z - z0, p.y];
        });
        // The drawn head's vertices, in the same plane, and how far off it they sit.
        const head = named(view.group, `blade_${i}`).getObjectByName('head') as Mesh;
        const pos = head.geometry.getAttribute('position');
        const drawn: Pt[] = [];
        for (let k = 0; k < pos.count; k++) {
          const p = new Vector3().fromBufferAttribute(pos, k).applyMatrix4(head.matrixWorld);
          expect(Math.abs(p.x - x0), `${at}: off the plane`).toBeLessThanOrEqual(
            BLADE_SHAPE.halfThickness + 1e-6,
          );
          drawn.push([p.z - z0, p.y]);
        }
        // Every zone vertex has a drawn vertex on it, and the drawn head never leaves the zone.
        for (const r of ring) {
          const near = Math.min(...drawn.map((d) => Math.hypot(d[0] - r[0], d[1] - r[1])));
          expect(near, `${at}: zone point`).toBeLessThan(TOL);
        }
        for (const d of drawn) {
          const inside = contains(ring, d) || boundaryDistance(ring, d) < TOL;
          expect(inside, `${at}: drawn point (${d[0]}, ${d[1]})`).toBe(true);
        }
      });
    }
  });

  it('shares materials and geometry across levels; teardown drops the level’s blades', () => {
    const view = createBladesView(kit);
    view.build(BLADES);
    const head = named(view.group, 'blade_0').getObjectByName('head') as Mesh;
    const other = createBladesView(kit);
    other.build(BLADES.slice(1));
    const head2 = named(other.group, 'blade_0').getObjectByName('head') as Mesh;
    expect(head2.material).toBe(head.material);
    expect(head2.geometry).toBe(head.geometry);
    view.teardown();
    expect(view.group.getObjectByName('blade_0')).toBeUndefined();
    expect(view.group.children.map((c) => c.name)).toEqual(['blade_prototype']);
  });

  it('a level without blades still holds every blade material, for the boot precompile', () => {
    const materials = (root: Object3D) => {
      const all = new Set<unknown>();
      root.traverse((o) => (o as Mesh).isMesh && all.add((o as Mesh).material));
      return all;
    };
    const full = createBladesView(kit);
    full.build(BLADES);
    const empty = createBladesView(kit);
    empty.build([]);
    expect([...materials(empty.group)]).toEqual(expect.arrayContaining([...materials(full.group)]));
    expect(named(full.group, 'blade_0').getObjectByName('head')?.frustumCulled).toBe(true);
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
