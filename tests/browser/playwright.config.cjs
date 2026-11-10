const path = require('node:path');
const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: __dirname,
  testMatch: '**/*.spec.cjs',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90000,
  expect: { timeout: 15000 },
  reporter: 'list',
  outputDir: path.resolve(__dirname, '../../test-results'),
  use: {
    baseURL: 'http://127.0.0.1:4187',
    viewport: { width: 1600, height: 1000 },
    serviceWorkers: 'block',
    acceptDownloads: true,
    launchOptions: {
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
        ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}),
    },
  },
  webServer: {
    command: 'node scripts/start-offline-test-server.cjs',
    cwd: path.resolve(__dirname, '../..'),
    url: 'http://127.0.0.1:4187',
    reuseExistingServer: false,
    timeout: 60000,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 },
  },
});
