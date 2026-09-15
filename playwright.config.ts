import 'dotenv/config';

import { defineConfig, devices } from '@playwright/test';

import { AUTH_STATE_PATH, BASE_URL } from './tests/helpers/environment';

const mutationTestsEnabled = process.env.ALLOW_MUTATIONS === 'true';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
  ],
  use: {
    baseURL: BASE_URL,
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'setup',
      testMatch: '**/*.setup.ts',
      use: {
        ...devices['Desktop Chrome'],
        screenshot: 'off',
        trace: 'off',
        video: 'off',
      },
    },
    {
      name: 'public-read-only',
      testMatch: 'public/**/*.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'read-only',
      testMatch: 'read-only/**/*.spec.ts',
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: AUTH_STATE_PATH,
      },
    },
    ...(mutationTestsEnabled
      ? [
          {
            name: 'mutating',
            testMatch: 'mutating/**/*.spec.ts',
            dependencies: ['setup'],
            fullyParallel: false,
            use: {
              ...devices['Desktop Chrome'],
              storageState: AUTH_STATE_PATH,
            },
          },
        ]
      : []),
  ],
});
