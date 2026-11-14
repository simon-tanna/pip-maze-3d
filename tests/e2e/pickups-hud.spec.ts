import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { expect, LEVEL_0, routeMoves, test } from './fixtures/game';
import type { GameDriver, Move } from './fixtures/game';

const palette = JSON.parse(
  readFileSync(new URL('../../src/render/palette.json', import.meta.url), 'utf8'),
) as { P: Record<string, string> };

/** `#rrggbb` → the `rgb(r, g, b)` that getComputedStyle reports. */
const rgb = (name: string) => {
  const hex = palette.P[name] ?? '';
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};

const TICK = 1000 / 60;
const FLY_MS = 450; // look.hud.flyMs

const coinCount = (page: Page) => page.locator('[data-hud="coin-count"]');
const slot = (page: Page, i = 0) => page.locator('[data-hud="key-slot"]').nth(i);
const opacity = (page: Page, selector: string) =>
  page.locator(selector).evaluate((e) => Number(getComputedStyle(e).opacity));
const scale = (page: Page, selector: string) =>
  page.locator(selector).evaluate((e) => {
    const s = getComputedStyle(e).scale;
    return s === 'none' ? 1 : Number(s.split(' ')[0]);
  });

/** Walk `moves`, but land the very last tile tick by tick; returns sim time at landing. */
async function walkAndLand(game: GameDriver, moves: readonly Move[]): Promise<number> {
  const last = moves.at(-1);
  if (!last) throw new Error('no moves');
  const [dir, n] = last;
  await game.walk([...moves.slice(0, -1), ...(n > 1 ? [[dir, n - 1] as const] : [])]);
  await game.press(dir);
  await game.release(dir);
  for (;;) {
    await game.advance(1);
    const s = await game.snapshot();
    if (!s.moving) return s.simMs;
  }
}

/** Advance one tick at a time until `done()`; fails after `limit` ms. */
async function tickUntil(game: GameDriver, done: () => Promise<boolean>, limit = 1000) {
  for (let ms = 0; ms < limit; ms += TICK) {
    if (await done()) return;
    await game.advance(1);
  }
  throw new Error('condition not met in time');
}

