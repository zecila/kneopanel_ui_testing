import type { Locator, Page, Response } from '@playwright/test';

import { test, expect } from '../../fixtures/read-only-test';

interface ApiEnvelope<T> {
  code: number;
  data: T;
  message: string;
}

interface ProviderPreflight {
  currentGatewayHost?: string;
  currentGatewayLocal?: boolean;
  currentGatewayUrl?: string;
  gatewayRunning: boolean;
  localTarget: boolean;
  providerRunning: boolean;
}

interface KisNode {
  advertiseHost?: string;
  configured: boolean;
  discovered: boolean;
  ip: string;
  isLocal: boolean;
  lastError: string;
  lastHeartbeatAt: string;
  serviceStatuses: Record<string, string>;
  status: string;
}

interface NodeList {
  items: KisNode[];
}

const NODES_PATH = '/api/v2/core/settings/kis/nodes';
const PROVIDER_PREFLIGHT_PATH =
  '/api/v2/core/settings/kis/ssh/provider/preflight';
const SERVICE_OPERATION_PATH = '/api/v2/core/settings/kis/ssh/operate';

const HEALTHY_NODE: KisNode = {
  advertiseHost: '192.0.2.10',
  configured: true,
  discovered: false,
  ip: '192.0.2.10',
  isLocal: false,
  lastError: '',
  lastHeartbeatAt: '2026-10-06T19:00:00Z',
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

const DEGRADED_NODE: KisNode = {
  advertiseHost: '192.0.2.20',
  configured: true,
  discovered: false,
  ip: '192.0.2.20',
  isLocal: false,
  lastError: 'provider heartbeat expired',
  lastHeartbeatAt: '2026-10-06T18:00:00Z',
  serviceStatuses: {
    kis_db: 'running',
    kis_gateway: 'stopped',
    kis_monitor: 'error',
    kis_nginx: 'running',
    kis_provider: 'unhealthy',
    kis_queue_proxy: 'unknown',
    kis_storage: 'running',
  },
  status: 'degraded',
};

const SELECTABLE_LOCAL_NODE: KisNode = {
  ...HEALTHY_NODE,
  advertiseHost: '192.0.2.30',
  configured: false,
  discovered: true,
  ip: '192.0.2.30',
  isLocal: true,
};

function nodeRows(page: Page): Locator {
  return page.locator('.el-table__row');
}

async function readNodes(response: Response): Promise<NodeList> {
  expect(response.ok()).toBe(true);
  const envelope = (await response.json()) as ApiEnvelope<NodeList>;
  expect(envelope.code, envelope.message).toBe(200);
  expect(Array.isArray(envelope.data.items)).toBe(true);
  return envelope.data;
}

async function openNodes(page: Page): Promise<NodeList> {
  const response = page.waitForResponse(
    (candidate) =>
      candidate.request().method() === 'GET' &&
      new URL(candidate.url()).pathname === NODES_PATH,
  );
  await page.goto('/ai/kis/nodes');
  return readNodes(await response);
}

async function findNodeRow(page: Page, node: KisNode): Promise<Locator> {
  const rows = nodeRows(page);
  for (let index = 0; index < (await rows.count()); index += 1) {
    const row = rows.nth(index);
    const displayedNode = (await row.locator('td').nth(0).innerText()).trim();
    if (
      displayedNode === node.ip ||
      displayedNode === `${node.ip} (local)` ||
      displayedNode === node.advertiseHost
    ) {
      return row;
    }
  }
  throw new Error(`Expected one KIS node row for ${node.ip}.`);
}

function displayedServiceStatus(status: string): string {
  return status === 'running' ? 'healthy' : status;
}

async function expectNodeRows(page: Page, nodes: NodeList): Promise<void> {
  await expect(nodeRows(page)).toHaveCount(nodes.items.length);
  for (const node of nodes.items) {
    const row = await findNodeRow(page, node);
    const cells = row.locator('td');
    await expect(cells).toHaveCount(5);
    expect((await cells.nth(1).innerText()).trim()).not.toBe('');
    expect((await cells.nth(2).innerText()).trim()).not.toBe('');
    for (const [service, status] of Object.entries(node.serviceStatuses)) {
      await expect(cells.nth(3)).toContainText(
        `${service}: ${displayedServiceStatus(status)}`,
      );
    }
    if (node.lastError) {
      await expect(row).toContainText(`Last operation error: ${node.lastError}`);
    }
  }
}

async function mockNodeInventory(
  page: Page,
  handler: Parameters<Page['route']>[1],
): Promise<void> {
  await page.route(`**${NODES_PATH}`, handler);
  await page.route(`**${NODES_PATH}/stream`, async (route) => {
    await route.fulfill({
      body: 'event: complete\ndata: {}\n\n',
      contentType: 'text/event-stream',
      status: 200,
    });
  });
}

test.describe('AI > KIS > Nodes [H,V,F,R,P,C,A]', () => {
  test(
    'maps every live node and service status from the API and refreshes',
    { tag: '@smoke' },
    async ({ page }) => {
      const nodes = await openNodes(page);
      for (const column of [
        'Node',
        'Node State',
        'Last Provider Heartbeat',
        'Service Status',
        'Operation',
      ]) {
        await expect(
          page.getByRole('columnheader', { name: column, exact: true }),
        ).toBeVisible();
      }
      await expectNodeRows(page, nodes);

      const refreshedResponse = page.waitForResponse(
        (candidate) =>
          candidate.request().method() === 'GET' &&
          new URL(candidate.url()).pathname === NODES_PATH,
      );
      await page.getByRole('button', { name: 'Refresh', exact: true }).click();
      const refreshed = await readNodes(await refreshedResponse);
      await expectNodeRows(page, refreshed);
    },
  );

  test('renders an explicit no-provider state', async ({ page }) => {
    await mockNodeInventory(page, async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        json: { code: 200, data: { items: [] }, message: '' },
        status: 200,
      });
    });

    const nodes = await openNodes(page);
    expect(nodes.items).toEqual([]);
    await expectNodeRows(page, nodes);
    await expect(page.getByText('No Data', { exact: true })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Apply', exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole('button', { name: 'Refresh', exact: true }),
    ).toBeEnabled();
  });

  test('shows healthy and degraded nodes with exact failure details', async ({
    page,
  }) => {
    const mockedNodes = { items: [HEALTHY_NODE, DEGRADED_NODE] };
    await mockNodeInventory(page, async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        json: { code: 200, data: mockedNodes, message: '' },
        status: 200,
      });
    });

    const nodes = await openNodes(page);
    expect(nodes).toEqual(mockedNodes);
    await expectNodeRows(page, nodes);
    await expect((await findNodeRow(page, HEALTHY_NODE)).locator('td').nth(1))
      .toContainText('healthy');
    await expect((await findNodeRow(page, DEGRADED_NODE)).locator('td').nth(1))
      .toContainText('unknown');
  });

  test('reports an unavailable inventory and recovers on Refresh', async ({
    page,
  }) => {
    let attempts = 0;
    await mockNodeInventory(page, async (route) => {
      attempts += 1;
      await route.fulfill({
        contentType: 'application/json',
        json:
          attempts === 1
            ? {
                code: 500,
                data: null,
                message: 'kneo-e2e node inventory unavailable',
              }
            : { code: 200, data: { items: [HEALTHY_NODE] }, message: '' },
        status: 200,
      });
    });

    const rejected = page.waitForResponse(
      (response) =>
        response.request().method() === 'GET' &&
        new URL(response.url()).pathname === NODES_PATH,
    );
    await page.goto('/ai/kis/nodes');
    expect((await (await rejected).json()) as ApiEnvelope<null>).toEqual({
      code: 500,
      data: null,
      message: 'kneo-e2e node inventory unavailable',
    });
    await expect(
      page.getByText('kneo-e2e node inventory unavailable').first(),
    ).toBeVisible();
    await expect(nodeRows(page)).toHaveCount(0);

    const recoveredResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'GET' &&
        new URL(response.url()).pathname === NODES_PATH,
    );
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    const recovered = await readNodes(await recoveredResponse);
    expect(attempts).toBe(2);
    await expectNodeRows(page, recovered);
  });

  test('selects zero, one, and every service without invoking an operation', async ({
    page,
  }) => {
    await mockNodeInventory(page, async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        json: {
          code: 200,
          data: { items: [SELECTABLE_LOCAL_NODE] },
          message: '',
        },
        status: 200,
      });
    });
    await openNodes(page);
    const row = await findNodeRow(page, SELECTABLE_LOCAL_NODE);
    let operationRequests = 0;
    page.on('request', (request) => {
      if (
        request.method() === 'POST' &&
        new URL(request.url()).pathname === SERVICE_OPERATION_PATH
      ) {
        operationRequests += 1;
      }
    });

    await row.getByRole('button', { name: 'Deselect all', exact: true }).click();
    await expect(row).toContainText('Select services');

    await row.locator('.el-select').click();
    const options = page.getByRole('option');
    await expect(options).toHaveCount(7);
    await options.filter({ hasText: /^kis_db$/ }).click();
    await page.keyboard.press('Escape');
    await expect(row).toContainText('kis_db');

    await row.getByRole('button', { name: 'Select all', exact: true }).click();
    await expect(row).toContainText('+ 6');
    await row.getByRole('button', { name: 'Deselect all', exact: true }).click();
    await expect(row).toContainText('Select services');
    expect(operationRequests).toBe(0);
  });

  test('Provider reapply preflight: opens and cancels confirmation without an internal server error', async ({
    page,
  }) => {
    test.info().annotations.push({
      type: 'pending-reproduction',
      description:
        'docs/bugs/2026-10-01/REVIEWER-TEST-REPORT.md#kis-internal-server-error',
    });

    await openNodes(page);
    const reapplyButton = page.getByRole('button', {
      name: 'Reapply',
      exact: true,
    });
    await expect(page.locator('.el-table__row').first()).toBeVisible();
    test.skip(
      (await reapplyButton.count()) === 0,
      'KIS did not report a Provider node with a Reapply action.',
    );

    const preflightResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === PROVIDER_PREFLIGHT_PATH,
    );
    await reapplyButton.first().click();

    const response = await preflightResponse;
    expect(response.ok()).toBe(true);
    const envelope = (await response.json()) as ApiEnvelope<ProviderPreflight>;
    expect(envelope.code, envelope.message).toBe(200);
    expect(typeof envelope.data.gatewayRunning).toBe('boolean');
    expect(typeof envelope.data.providerRunning).toBe('boolean');

    const confirmation = page
      .locator('.el-dialog:visible')
      .filter({ hasText: 'Confirm Provider Configuration' });
    await expect(confirmation).toBeVisible();
    await expect(confirmation).toContainText('Apply provider configuration');
    await expect(page.getByText(/internal server error/i)).toHaveCount(0);

    await confirmation
      .getByRole('button', { name: 'Cancel', exact: true })
      .click();
    await expect(confirmation).toBeHidden();
  });
});
