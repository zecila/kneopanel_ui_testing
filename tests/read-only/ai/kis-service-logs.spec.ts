import type { Locator, Page, Response } from '@playwright/test';

import { test, expect } from '../../fixtures/read-only-test';

interface ApiEnvelope<T> {
  code: number;
  data: T;
  message: string;
}

interface KisNode {
  advertiseHost: string;
  configured: boolean;
  discovered: boolean;
  ip: string;
  isLocal: boolean;
  lastError: string;
  lastHeartbeatAt: string;
  serviceStatuses: Record<string, string>;
  sshCredentialHost: string;
  sshCredentialPort: number;
  sshCredentialUsername: string;
  status: string;
}

interface ServiceLogData {
  logs: string;
  serviceName: string;
  source: string;
}

const API_ROOT = '/api/v2/core/settings/kis';
const NODES_PATH = `${API_ROOT}/nodes`;
const SERVICE_LOGS_PATH = `${API_ROOT}/ssh/logs`;

const FIRST_NODE = createNode('192.0.2.40', {
  kis_db: 'running',
  kis_provider: 'healthy',
});
const SECOND_NODE = createNode('192.0.2.41', {
  kis_gateway: 'running',
  kis_monitor: 'running',
});

function createNode(
  ip: string,
  serviceStatuses: Record<string, string>,
): KisNode {
  return {
    advertiseHost: ip,
    configured: true,
    discovered: false,
    ip,
    isLocal: false,
    lastError: '',
    lastHeartbeatAt: '2026-10-06T19:00:00Z',
    serviceStatuses,
    sshCredentialHost: ip,
    sshCredentialPort: 22,
    sshCredentialUsername: 'kneo-e2e-user',
    status: 'running',
  };
}

function serviceLogCard(page: Page): Locator {
  return page
    .locator('.el-card')
    .filter({ has: page.getByText('KIS Service Logs', { exact: true }) })
    .last();
}

async function routeSafeCoreLogs(page: Page): Promise<void> {
  await page.route('**/api/v2/files/read', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      json: { code: 200, data: '', message: '' },
      status: 200,
    });
  });
}

async function routeNodes(page: Page, nodes: KisNode[]): Promise<void> {
  await page.route(`**${NODES_PATH}`, async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      json: { code: 200, data: { items: nodes }, message: '' },
      status: 200,
    });
  });
}

async function routeEmptyHistory(page: Page): Promise<void> {
  await page.route(`**${API_ROOT}/model/background/jobs`, async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      json: { code: 200, data: { items: [], total: 0 }, message: '' },
      status: 200,
    });
  });
}

async function routeEmptyServiceLogs(page: Page): Promise<void> {
  await page.route(`**${SERVICE_LOGS_PATH}`, async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      json: {
        code: 200,
        data: { logs: '', serviceName: 'kis_db', source: 'docker' },
        message: '',
      },
      status: 200,
    });
  });
}

async function ensureExpanded(card: Locator): Promise<void> {
  const expand = card.getByRole('button', { name: 'Expand', exact: true });
  if (await expand.isVisible().catch(() => false)) {
    await expand.click();
  }
  await expect(
    card.getByRole('button', { name: 'Collapse', exact: true }),
  ).toBeVisible();
}

async function openLogs(page: Page): Promise<Locator> {
  const nodesResponse = page.waitForResponse(
    (response) =>
      response.request().method() === 'GET' &&
      new URL(response.url()).pathname === NODES_PATH,
  );
  await page.goto('/ai/kis/logs');
  const response = await nodesResponse;
  expect(response.ok()).toBe(true);
  const envelope = (await response.json()) as ApiEnvelope<{ items: KisNode[] }>;
  expect(envelope.code, envelope.message).toBe(200);
  const card = serviceLogCard(page);
  await expect(card).toBeVisible();
  await ensureExpanded(card);
  return card;
}

