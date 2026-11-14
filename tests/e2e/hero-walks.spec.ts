import { tileToWorld } from '../../src/core/grid';
import { expect, LEVEL_0, LEVEL_1, routeMoves, test } from './fixtures/game';

const LEAD = 1; // look.camera.lead
const BACK = 7; // look.camera.back
const SETTLED = 0.02; // m

test('scripted presses walk level 0’s route to the chest', async ({ game }) => {
  await game.boot(LEVEL_0);
  await game.hazardsOff(true); // its chest leg crosses a blade (ticket 08)
  expect(await game.snapshot()).toMatchObject({
    tile: LEVEL_0.start,
    machine: 'playing',
    paused: true,
  });

  const atKey = await game.walk(routeMoves(LEVEL_0, 'key'));
  expect(atKey.tile).toEqual(LEVEL_0.legs[1]?.tile);
  const atChest = await game.walk(LEVEL_0.legs[2]?.moves ?? []);
  expect(atChest).toMatchObject({ tile: LEVEL_0.legs[2]?.tile, moving: false });
});

test('level 1’s route reaches its chest', async ({ game }) => {
  await game.boot(LEVEL_1);
  await game.hazardsOff(true); // its coin leg crosses three flames
  expect((await game.walk(routeMoves(LEVEL_1))).tile).toEqual(LEVEL_1.legs[2]?.tile);
});

test('a press into a wall leaves tile and facing unchanged', async ({ game }) => {
  await game.boot(LEVEL_0);
  const before = await game.snapshot();
  await game.tap(LEVEL_0.wallFromStart);
  await game.advance(300);
  const after = await game.snapshot();
  expect(after).toMatchObject({ tile: before.tile, facing: before.facing, moving: false });
});

test('real key presses walk the hero too', async ({ game }) => {
  await game.boot(LEVEL_0);
  await game.page.keyboard.down('KeyD');
  await game.advance(1);
  await game.page.keyboard.up('KeyD');
  await game.advance(120);
  expect(await game.snapshot()).toMatchObject({ tile: { col: 2, row: 1 }, facing: 'east' });
});

test('the camera leads 1 m along facing and its lag settles within 0.6 s', async ({ game }) => {
  await game.boot(LEVEL_0);
  await game.tap('east');
  await game.advance(120); // landed on (2, 1), facing east
  const hero = tileToWorld(2, 1);
  const target = { x: hero.x + LEAD, z: hero.z + BACK };

  const lagging = await game.camera();
  expect(Math.abs(lagging.x - target.x)).toBeGreaterThan(SETTLED); // it does lag

  await game.advance(600);
  const settled = await game.camera();
  expect(Math.abs(settled.x - target.x)).toBeLessThan(SETTLED);
  expect(Math.abs(settled.z - target.z)).toBeLessThan(SETTLED);
});
