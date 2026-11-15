/**
 * Ticket 13: the steel blade GLB, in the running game. With the contact-zone overlay on
 * (G), the drawn head and the zone coincide within 0.05 m at 0°, ±28°, 90° and 180°, on
 * the shared fixture's `blade@24,1` (level 0). The head is the GLB's, and its baked
 * materials compile no program after boot.
 */
import { expect, LEVEL_0, test } from './fixtures/game';
import type { DevGameWindow } from './fixtures/game';

const SPIN_MS = 1600; // HAZARD_TIMING.bladeSpin
const BLADE = { col: 24, row: 1 };
const TOL = 0.05;

type Pt = [number, number];

interface Obj {
  name: string;
  children: Obj[];
  visible: boolean;
  matrixWorld: { elements: number[] };
  geometry?: { attributes: { position: { array: ArrayLike<number>; count: number } } };
  material?: { map: unknown };
  getObjectByName(n: string): Obj | undefined;
  updateMatrixWorld(force: boolean): void;
}

interface Win extends DevGameWindow {
  __game: DevGameWindow['__game'] & {
    renderer: { info: { programs: unknown[] | null } };
    guard: { violations: unknown[] };
    blades: { group: Obj };
    bladeZone: { group: Obj };
  };
}

test.use({ viewport: { width: 640, height: 400 } });

/** Even–odd point-in-polygon, and distance to the polygon's boundary. */
const contains = (ring: Pt[], [x, y]: Pt) => {
  let inside = false;
  ring.forEach(([xi, yi], i) => {
    const [xj, yj] = ring[(i + ring.length - 1) % ring.length] ?? [0, 0];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  });
  return inside;
};
const boundaryDistance = (ring: Pt[], p: Pt) =>
  Math.min(
    ...ring.map((a, i) => {
      const b = ring[(i + 1) % ring.length] ?? a;
      const ab = [b[0] - a[0], b[1] - a[1]] as const;
      const len = ab[0] ** 2 + ab[1] ** 2 || 1;
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / len));
      return Math.hypot(p[0] - a[0] - ab[0] * t, p[1] - a[1] - ab[1] * t);
    }),
  );

test('the drawn steel head sits on the contact zone at 0°, ±28°, 90° and 180°', async ({
  game,
}) => {
  const { page } = game;
  await game.boot(LEVEL_0);
  const before = await page.evaluate(
    () => (window as unknown as Win).__game.renderer.info.programs?.length ?? 0,
  );
  await page.keyboard.press('g');
  await game.advance(1);

  for (const target of [0, 28, -28, 90, 180]) {
    const { angle, ms } = await page.evaluate(
      ({ blade, spin, target }) => {
        const b = (window as unknown as Win).__game.sim
          .blades()
          .find((x) => x.tile.col === blade.col && x.tile.row === blade.row);
        if (!b) throw new Error('no fixture blade');
        const ms = (((target - b.angle) % 360) + 360) % 360;
        return { angle: b.angle, ms: (ms / 360) * spin };
      },
      { blade: BLADE, spin: SPIN_MS, target },
    );
    expect(angle).toBeDefined();
    await game.advance(ms);

    const got = await page.evaluate((blade) => {
      const g = (window as unknown as Win).__game;
      const i = g.sim
        .blades()
        .findIndex((x) => x.tile.col === blade.col && x.tile.row === blade.row);
      const angle = g.sim.blades()[i]?.angle ?? NaN;
      g.blades.group.updateMatrixWorld(true);
      g.bladeZone.group.updateMatrixWorld(true);
      /** A column-major 4×4 matrix applied to a point. */
      const apply = (m: number[], x: number, y: number, z: number) => {
        const e = (k: number) => m[k] ?? 0;
        return [0, 1, 2].map((r) => e(r) * x + e(r + 4) * y + e(r + 8) * z + e(r + 12));
      };
      const head = g.blades.group.getObjectByName(`blade_${i}`)?.getObjectByName('head');
      const zone = g.bladeZone.group.getObjectByName(`zone_${i}`);
      if (!head?.geometry || !zone) throw new Error('no head or zone');
      const pos = head.geometry.attributes.position;
      const drawn = Array.from({ length: pos.count }, (_, k) =>
        apply(
          head.matrixWorld.elements,
          pos.array[3 * k] ?? 0,
          pos.array[3 * k + 1] ?? 0,
          pos.array[3 * k + 2] ?? 0,
        ),
      );
      const bars = zone.children.map((bar) => apply(bar.matrixWorld.elements, -0.5, 0, 0));
      return {
        angle,
        textured: Boolean(head.material?.map),
        zoneVisible: zone.visible,
        drawn,
        bars,
      };
    }, BLADE);

    expect(Math.abs(((got.angle - target + 540) % 360) - 180), `angle ${target}`).toBeLessThan(4);
    expect(got.textured).toBe(true);
    expect(got.zoneVisible).toBe(true);
    // The tile centre: the zone's arm bar starts on the pivot, straight above it.
    const pivot = got.bars.at(-1) ?? [0, 0, 0];
    const plane = (p: number[]): Pt => [(p[2] ?? 0) - (pivot[2] ?? 0), p[1] ?? 0];
    const x0 = pivot[0] ?? 0;
    // Every bar but the last (the arm) is the head ring.
    const ring = got.bars.slice(0, -1).map(plane);
    const drawn = got.drawn.map(plane);
    for (const p of got.drawn) expect(Math.abs((p[0] ?? 0) - x0)).toBeLessThan(0.06);
    for (const r of ring) {
      const near = Math.min(...drawn.map((d) => Math.hypot(d[0] - r[0], d[1] - r[1])));
      expect(near, `zone point at ${target}°`).toBeLessThan(TOL);
    }
    for (const d of drawn) {
      expect(
        contains(ring, d) || boundaryDistance(ring, d) < TOL,
        `drawn point at ${target}°`,
      ).toBe(true);
    }
  }

  const after = await page.evaluate(() => {
    const g = (window as unknown as Win).__game;
    return { programs: g.renderer.info.programs?.length ?? 0, violations: g.guard.violations };
  });
  expect(after).toEqual({ programs: before, violations: [] });
});
