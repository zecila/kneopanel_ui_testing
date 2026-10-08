import type { Locator, Page, Request } from '@playwright/test';

import { test, expect } from '../../fixtures/read-only-test';

const CONFIG_PATH = '/api/v2/core/settings/kis/config';
const MANIFEST_PATH = '/api/v2/core/settings/kis/config/manifest';
const TOPOLOGY_PATH = '/api/v2/core/settings/kis/storage/topology';
const NODES_PATH = '/api/v2/core/settings/kis/nodes';
const CONFLICTS_PATH = '/api/v2/core/settings/kis/container-conflicts';
const CONFLICT_REPAIR_PATH = '/api/v2/core/settings/kis/container-conflicts/repair';
const DB_REPAIR_PATH = '/api/v2/core/settings/kis/db/legacy-repair';

const CONFIG = {
  manifestPath: '/opt/kneo-e2e/manifest.yaml',
  manifestScope: 'local',
  gatewayUrl: 'http://192.0.2.30:8080',
  adminToken: 'kneo-e2e-synthetic-token',
  storageMode: 'storage_cached',
  storageServiceUrl: 'http://192.0.2.30:9000',
  storageToken: 'kneo-e2e-synthetic-storage-token',
  registryRoot: '/opt/kneo-e2e/registry/',
  weightsRoot: '/opt/kneo-e2e/weights/',
  dbContainer: 'kneo-e2e-postgres',
  dbUser: 'kneo-e2e-user',
  dbName: 'kneo-e2e-db',
  queueProxyEnabled: true,
  queueProxyInstanceMaxInflight: 16,
  queueProxyInstanceMaxQueue: 32,
  queueProxyQueueTimeoutMs: 5000,
  queueProxyUpstreamTimeoutSec: 25,
};

const NODE = {
  advertiseHost: '192.0.2.30',
  configured: true,
  discovered: false,
  ip: '192.0.2.30',
  isLocal: true,
  lastError: '',
  lastHeartbeatAt: '2026-10-07T20:00:00Z',
  providerGatewayHost: '192.0.2.30',
  providerGatewayLocal: true,
  serviceStatuses: {
    kis_db: 'running',
    kis_gateway: 'running',
    kis_provider: 'healthy',
    kis_queue_proxy: 'running',
    kis_storage: 'running',
  },
  status: 'running',
};

function envelope(data: unknown, code = 200, message = ''): object {
  return { code, data, message };
}

async function routeSettingsReads(page: Page): Promise<void> {
  await page.route(`**${CONFIG_PATH}`, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    await route.fulfill({
      contentType: 'application/json',
      json: envelope(CONFIG),
      status: 200,
    });
  });
  await page.route(`**${MANIFEST_PATH}`, async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      json: envelope({
        manifestPath: CONFIG.manifestPath,
        manifestScope: CONFIG.manifestScope,
      }),
      status: 200,
    });
  });
  await page.route(`**${TOPOLOGY_PATH}`, async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      json: envelope({
        compatible: true,
        providerStorageMode: 'storage_cached',
        gatewayStorageMode: 'storage_cached',
        expectedProviderMode: 'storage_cached',
        providerEndpoint: CONFIG.storageServiceUrl,
        gatewayEndpoint: CONFIG.storageServiceUrl,
        repairSupported: true,
        repairOptions: null,
        remoteProviderCount: 0,
        remoteProviderInventoryAvailable: true,
      }),
      status: 200,
    });
  });
  await page.route(`**${NODES_PATH}`, async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      json: envelope({ items: [NODE] }),
      status: 200,
    });
  });
  await page.route(`**${CONFLICTS_PATH}`, async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      json: envelope({ conflicts: [] }),
      status: 200,
    });
  });
  await page.route(`**${DB_REPAIR_PATH}`, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    await route.fulfill({
      contentType: 'application/json',
      json: envelope({ repairRequired: false }),
      status: 200,
    });
  });
}

function formItem(page: Page, label: string): Locator {
  return page.locator('.el-form-item').filter({
    has: page.locator('.el-form-item__label').filter({ hasText: label }),
  });
}

function postBody(request: Request): Record<string, unknown> {
  return request.postDataJSON() as Record<string, unknown>;
}

