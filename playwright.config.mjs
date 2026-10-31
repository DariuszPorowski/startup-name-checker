import { defineConfig, devices } from '@playwright/test';

// `npm run preview` serves the production build here (see vite.config.js).
const localUrl = 'http://127.0.0.1:4173/';

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    ...devices['Desktop Chrome'],
    // Set PW_CHANNEL=chrome to use an installed Chrome instead of Playwright's Chromium.
    channel: process.env.PW_CHANNEL || undefined,
    trace: 'retain-on-failure',
  },
  projects: [
    // Deterministic UI tests: every third-party request is answered by a mock.
    { name: 'mocked', testMatch: 'ui.spec.mjs', use: { baseURL: localUrl } },
    // Smoke tests against the real services; set LIVE_URL to test the deployed site.
    { name: 'live', testMatch: 'live.spec.mjs', timeout: 120_000, use: { baseURL: process.env.LIVE_URL || localUrl } },
  ],
  // Tests run against the production build (dist/), which is what gets deployed. Not needed for a deployed LIVE_URL.
  webServer: process.env.LIVE_URL
    ? undefined
    : {
        command: 'npm run build && npm run preview',
        url: localUrl,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