async function selectOption(
  page: Page,
  select: Locator,
  option: string,
): Promise<void> {
  await select.click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

async function loadServiceLogs(
  page: Page,
  card: Locator,
): Promise<Response> {
  const response = page.waitForResponse(
    (candidate) =>
      candidate.request().method() === 'POST' &&
      new URL(candidate.url()).pathname === SERVICE_LOGS_PATH,
  );
  await card.getByRole('button', { name: 'Load Logs', exact: true }).click();
  return response;
}

async function readServiceLogs(
  response: Response,
): Promise<ServiceLogData> {
  expect(response.ok()).toBe(true);
  const envelope = (await response.json()) as ApiEnvelope<ServiceLogData>;
  expect(envelope.code, envelope.message).toBe(200);
  expect(typeof envelope.data.logs).toBe('string');
  expect(envelope.data.serviceName.trim()).not.toBe('');
  expect(envelope.data.source.trim()).not.toBe('');
  return envelope.data;
}

test.describe('AI > KIS > Service logs [H,V,F,R,P,C,A]', () => {
  test('loads a live selected service with a secret-safe request contract', async ({
    page,
  }) => {
    await routeSafeCoreLogs(page);
    const card = await openLogs(page);
    const selects = card.locator('.el-select');
    await expect(selects).toHaveCount(3);
    const node = (await selects.nth(0).innerText()).trim();
    const service = (await selects.nth(1).innerText()).trim();
    expect(
      node,
      'KIS service logs are a core workflow and require a reported node.',
    ).not.toBe('Node');
    expect(
      service,
      'KIS service logs are a core workflow and require a reported service.',
    ).not.toBe('Service');

    await selectOption(page, selects.nth(2), '500');
    const response = await loadServiceLogs(page, card);
    const data = await readServiceLogs(response);
    const body = response.request().postDataJSON() as {
      host: unknown;
      password?: unknown;
      port: unknown;
      service: { name: unknown };
      tail: unknown;
      username?: unknown;
    };
    expect(typeof body.host).toBe('string');
    expect(String(body.host).trim()).not.toBe('');
    expect(Number.isSafeInteger(body.port)).toBe(true);
    expect(typeof body.username).toBe('string');
    expect(typeof body.password).toBe('string');
    expect(body.service.name).toBe(service);
    expect(body.tail).toBe(500);
    expect(data.serviceName).toBe(service);

    const viewer = card.locator('pre.log-viewer');
    if (data.logs.trim()) {
      await ensureExpanded(card);
      await expect(viewer).toBeVisible();
      expect((await viewer.textContent())?.trim()).not.toBe('');
    } else {
      await expect(card.getByText('No logs available', { exact: true })).toBeVisible();
    }
  });

  test('switches nodes, services, and every supported line limit', async ({
    page,
  }) => {
    await routeSafeCoreLogs(page);
    await routeNodes(page, [FIRST_NODE, SECOND_NODE]);
    await routeEmptyHistory(page);
    await routeEmptyServiceLogs(page);
    const card = await openLogs(page);
    const selects = card.locator('.el-select');

    await selects.nth(0).click();
    await expect(page.getByRole('option')).toHaveCount(2);
    await page
      .getByRole('option', { name: SECOND_NODE.ip, exact: true })
      .click();
    await expect(selects.nth(0)).toContainText(SECOND_NODE.ip);

    await selects.nth(1).click();
    await expect(page.getByRole('option')).toHaveCount(2);
    await expect(
      page.getByRole('option', { name: 'kis_gateway', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('option', { name: 'kis_monitor', exact: true }),
    ).toBeVisible();
    await page.getByRole('option', { name: 'kis_monitor', exact: true }).click();

    for (const limit of ['100', '200', '500', '1000']) {
      await selects.nth(2).click();
      await expect(
        page.getByRole('option', { name: limit, exact: true }),
      ).toBeVisible();
      await page.keyboard.press('Escape');
    }
    await selectOption(page, selects.nth(2), '1000');
    await expect(selects.nth(2)).toContainText('1000');
  });

  test('shows empty output, exposes failure, and retries safely', async ({
    page,
  }) => {
    const safeLogs = 'kneo-e2e-safe-log-alpha\nkneo-e2e-safe-log-beta';
    let attempts = 0;
    let responseMode: 'empty' | 'failure' | 'success' = 'empty';
    await routeSafeCoreLogs(page);
    await routeNodes(page, [FIRST_NODE]);
    await routeEmptyHistory(page);
    await page.route(`**${SERVICE_LOGS_PATH}`, async (route) => {
      attempts += 1;
      const json =
        responseMode === 'empty'
          ? {
              code: 200,
              data: { logs: '', serviceName: 'kis_db', source: 'docker' },
              message: '',
            }
          : responseMode === 'failure'
            ? {
                code: 500,
                data: null,
                message: 'kneo-e2e service logs unavailable',
              }
            : {
                code: 200,
                data: {
                  logs: safeLogs,
                  serviceName: 'kis_db',
                  source: 'docker',
                },
                message: '',
              };
      await route.fulfill({ contentType: 'application/json', json, status: 200 });
    });

    const initialResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === SERVICE_LOGS_PATH,
    );
    const card = await openLogs(page);
    expect((await readServiceLogs(await initialResponse)).logs).toBe('');
    await expect(card.getByText('No logs available', { exact: true })).toBeVisible();

    responseMode = 'failure';
    let response = await loadServiceLogs(page, card);
    expect((await response.json()) as ApiEnvelope<null>).toEqual({
      code: 500,
      data: null,
      message: 'kneo-e2e service logs unavailable',
    });
    await expect(
      page.getByText('kneo-e2e service logs unavailable').first(),
    ).toBeVisible();

    responseMode = 'success';
    response = await loadServiceLogs(page, card);
    expect((await readServiceLogs(response)).logs).toBe(safeLogs);
    await ensureExpanded(card);
    await expect(card.locator('pre.log-viewer')).toHaveText(safeLogs);
    expect(attempts).toBeGreaterThanOrEqual(3);
  });
});