test.describe('KIS Settings guide compatibility [H,V,F,R,P,X,A]', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      if (!sessionStorage.getItem('kneo-e2e-ssh-cleared')) {
        localStorage.removeItem('kis.sshCredentials');
        sessionStorage.setItem('kneo-e2e-ssh-cleared', 'true');
      }
    });
    await routeSettingsReads(page);
  });

  test('maps storage, database, and queue-proxy settings without exposing secrets', async ({
    page,
  }) => {
    await page.goto('/ai/kis/settings');

    await expect(formItem(page, 'Registry root').locator('input')).toHaveValue(
      CONFIG.registryRoot,
    );
    await expect(formItem(page, 'Weights root').locator('input')).toHaveValue(
      CONFIG.weightsRoot,
    );
    await expect(formItem(page, 'DB Container').locator('input')).toHaveValue(
      CONFIG.dbContainer,
    );
    await expect(formItem(page, 'DB User').locator('input')).toHaveValue(
      CONFIG.dbUser,
    );
    await expect(formItem(page, 'DB Name').locator('input')).toHaveValue(
      CONFIG.dbName,
    );
    await expect(
      formItem(page, 'Maximum concurrent requests per instance').locator('input'),
    ).toHaveValue('16');
    await expect(
      formItem(page, 'Maximum queued requests per instance').locator('input'),
    ).toHaveValue('32');
    await expect(page.getByText('Storage topology is compatible')).toBeVisible();
    await expect(formItem(page, 'SSH password').locator('input')).toHaveAttribute(
      'type',
      'password',
    );
  });

  test('adds, edits, persists, and removes an isolated SSH credential', async ({
    page,
  }) => {
    await page.goto('/ai/kis/settings');
    const host = formItem(page, 'Server host').locator('input');
    const port = formItem(page, 'SSH port').locator('input');
    const username = formItem(page, 'SSH username').locator('input');
    const password = formItem(page, 'SSH password').locator('input');

    await page.getByRole('button', { name: 'Add credential', exact: true }).click();
    await expect(page.getByText('Server host is required').last()).toBeVisible();

    await host.fill('192.0.2.88');
    await port.fill('2222');
    await username.fill('kneo-e2e-user');
    await password.fill('kneo-e2e-password');
    await page.getByRole('button', { name: 'Add credential', exact: true }).click();
    const row = page.locator('.el-table__row').filter({ hasText: '192.0.2.88' });
    await expect(row).toContainText('2222');
    await expect(row).toContainText('kneo-e2e-user');
    await expect(row).not.toContainText('kneo-e2e-password');

    await page.reload();
    const persisted = page.locator('.el-table__row').filter({
      hasText: '192.0.2.88',
    });
    await expect(persisted).toBeVisible();
    await persisted.getByRole('button', { name: 'Edit', exact: true }).click();
    await formItem(page, 'SSH username').locator('input').fill('kneo-e2e-updated');
    await page.getByRole('button', { name: 'Update credential', exact: true }).click();
    await expect(persisted).toContainText('kneo-e2e-updated');

    await persisted.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(persisted).toHaveCount(0);
  });

  test('saves exact queue settings and defers dependent service restart', async ({
    page,
  }) => {
    let saved: Record<string, unknown> | undefined;
    await page.route(`**${CONFIG_PATH}`, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          contentType: 'application/json',
          json: envelope(CONFIG),
          status: 200,
        });
        return;
      }
      saved = postBody(route.request());
      await route.fulfill({
        contentType: 'application/json',
        json: envelope({ ...CONFIG, ...saved, restartServices: ['kis_queue_proxy'] }),
        status: 200,
      });
    });
    await page.goto('/ai/kis/settings');
    await formItem(page, 'Maximum concurrent requests per instance')
      .locator('input')
      .fill('19');
    await formItem(page, 'Maximum queued requests per instance')
      .locator('input')
      .fill('39');
    await page.getByRole('button', { name: 'Save', exact: true }).click();

    expect(saved).toMatchObject({
      queueProxyInstanceMaxInflight: 19,
      queueProxyInstanceMaxQueue: 39,
    });
    const prompt = page.locator('.el-message-box:visible');
    await expect(prompt).toContainText('kis_queue_proxy');
    await prompt
      .getByRole('button', { name: 'Later', exact: true })
      .click();
  });

  test('exports a secret-bearing backup and rejects malformed import before submission', async ({
    page,
  }) => {
    let configWrites = 0;
    page.on('request', (request) => {
      if (
        request.method() === 'POST' &&
        new URL(request.url()).pathname === CONFIG_PATH
      ) {
        configWrites += 1;
      }
    });
    await page.goto('/ai/kis/settings');

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^kneopanel-kis-settings-.*\.json$/);

    await page.locator('input[type="file"]').setInputFiles({
      name: 'invalid-kis-settings.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{"unexpected":true}'),
    });
    await expect(
      page.getByText(/not a valid KneoPanel KIS settings backup/i).last(),
    ).toBeVisible();
    expect(configWrites).toBe(0);
  });

  test('reports an empty conflict scan as a safe no-op', async ({ page }) => {
    await page.goto('/ai/kis/settings');
    await page
      .getByRole('button', {
        name: 'Scan and repair container name conflicts',
        exact: true,
      })
      .click();
    await expect(
      page.getByText('No KIS container name conflicts found', { exact: true }).last(),
    ).toBeVisible();
  });

  test('cancels local Provider IP and cache repairs without sending requests', async ({
    page,
  }) => {
    let repairRequests = 0;
    page.on('request', (request) => {
      const path = new URL(request.url()).pathname;
      if (
        path === '/api/v2/core/settings/kis/runtime/reconcile' ||
        path === '/api/v2/core/settings/kis/ssh/provider/cache/clear'
      ) {
        repairRequests += 1;
      }
    });
    await page.goto('/ai/kis/settings');

    await page
      .getByRole('button', { name: 'Repair Local Provider IP', exact: true })
      .click();
    const providerPrompt = page.locator('.el-message-box:visible');
    await expect(providerPrompt).toContainText(/recreate local KIS services/i);
    await providerPrompt
      .getByRole('button', { name: 'Cancel', exact: true })
      .click();

    await formItem(page, 'Provider cache').getByRole('combobox').click();
    await page.getByRole('option').first().click();
    await page.getByRole('button', { name: 'Clear Cache', exact: true }).click();
    const cachePrompt = page.locator('.el-message-box:visible');
    await expect(cachePrompt).toContainText(/every model running on it/i);
    await cachePrompt.getByRole('button', { name: 'Cancel', exact: true }).click();
    expect(repairRequests).toBe(0);
  });

  test('cancels, retries, and repairs one exact synthetic container conflict', async ({
    page,
  }) => {
    const conflict = {
      code: 'container_name_conflict',
      serviceName: 'kis_storage',
      expectedProject: 'kis',
      containers: [
        {
          actualProject: 'kneo-e2e-legacy',
          containerId: 'abc123def4567890',
          containerName: 'kneo-e2e-kis-storage',
        },
      ],
    };
    let attempts = 0;
    let submitted: Record<string, unknown> | undefined;
    await page.route(`**${CONFLICTS_PATH}`, async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        json: envelope({ conflicts: [conflict] }),
        status: 200,
      });
    });
    await page.route(`**${CONFLICT_REPAIR_PATH}`, async (route) => {
      attempts += 1;
      submitted = postBody(route.request());
      await route.fulfill({
        contentType: 'application/json',
        json:
          attempts === 1
            ? { code: 500, data: null, message: 'kneo-e2e repair failed' }
            : envelope({}),
        status: 200,
      });
    });
    await page.goto('/ai/kis/settings');
    const scan = page.getByRole('button', {
      name: 'Scan and repair container name conflicts',
      exact: true,
    });

    await scan.click();
    let prompt = page.locator('.el-message-box:visible');
    await expect(prompt).toContainText('kneo-e2e-kis-storage');
    await prompt.getByRole('button', { name: 'Cancel', exact: true }).click();
    expect(attempts).toBe(0);

    await scan.click();
    prompt = page.locator('.el-message-box:visible');
    await prompt
      .getByRole('button', { name: 'Stop, Remove, and Start', exact: true })
      .click();
    await expect(page.getByText(/kneo-e2e repair failed/i).last()).toBeVisible();

    await scan.click();
    await page
      .locator('.el-message-box:visible')
      .getByRole('button', { name: 'Stop, Remove, and Start', exact: true })
      .click();
    expect(attempts).toBe(2);
    expect(submitted).toEqual({
      containerIds: ['abc123def4567890'],
      serviceName: 'kis_storage',
    });
    await expect(
      page.getByText(/Conflicting containers removed and kis_storage/i).last(),
    ).toBeVisible();
  });
});
