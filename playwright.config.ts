import { defineConfig, devices } from '@playwright/test';

/** `DEV_PORT` (default 5180) runs e2e against this checkout's own dev server. */
const url = `http://localhost:${process.env['DEV_PORT'] ?? 5180}`;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  // One SwiftShader boot can take ~20 s under parallel workers; a spec may boot twice and walk.
  timeout: 60_000,
  reporter: 'list',
  use: {
    baseURL: url,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Software WebGL so headless runs work without a GPU.
        launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
      },
    },
  ],
  webServer: {
    command: 'pnpm dev',
    url,
    reuseExistingServer: !process.env['CI'],
  },
});
