import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  // One SwiftShader boot can take ~20 s under parallel workers; a spec may boot twice and walk.
  timeout: 60_000,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5180',
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
    url: 'http://localhost:5180',
    reuseExistingServer: !process.env['CI'],
  },
});