test.describe('pickups and the HUD', () => {
  test('the HUD shows the chamber, the coin total and an empty key slot', async ({ game }) => {
    await game.boot(LEVEL_0);
    const { page } = game;
    await expect(page.locator('#hud [data-hud="chamber"]')).toHaveText('CHAMBER 1');
    await expect(coinCount(page)).toHaveText('0');
    await expect(page.locator('[data-hud="key-slot"]')).toHaveCount(1);
    // DOM, not canvas: the post chain never touches it.
    expect(await page.locator('#hud canvas').count()).toBe(0);
  });

  test('walking over a coin banks it at once; the HUD counts it when the sprite lands', async ({
    game,
  }) => {
    await game.boot(LEVEL_0);
    const { page } = game;
    const s = await game.walk(routeMoves(LEVEL_0, 'coin'));
    expect(s.coins).toBe(1);
    await expect(page.locator('[data-hud="flyer-coin"]')).toHaveCount(1);
    await expect(coinCount(page)).toHaveText('0');
    await game.advance(FLY_MS);
    await expect(coinCount(page)).toHaveText('1');
    await expect(page.locator('[data-hud="flyer-coin"]')).toHaveCount(0);
  });

  test('picking up the key fills the slot; empty is INK at 0.75, filled is not', async ({
    game,
  }) => {
    await game.boot(LEVEL_0);
    const { page } = game;
    const icon = '[data-hud="key-icon"]';
    await expect(slot(page)).toHaveAttribute('data-filled', 'false');
    expect(await page.locator(icon).evaluate((e) => getComputedStyle(e).color)).toBe(rgb('INK'));
    expect(await opacity(page, icon)).toBeCloseTo(0.75, 5);

    const s = await game.walk(routeMoves(LEVEL_0, 'key'));
    expect(s.keys).toBe(1);
    await expect(page.locator('[data-hud="flyer-key"]')).toHaveCount(1);
    await game.advance(FLY_MS);
    await expect(slot(page)).toHaveAttribute('data-filled', 'true');
    expect(await page.locator(icon).evaluate((e) => getComputedStyle(e).color)).toBe(rgb('GOLD'));
    expect(await opacity(page, icon)).toBe(1);
  });

  test('the chest without the key shows the toast: in 180, hold 900, out 300 ms', async ({
    game,
  }) => {
    await game.boot(LEVEL_0);
    await game.hazardsOff(true);
    const { page } = game;
    const toast = '[data-hud="toast"]';
    await game.walk(routeMoves(LEVEL_0, 'coin'));
    const t0 = await walkAndLand(game, LEVEL_0.chestWithoutKey?.moves ?? []);
    expect((await game.snapshot()).keys).toBe(0);
    await expect(page.locator(toast)).toHaveText('Find the key first!');

    const at = async (ms: number) => {
      await game.advance(ms - ((await game.snapshot()).simMs - t0));
      return { ms: (await game.snapshot()).simMs - t0, opacity: await opacity(page, toast) };
    };
    const cubicOut = (t: number) => 1 - (1 - t) ** 3;
    expect(await opacity(page, toast)).toBe(0);
    const fadingIn = await at(90);
    expect(fadingIn.opacity).toBeCloseTo(cubicOut(fadingIn.ms / 180), 2);
    expect((await at(200)).opacity).toBe(1);
    const holding = await at(1050); // ticks overshoot: stay a tick clear of 1080
    expect(holding.ms).toBeLessThan(1080);
    expect(holding.opacity).toBe(1);
    const fadingOut = await at(1230);
    expect(fadingOut.opacity).toBeCloseTo(1 - (fadingOut.ms - 1080) / 300, 2);
    expect((await at(1400)).opacity).toBe(0);
  });

  test('the toast shows again on every locked landing', async ({ game }) => {
    await game.boot(LEVEL_0);
    await game.hazardsOff(true);
    const { page } = game;
    await game.walk([...routeMoves(LEVEL_0, 'coin'), ...(LEVEL_0.chestWithoutKey?.moves ?? [])]);
    await game.advance(2000);
    expect(await opacity(page, '[data-hud="toast"]')).toBe(0);
    await game.walk([['north', 1]]);
    await walkAndLand(game, [['south', 1]]);
    await game.advance(300);
    expect(await opacity(page, '[data-hud="toast"]')).toBe(1);
  });

  test('a coin landing pops the count', async ({ game }) => {
    await game.boot(LEVEL_0);
    const { page } = game;
    await game.walk(routeMoves(LEVEL_0, 'coin'));
    await tickUntil(game, async () => (await coinCount(page).textContent()) === '1');
    await game.advance(1);
    expect(await scale(page, '[data-hud="coin-icon"]')).toBeGreaterThan(1.05);
  });
});

test.describe('under reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('the pop scale stays 1 and the flight still runs', async ({ game }) => {
    await game.boot(LEVEL_0);
    const { page } = game;
    await game.walk(routeMoves(LEVEL_0, 'coin'));
    await expect(page.locator('[data-hud="flyer-coin"]')).toHaveCount(1);
    await tickUntil(game, async () => (await coinCount(page).textContent()) === '1');
    for (let i = 0; i < 4; i++) {
      await game.advance(1);
      expect(await scale(page, '[data-hud="coin-icon"]')).toBe(1);
    }
    await expect(page.locator('[data-hud="plus"]')).toHaveCount(0);

    // A long leg: skip rendering up to its last move (textured SwiftShader frames are
    // costly), then render every step of the move that lands on the key, so the HUD runs.
    const toKey = LEVEL_0.legs[1]?.moves ?? [];
    await game.walk(toKey.slice(0, -1), { frames: 'last' });
    await game.walk(toKey.slice(-1));
    await expect(page.locator('[data-hud="flyer-key"]')).toHaveCount(1);
    await tickUntil(game, async () => (await slot(page).getAttribute('data-filled')) === 'true');
    await game.advance(1);
    expect(await scale(page, '[data-hud="key-icon"]')).toBe(1);
  });
});
