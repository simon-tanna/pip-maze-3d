import { expect, test } from '@playwright/test';

test('boots and renders a WebGL canvas', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/');
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true', { timeout: 20_000 });

  const hasWebGL = await page
    .locator('#game canvas')
    .evaluate((c: HTMLCanvasElement) => !!(c.getContext('webgl2') ?? c.getContext('webgl')));
  expect(hasWebGL).toBe(true);
  expect(errors).toEqual([]);
});
