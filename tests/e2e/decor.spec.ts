/**
 * Tickets 16 and 18: decor is instanced from `planDecor` and `planVines`, per kind, on the
 * pinned levels, and the moss and vines on the wall can be seen from the game camera.
 * That a level change rebuilds it without new programs is chest-transition's program-key
 * check (the decor view is in the scene for it).
 *
 * "Seen" is measured, not eyeballed: with the chase camera framed as if the hero stood on
 * the prop's tile facing north, one frame is drawn with the kind shown and one with it
 * hidden, and the pixels that change are counted. Ticket 16's moss was correctly placed
 * but covered ~120 pixels and changed them by under 20 levels of RGB: a small, dark mound
 * at the foot of a shadowed face.
 */
import { expect, LEVEL_0, LEVEL_1, test } from './fixtures/game';
import type { DevGameWindow, Route } from './fixtures/game';
import { PROP_KINDS, planDecor, planVines } from '../../src/core/decor';
import type { DecorPlacement } from '../../src/core/decor';
import { generateLevel } from '../../src/core/generator';
import { TILE_SIZE, tileToWorld } from '../../src/core/grid';

interface Win extends DevGameWindow {
  __game: DevGameWindow['__game'] & {
    decor: {
      children: {
        name: string;
        count: number;
        visible: boolean;
        instanceMatrix: { array: ArrayLike<number> };
      }[];
    };
    guard: { violations: unknown[] };
    composer: { render(): void };
    renderer: { domElement: HTMLCanvasElement };
    camera: {
      position: { set(x: number, y: number, z: number): void };
      lookAt(x: number, y: number, z: number): void;
      updateMatrixWorld(): void;
    };
    look: {
      camera: { up: number; back: number; lead: number };
      decor: { vineChance: number; mossOffset: number };
    };
  };
}

test.use({ viewport: { width: 640, height: 400 } });

/** Pixels whose RGB changes by more than this (summed over channels) count as changed. */
const DELTA = 30;
/**
 * Changed pixels a wall prop must make at 640 × 400 (the chase camera is ~17 m away, so a
 * whole south face is ~25 px tall). Ticket 18's moss makes ~370–400 and its vines ~180–380;
 * its moss in ticket 16's MOSS colour makes under 80, and ticket 16's smaller patch less.
 */
const SEEN = 150;

const plans = (route: Route, vineChance: number) => {
  const level = generateLevel(route.level, route.seed);
  return [...planDecor(level, route.seed), ...planVines(level, route.seed, vineChance)];
};

for (const route of [LEVEL_0, LEVEL_1]) {
  test(`level ${route.level}: every planned prop is instanced, moss and vines on the north wall`, async ({
    game,
  }) => {
    await game.boot(route);
    await game.advance(100);
    const { meshes, violations, vineChance, mossOffset } = await game.page.evaluate(() => {
      const g = (window as unknown as Win).__game;
      return {
        violations: g.guard.violations.length,
        vineChance: g.look.decor.vineChance,
        mossOffset: g.look.decor.mossOffset,
        meshes: g.decor.children.map((m) => ({
          name: m.name,
          // Each instance's translation (matrix elements 12, 13 and 14).
          at: Array.from({ length: m.count }, (_, i) => ({
            x: m.instanceMatrix.array[i * 16 + 12] as number,
            y: m.instanceMatrix.array[i * 16 + 13] as number,
            z: m.instanceMatrix.array[i * 16 + 14] as number,
          })),
        })),
      };
    });
    expect(violations).toBe(0);
    const plan = plans(route, vineChance);
    expect(plan.length).toBeGreaterThan(10);
    for (const kind of ['moss', 'vine'] as const) {
      expect(plan.filter((d) => d.kind === kind).length, kind).toBeGreaterThan(0);
    }
    for (const kind of PROP_KINDS) {
      const mesh = meshes.find((m) => m.name === `decor_${kind}`);
      const planned = plan.filter((d) => d.kind === kind);
      expect(mesh?.at.length, kind).toBe(planned.length);
      planned.forEach((d, i) => {
        const tile = tileToWorld(d.col, d.row);
        const at = mesh?.at[i] ?? { x: NaN, y: NaN, z: NaN };
        // On its own tile (decor never leaves the tile it was planned on).
        expect(Math.abs(at.x - tile.x), `${kind} ${d.col},${d.row}`).toBeLessThanOrEqual(1);
        expect(Math.abs(at.z - tile.z), `${kind} ${d.col},${d.row}`).toBeLessThanOrEqual(1);
        if (kind === 'moss') expect(at.z).toBeCloseTo(tile.z - TILE_SIZE / 2 + mossOffset);
        if (kind === 'vine') {
          expect(at.z).toBeCloseTo(tile.z - TILE_SIZE / 2);
          expect(at.y).toBeGreaterThan(2); // hung from the cap
        }
      });
    }
  });

  test(`level ${route.level}: moss and vines can be seen from the chase camera`, async ({
    game,
  }) => {
    await game.boot(route);
    await game.advance(100);
    const vineChance = await game.page.evaluate(
      () => (window as unknown as Win).__game.look.decor.vineChance,
    );
    const plan = plans(route, vineChance);
    for (const kind of ['moss', 'vine'] as const) {
      const d = plan.find((p) => p.kind === kind) as DecorPlacement;
      const tile = tileToWorld(d.col, d.row);
      const changed = await game.page.evaluate(
        ({ tile, kind, delta }) => {
          const g = (window as unknown as Win).__game;
          const cam = g.look.camera;
          // The rig's pose with the hero on the tile, facing north.
          const fz = tile.z - cam.lead;
          const shot = () => {
            g.camera.position.set(tile.x, cam.up, fz + cam.back);
            g.camera.lookAt(tile.x, 0, fz);
            g.camera.updateMatrixWorld();
            g.composer.render();
            const src = g.renderer.domElement;
            const c = document.createElement('canvas');
            c.width = src.width;
            c.height = src.height;
            const ctx = c.getContext('2d') as CanvasRenderingContext2D;
            ctx.drawImage(src, 0, 0); // same task as the draw: the buffer is still there
            return ctx.getImageData(0, 0, c.width, c.height).data;
          };
          const mesh = g.decor.children.find((m) => m.name === `decor_${kind}`);
          if (!mesh) throw new Error(`no decor_${kind}`);
          const shown = shot();
          mesh.visible = false;
          const hidden = shot();
          mesh.visible = true;
          let n = 0;
          for (let i = 0; i < shown.length; i += 4) {
            const d =
              Math.abs((shown[i] ?? 0) - (hidden[i] ?? 0)) +
              Math.abs((shown[i + 1] ?? 0) - (hidden[i + 1] ?? 0)) +
              Math.abs((shown[i + 2] ?? 0) - (hidden[i + 2] ?? 0));
            if (d > delta) n++;
          }
          return n;
        },
        { tile, kind, delta: DELTA },
      );
      expect(changed, `${kind} at ${d.col},${d.row}`).toBeGreaterThan(SEEN);
    }
  });
}
