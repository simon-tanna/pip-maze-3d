/**
 * Ticket 16: decor is instanced from `planDecor`, per kind, on the pinned levels. That a
 * level change rebuilds it without new programs is chest-transition's program-key check
 * (the decor view is in the scene for it).
 */
import { expect, LEVEL_0, LEVEL_1, test } from './fixtures/game';
import type { DevGameWindow } from './fixtures/game';
import { DECOR_KINDS, planDecor } from '../../src/core/decor';
import { generateLevel } from '../../src/core/generator';
import { TILE_SIZE, tileToWorld } from '../../src/core/grid';

interface Win extends DevGameWindow {
  __game: DevGameWindow['__game'] & {
    decor: {
      children: { name: string; count: number; instanceMatrix: { array: ArrayLike<number> } }[];
    };
    guard: { violations: unknown[] };
  };
}

test.use({ viewport: { width: 640, height: 400 } });

for (const route of [LEVEL_0, LEVEL_1]) {
  test(`level ${route.level}: every planned prop is instanced, moss on its north wall`, async ({
    game,
  }) => {
    await game.boot(route);
    await game.advance(100);
    const { meshes, violations } = await game.page.evaluate(() => {
      const g = (window as unknown as Win).__game;
      return {
        violations: g.guard.violations.length,
        meshes: g.decor.children.map((m) => ({
          name: m.name,
          // Each instance's translation (matrix elements 12 and 14).
          at: Array.from({ length: m.count }, (_, i) => ({
            x: m.instanceMatrix.array[i * 16 + 12] as number,
            z: m.instanceMatrix.array[i * 16 + 14] as number,
          })),
        })),
      };
    });
    expect(violations).toBe(0);
    const plan = planDecor(generateLevel(route.level, route.seed), route.seed);
    expect(plan.length).toBeGreaterThan(10);
    for (const kind of DECOR_KINDS) {
      const mesh = meshes.find((m) => m.name === `decor_${kind}`);
      const planned = plan.filter((d) => d.kind === kind);
      expect(mesh?.at.length, kind).toBe(planned.length);
      planned.forEach((d, i) => {
        const tile = tileToWorld(d.col, d.row);
        const at = mesh?.at[i] ?? { x: NaN, z: NaN };
        // On its own tile (decor never leaves the tile it was planned on).
        expect(Math.abs(at.x - tile.x), `${kind} ${d.col},${d.row}`).toBeLessThanOrEqual(1);
        expect(Math.abs(at.z - tile.z), `${kind} ${d.col},${d.row}`).toBeLessThanOrEqual(1);
        if (kind === 'moss') expect(at.z).toBeCloseTo(tile.z - TILE_SIZE / 2);
      });
    }
  });
}
