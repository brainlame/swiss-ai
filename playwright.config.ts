import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'test-results/run-' + Date.now(),
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'off',
    screenshot: 'only-on-failure',
    launchOptions: { executablePath: process.env.CHROME_PATH },
  },
  webServer: [
    {
      command: 'node tests/fixture-server.mjs',
      url: 'http://127.0.0.1:54331/health',
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'npm run dev -- --port 4173',
      url: 'http://127.0.0.1:4173/signin',
      env: {
        PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54331',
        PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'fixture-publishable-key',
      },
      reuseExistingServer: !process.env.CI,
    },
  ],
  projects: [
    {
      name: 'desktop-light',
      use: { viewport: { width: 1440, height: 1000 }, colorScheme: 'light' },
    },
    {
      name: 'desktop-dark',
      use: { viewport: { width: 1440, height: 1000 }, colorScheme: 'dark' },
    },
    {
      name: 'mobile-light',
      use: {
        viewport: { width: 390, height: 844 },
        colorScheme: 'light',
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: 'mobile-dark',
      use: {
        viewport: { width: 390, height: 844 },
        colorScheme: 'dark',
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
});
