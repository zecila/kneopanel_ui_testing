import type { Page, Request } from '@playwright/test';

import { test, expect } from '../../fixtures/read-only-test';

const OVERVIEW_PATH = '/api/v2/kneo-apps/overview';
const RESCAN_PATH = '/api/v2/kneo-apps/rescan';
const START_PATH = '/api/v2/kneo-apps/start';
const STOP_PATH = '/api/v2/kneo-apps/stop';
const RESTART_PATH = '/api/v2/kneo-apps/restart';
const SWITCH_PATH = '/api/v2/kneo-apps/switch';

interface AppOverview {
  available: Array<Record<string, unknown>>;
  capabilities: Record<string, boolean>;
  current: Record<string, unknown> | null;
  hostname: string;
  operation?: Record<string, unknown>;
  runtime: Record<string, unknown>;
  scannedAt: string;
  unavailable: Array<Record<string, unknown>>;
}

function app(id: string, name: string): Record<string, unknown> {
  return {
    id,
    name,
    version: '1.2.3',
    availability: 'available',
    rootDir: `/opt/kneo-e2e/${id}`,
    manifestPath: `/opt/kneo-e2e/${id}/manifest.yaml`,
    capabilities: { switch: true, start: true, stop: true, restart: true },
    compatibility: [],
  };
}

function overview(state = 'running'): AppOverview {
  return {
    hostname: 'kneo-e2e-host',
    current: app('app-alpha', 'Kneo E2E Alpha'),
    available: [app('app-beta', 'Kneo E2E Beta')],
    unavailable: [],
    runtime: {
      appId: 'app-alpha',
      state,
      health: state === 'running' ? 'healthy' : 'unknown',
      checkedAt: '2026-10-07T20:00:00Z',
      services: [
        {
          component: 'gateway',
          container: 'kneo-e2e-gateway',
          state,
          health: state === 'running' ? 'healthy' : 'unknown',
          shared: false,
        },
      ],
    },
    scannedAt: '2026-10-07T20:00:00Z',
    capabilities: {
      switch: true,
      start: true,
      stop: true,
      restart: true,
      repair: true,
      install: false,
      uninstall: false,
      upgrade: false,
    },
  };
}

async function routeOverview(
  page: Page,
  data: () => AppOverview,
): Promise<void> {
  for (const path of [OVERVIEW_PATH, RESCAN_PATH]) {
    await page.route(`**${path}`, async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        json: { code: 200, data: data(), message: '' },
        status: 200,
      });
    });
  }
}

function body(request: Request): Record<string, unknown> {
  return request.postDataJSON() as Record<string, unknown>;
}

test.describe('Kneo Apps lifecycle compatibility [H,V,F,R,C,X,A]', () => {
  test('maps the current app, runtime health, and available switch target', async ({
    page,
  }) => {
    await routeOverview(page, () => overview());
    await page.goto('/ai/apps');

    await expect(page.getByText('Kneo E2E Alpha', { exact: true })).toBeVisible();
    await expect(page.getByText('Kneo E2E Beta', { exact: true })).toBeVisible();
    await expect(page.getByText(/Healthy/).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Stop', exact: true })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Restart', exact: true })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Switch', exact: true })).toBeEnabled();
  });

  test('cancels Stop and submits no operation request', async ({ page }) => {
    await routeOverview(page, () => overview());
    let stopRequests = 0;
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === STOP_PATH) stopRequests += 1;
    });
    await page.goto('/ai/apps');

    await page.getByRole('button', { name: 'Stop', exact: true }).click();
    await page
      .locator('.el-message-box:visible')
      .getByRole('button', { name: 'Cancel', exact: true })
      .click();
    expect(stopRequests).toBe(0);
  });

  test('starts a stopped app and persists the recovered runtime after reload', async ({
    page,
  }) => {
    let state = 'stopped';
    await routeOverview(page, () => overview(state));
    let startBody: Record<string, unknown> | undefined;
    await page.route(`**${START_PATH}`, async (route) => {
      startBody = body(route.request());
      state = 'running';
      await route.fulfill({
        contentType: 'application/json',
        json: { code: 200, data: {}, message: '' },
        status: 200,
      });
    });
    await page.goto('/ai/apps');

    await page.getByRole('button', { name: 'Start', exact: true }).click();
    await page
      .locator('.el-message-box:visible')
      .getByRole('button', { name: 'OK', exact: true })
      .click();
    expect(typeof startBody?.taskID).toBe('string');

    await page.reload();
    await expect(page.getByText(/Healthy/).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeDisabled();
  });

  test('switches to one exact app and exposes a failed retry', async ({ page }) => {
    let attempts = 0;
    let switchBody: Record<string, unknown> | undefined;
    await routeOverview(page, () => overview());
    await page.route(`**${SWITCH_PATH}`, async (route) => {
      attempts += 1;
      switchBody = body(route.request());
      await route.fulfill({
        contentType: 'application/json',
        json:
          attempts === 1
            ? {
                code: 500,
                data: null,
                message: 'kneo-e2e app switch failed',
              }
            : { code: 200, data: {}, message: '' },
        status: 200,
      });
    });
    await page.goto('/ai/apps');

    const switchButton = page.getByRole('button', { name: 'Switch', exact: true });
    await switchButton.click();
    await page
      .locator('.el-message-box:visible')
      .getByRole('button', { name: 'OK', exact: true })
      .click();
    await expect(page.getByText('kneo-e2e app switch failed').last()).toBeVisible();

    await switchButton.click();
    await page
      .locator('.el-message-box:visible')
      .getByRole('button', { name: 'OK', exact: true })
      .click();
    expect(attempts).toBe(2);
    expect(switchBody).toMatchObject({ appId: 'app-beta' });
    expect(typeof switchBody?.taskID).toBe('string');
  });

  test('confirms Restart inside the browser fixture', async ({ page }) => {
    await routeOverview(page, () => overview());
    let restartBody: Record<string, unknown> | undefined;
    await page.route(`**${RESTART_PATH}`, async (route) => {
      restartBody = body(route.request());
      await route.fulfill({
        contentType: 'application/json',
        json: { code: 200, data: {}, message: '' },
        status: 200,
      });
    });
    await page.goto('/ai/apps');

    await page.getByRole('button', { name: 'Restart', exact: true }).click();
    await expect(page.locator('.el-message-box:visible')).toBeVisible();
    await page
      .locator('.el-message-box:visible')
      .getByRole('button', { name: 'OK', exact: true })
      .click();
    expect(typeof restartBody?.taskID).toBe('string');
  });
});
