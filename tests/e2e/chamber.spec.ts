import { expect, test } from '@playwright/test';
import type { ConsoleMessage, Page } from '@playwright/test';
import palette from '../../src/render/palette.json' with { type: 'json' };
import baseline from '../fixtures/generator-baseline.json' with { type: 'json' };

/** Shape of the dev-only `window.__game` handle this spec reads (see src/main.ts). */
interface DevGame {
  scene: { background: { getHexString(): string } };
  camera: { fov: number; position: { x: number; y: number; z: number } };
  run: { base: number; level: number; seed: number; pinned: boolean };
  level: { map: number[][] };
  chamber: {
    group: {
      children: {
        name: string;
        count: number;
        castShadow: boolean;
        userData: { padding: boolean };
        instanceMatrix: { array: ArrayLike<number> };
        geometry: { boundingBox: { max: { y: number } } | null; computeBoundingBox(): void };
      }[];
    };
  };
  rig: { key: { shadow: { mapSize: { x: number; y: number } } } };
}
type Win = Window & { __game: DevGame };

async function boot(page: Page, query = '') {
  const logs: ConsoleMessage[] = [];
  page.on('console', (m) => logs.push(m));
  await page.goto(`/${query}`);
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
  return logs;
}

/** Everything that defines the built chamber: the map and every instance matrix. */
const snapshot = (page: Page) =>
  page.evaluate(() => {
    const g = (window as unknown as Win).__game;
    return {
      map: g.level.map,
      meshes: g.chamber.group.children.map((m) => ({
        name: m.name,
        count: m.count,
        matrices: Array.from(m.instanceMatrix.array).slice(0, m.count * 16),
      })),
    };
  });

const v2Level0 = baseline.find((b) => b.i === 0);
if (!v2Level0) throw new Error('baseline has no level-0 entry');

test('a pinned seed builds v2’s level-0 map, and builds it identically every load', async ({
  page,
}) => {
  const query = `?seed=${v2Level0.seed}&level=0`;
  await boot(page, query);
  const first = await snapshot(page);
  expect(first.map).toEqual(v2Level0.map);
  expect(first.meshes.some((m) => m.count > 0)).toBe(true);

  await boot(page, query);
  expect(await snapshot(page)).toEqual(first);
});

test('without params, the console logs the drawn base seed', async ({ page }) => {
  const logs = await boot(page);
  const run = await page.evaluate(() => (window as unknown as Win).__game.run);
  expect(run).toMatchObject({ level: 0, pinned: false, seed: run.base });
  expect(logs.some((m) => m.text().includes(`base seed ${run.base}`))).toBe(true);
});

for (const query of ['?level=5', '?seed=abc']) {
  test(`${query} warns and falls back to an unpinned level 0`, async ({ page }) => {
    const logs = await boot(page, query);
    expect(logs.some((m) => m.type() === 'warning' && m.text().startsWith('[run]'))).toBe(true);
    const run = await page.evaluate(() => (window as unknown as Win).__game.run);
    expect(run).toMatchObject({ level: 0, pinned: false });
  });
}

test('walls stand 2.2 m on an INK background, seen from the slice camera', async ({ page }) => {
  await boot(page, `?seed=${v2Level0.seed}&level=0`);
  const view = await page.evaluate(() => {
    const g = (window as unknown as Win).__game;
    const cap = g.chamber.group.children.find((m) => m.name === 'cap_0');
    cap?.geometry.computeBoundingBox();
    return {
      background: g.scene.background.getHexString(),
      capTop: cap?.geometry.boundingBox?.max.y,
      fov: g.camera.fov,
      height: g.camera.position.y,
      shadowMap: g.rig.key.shadow.mapSize,
      paddingCasts: g.chamber.group.children.some((m) => m.userData.padding && m.castShadow),
    };
  });
  expect(`#${view.background}`).toBe(palette.P.INK);
  expect(view.capTop).toBeCloseTo(2.2, 4);
  expect(view.fov).toBe(57);
  expect(view.height).toBeCloseTo(15.7, 4);
  expect(view.shadowMap).toEqual({ x: 2048, y: 2048 });
  expect(view.paddingCasts).toBe(false);
});
