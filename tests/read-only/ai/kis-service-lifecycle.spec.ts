import type { Locator, Page, Request } from '@playwright/test';

import { test, expect } from '../../fixtures/read-only-test';

interface KisNode {
  advertiseHost: string;
  configured: boolean;
  discovered: boolean;
  ip: string;
  isLocal: boolean;
  lastError: string;
  lastHeartbeatAt: string;
  providerGatewayHost?: string;
  providerGatewayLocal?: boolean;
  serviceStatuses: Record<string, string>;
  status: string;
}

const NODES_PATH = '/api/v2/core/settings/kis/nodes';
const OPERATE_PATH = '/api/v2/core/settings/kis/ssh/operate';
const GATEWAY_START_PATH = '/api/v2/core/settings/kis/gateway/start';
const PREFLIGHT_PATH = '/api/v2/core/settings/kis/ssh/provider/preflight';
const PROVIDER_APPLY_PATH = '/api/v2/core/settings/kis/ssh/provider/apply';
const PROVIDER_DELETE_PATH = '/api/v2/core/settings/kis/provider/delete';
const TOPOLOGY_PATH = '/api/v2/core/settings/kis/storage/topology';

const LOCAL_NODE: KisNode = {
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
    kis_monitor: 'running',
    kis_nginx: 'running',
    kis_provider: 'healthy',
    kis_queue_proxy: 'running',
    kis_storage: 'running',
  },
  status: 'running',
};

const REMOTE_NODE: KisNode = {
  ...LOCAL_NODE,
  advertiseHost: '192.0.2.44',
  ip: '192.0.2.44',
  isLocal: false,
  providerGatewayHost: '192.0.2.30',
};

function envelope(data: unknown, code = 200, message = ''): object {
  return { code, data, message };
}

async function routeNodes(page: Page, nodes: () => KisNode[]): Promise<void> {
  await page.route(`**${NODES_PATH}`, async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      json: envelope({ items: nodes() }),
      status: 200,
    });
  });
  await page.route(`**${NODES_PATH}/stream`, async (route) => {
    await route.fulfill({
      body: 'event: complete\ndata: {}\n\n',
      contentType: 'text/event-stream',
      status: 200,
    });
  });
}

async function routeCompatibleTopology(page: Page): Promise<void> {
  await page.route(`**${TOPOLOGY_PATH}`, async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      json: envelope({
        compatible: true,
        providerStorageMode: 'storage_cached',
        gatewayStorageMode: 'storage_cached',
        expectedProviderMode: 'storage_cached',
        providerEndpoint: 'http://192.0.2.30:8080',
        gatewayEndpoint: 'http://192.0.2.30:8080',
        repairSupported: true,
        repairOptions: null,
        remoteProviderCount: 0,
        remoteProviderInventoryAvailable: true,
      }),
      status: 200,
    });
  });
}

function rowFor(page: Page, ip: string): Locator {
  return page.locator('.el-table__row').filter({ hasText: ip }).first();
}

function requestBody(request: Request): Record<string, unknown> {
  return request.postDataJSON() as Record<string, unknown>;
}

