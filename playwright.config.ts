import { defineConfig, devices } from '@playwright/test';

// End-to-end test of the offline flow against a DEV build whose API URL points to a mock
// (intercepted with page.route in the test). Build: `npm run e2e` does it.
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  fullyParallel: false,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:4174',
    serviceWorkers: 'allow',
    ...devices['iPhone SE'],
    // Chromium engine with an iPhone viewport: service workers + offline emulation work reliably here.
    browserName: 'chromium',
    defaultBrowserType: 'chromium'
  },
  webServer: {
    command: 'npx vite preview --mode dev --outDir e2e-dist --port 4174 --strictPort',
    url: 'http://localhost:4174/NT2/dev/',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000
  }
});