test.describe('KIS service and Provider lifecycle compatibility [H,V,F,R,X,A]', () => {
  test('stops a selected service, persists the result, and retries failure', async ({
    page,
  }) => {
    const node = structuredClone(LOCAL_NODE);
    await routeNodes(page, () => [node]);
    let attempts = 0;
    let lastBody: Record<string, unknown> | undefined;
    await page.route(`**${OPERATE_PATH}`, async (route) => {
      attempts += 1;
      lastBody = requestBody(route.request());
      if (attempts === 1) {
        await route.fulfill({
          contentType: 'application/json',
          json: envelope(null, 500, 'kneo-e2e service operation failed'),
          status: 200,
        });
        return;
      }
      node.serviceStatuses.kis_db = 'stopped';
      await route.fulfill({
        contentType: 'application/json',
        json: envelope({ results: { kis_db: 'ok' }, diskSpaceIssues: [] }),
        status: 200,
      });
    });

    await page.goto('/ai/kis/nodes');
    const row = rowFor(page, node.ip);
    await row.getByRole('button', { name: 'Deselect all', exact: true }).click();
    await row.locator('.el-select').click();
    await page.getByRole('option', { name: 'kis_db', exact: true }).click();
    await page.keyboard.press('Escape');

    await row.getByRole('button', { name: 'Stop', exact: true }).click();
    await expect(page.getByText('kneo-e2e service operation failed').last()).toBeVisible();
    await row.getByRole('button', { name: 'Stop', exact: true }).click();

    expect(attempts).toBe(2);
    expect(lastBody).toMatchObject({
      host: '127.0.0.1',
      providerHost: node.ip,
      services: [{ name: 'kis_db' }],
      operate: 'stop',
    });
    await expect(row).toContainText('kis_db: stopped');
    await page.reload();
    await expect(rowFor(page, node.ip)).toContainText('kis_db: stopped');
  });

  test('cancels and then confirms Clean Restart without reaching the server', async ({
    page,
  }) => {
    const node = structuredClone(LOCAL_NODE);
    await routeNodes(page, () => [node]);
    let requests = 0;
    let operation = '';
    await page.route(`**${OPERATE_PATH}`, async (route) => {
      requests += 1;
      operation = String(requestBody(route.request()).operate);
      await route.fulfill({
        contentType: 'application/json',
        json: envelope({
          results: { kis_provider: 'ok' },
          diskSpaceIssues: [],
          containerConflicts: [],
        }),
        status: 200,
      });
    });
    await page.goto('/ai/kis/nodes');
    const cleanRestart = rowFor(page, node.ip).getByRole('button', {
      name: 'Clean Restart',
      exact: true,
    });

    await cleanRestart.click();
    const prompt = page.locator('.el-message-box:visible');
    await expect(prompt).toContainText(/delete uploaded models/i);
    await prompt.getByRole('button', { name: 'Cancel', exact: true }).click();
    expect(requests).toBe(0);

    await cleanRestart.click();
    await page
      .locator('.el-message-box:visible')
      .getByRole('button', { name: 'Clean Restart', exact: true })
      .click();
    expect(requests).toBe(1);
    expect(operation).toBe('recreate');
  });

  test('starts a stopped Gateway and refreshes its dependent services', async ({
    page,
  }) => {
    const node = structuredClone(LOCAL_NODE);
    node.serviceStatuses.kis_gateway = 'stopped';
    await routeNodes(page, () => [node]);
    let starts = 0;
    await page.route(`**${GATEWAY_START_PATH}`, async (route) => {
      starts += 1;
      node.serviceStatuses.kis_gateway = 'running';
      await route.fulfill({
        contentType: 'application/json',
        json: envelope({
          results: {
            kis_db: 'ok',
            kis_gateway: 'ok',
            kis_provider: 'ok',
            kis_queue_proxy: 'ok',
          },
          diskSpaceIssues: [],
          containerConflicts: [],
        }),
        status: 200,
      });
    });

    await page.goto('/ai/kis/nodes');
    await page.getByRole('button', { name: 'Start KIS Gateway' }).click();
    expect(starts).toBe(1);
    await expect(rowFor(page, node.ip)).toContainText('kis_gateway: healthy');
  });

  test('preflights, confirms, and removes one synthetic Provider', async ({
    page,
  }) => {
    let nodes = [structuredClone(LOCAL_NODE)];
    await routeNodes(page, () => nodes);
    await routeCompatibleTopology(page);
    let deletedProvider = '';
    await page.route(`**${PREFLIGHT_PATH}`, async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        json: envelope({
          gatewayRunning: true,
          localTarget: false,
          providerRunning: false,
          currentGatewayHost: '',
          currentGatewayLocal: false,
          currentGatewayUrl: '',
        }),
        status: 200,
      });
    });
    await page.route(`**${PROVIDER_APPLY_PATH}`, async (route) => {
      nodes = [nodes[0], structuredClone(REMOTE_NODE)];
      await route.fulfill({
        contentType: 'application/json',
        json: envelope({ results: { kis_provider: 'ok' } }),
        status: 200,
      });
    });
    await page.route(`**${PROVIDER_DELETE_PATH}`, async (route) => {
      deletedProvider = String(requestBody(route.request()).providerHost);
      nodes = [nodes[0]];
      await route.fulfill({
        contentType: 'application/json',
        json: envelope({}),
        status: 200,
      });
    });

    await page.goto('/ai/kis/nodes');
    const providerIp = page
      .locator('.el-form-item')
      .filter({ hasText: 'Provider Node IP' })
      .locator('input');
    await providerIp.fill(REMOTE_NODE.ip);
    await page.getByRole('button', { name: 'Apply', exact: true }).click();
    const confirmation = page
      .locator('.el-dialog:visible')
      .filter({ hasText: 'Confirm Provider Configuration' });
    await expect(confirmation).toBeVisible();
    const applyRequestPromise = page.waitForRequest(
      (request) => new URL(request.url()).pathname === PROVIDER_APPLY_PATH,
    );
    await confirmation
      .getByRole('button', { name: 'Confirm Apply', exact: true })
      .click();
    const applyBody = requestBody(await applyRequestPromise);

    expect(applyBody).toMatchObject({
      host: REMOTE_NODE.ip,
      providerIp: REMOTE_NODE.ip,
      operate: 'start',
    });
    await expect(rowFor(page, REMOTE_NODE.ip)).toBeVisible();

    await rowFor(page, REMOTE_NODE.ip)
      .getByRole('button', { name: 'Delete Node', exact: true })
      .click();
    await page
      .locator('.el-message-box:visible')
      .getByRole('button', { name: 'Delete Node', exact: true })
      .click();
    expect(deletedProvider).toBe(REMOTE_NODE.ip);
    await expect(rowFor(page, REMOTE_NODE.ip)).toHaveCount(0);
  });
});
