import type { Locator, Page, Response } from '@playwright/test';

import { test, expect } from '../../fixtures/read-only-test';

interface ApiEnvelope<T> {
  code: number;
  data: T;
  message: string;
}

interface DashboardBase {
  cpuCores: number;
  cpuLogicalCores: number;
  hostname: string;
  ipV4Addr: string;
  kernelArch: string;
  kernelVersion: string;
  platformVersion: string;
  prettyDistro: string;
}

interface DashboardCurrent {
  memoryTotal: number;
  memoryUsed: number;
  timeSinceUptime: string;
  uptime: number;
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

interface ModelSummary {
  modelName: string;
  readinessStatus: string;
  version: string;
  versions: string[];
}

interface OverviewData {
  base: DashboardBase;
  current: DashboardCurrent;
  models: ModelSummary[];
  nodes: KisNode[];
}

const BASE_PATH = '/api/v2/dashboard/base/all/all';
const CURRENT_PATH = '/api/v2/dashboard/current/all/all';
const NODES_PATH = '/api/v2/core/settings/kis/nodes';
const MODELS_PATH = '/api/v2/core/settings/kis/models/available';

const HEALTHY_LOCAL_NODE: KisNode = {
  advertiseHost: '192.0.2.10',
  configured: false,
  discovered: true,
  ip: '192.0.2.10',
  isLocal: true,
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

const DEGRADED_REMOTE_NODE: KisNode = {
  advertiseHost: '192.0.2.20',
  configured: true,
  discovered: false,
  ip: '192.0.2.20',
  isLocal: false,
  lastError: 'kneo-e2e provider heartbeat expired',
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

const SAFE_MODELS: ModelSummary[] = [
  {
    modelName: 'kneo-e2e-overview-alpha',
    readinessStatus: 'Ready',
    version: 'v1',
    versions: ['v1'],
  },
  {
    modelName: 'kneo-e2e-overview-beta',
    readinessStatus: 'Not Ready',
    version: 'v2',
    versions: ['v1', 'v2'],
  },
];

async function readEnvelope<T>(response: Response): Promise<T> {
  expect(response.ok()).toBe(true);
  const envelope = (await response.json()) as ApiEnvelope<T>;
  expect(envelope.code, envelope.message).toBe(200);
  return envelope.data;
}

function responseFor(page: Page, method: string, path: string): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === method &&
      new URL(response.url()).pathname === path,
  );
}

async function openOverview(page: Page): Promise<OverviewData> {
  const baseResponse = responseFor(page, 'GET', BASE_PATH);
  const currentResponse = responseFor(page, 'GET', CURRENT_PATH);
  const nodesResponse = responseFor(page, 'GET', NODES_PATH);
  const modelsResponse = responseFor(page, 'POST', MODELS_PATH);
  await page.goto('/');

  const [base, current, nodeData, modelData] = await Promise.all([
    baseResponse.then(readEnvelope<DashboardBase>),
    currentResponse.then(readEnvelope<DashboardCurrent>),
    nodesResponse.then(readEnvelope<{ items: KisNode[] }>),
    modelsResponse.then(readEnvelope<{ items: ModelSummary[] }>),
  ]);
  return {
    base,
    current,
    models: modelData.items,
    nodes: nodeData.items,
  };
}

async function reloadOverview(page: Page): Promise<OverviewData> {
  const baseResponse = responseFor(page, 'GET', BASE_PATH);
  const currentResponse = responseFor(page, 'GET', CURRENT_PATH);
  const nodesResponse = responseFor(page, 'GET', NODES_PATH);
  const modelsResponse = responseFor(page, 'POST', MODELS_PATH);
  await page.reload();

  const [base, current, nodeData, modelData] = await Promise.all([
    baseResponse.then(readEnvelope<DashboardBase>),
    currentResponse.then(readEnvelope<DashboardCurrent>),
    nodesResponse.then(readEnvelope<{ items: KisNode[] }>),
    modelsResponse.then(readEnvelope<{ items: ModelSummary[] }>),
  ]);
  return {
    base,
    current,
    models: modelData.items,
    nodes: nodeData.items,
  };
}

function systemValue(page: Page, label: string): Locator {
  return page
    .getByText(label, { exact: true })
    .first()
    .locator('xpath=ancestor::tr[1]')
    .locator('td.system-content')
    .first();
}

function kisSummaryValue(page: Page, label: string): Locator {
  return page
    .getByText(label, { exact: true })
    .locator('xpath=ancestor::div[contains(@class, "el-col")][1]')
    .locator('.count');
}

async function expectSystemData(
  page: Page,
  base: DashboardBase,
  current: DashboardCurrent,
): Promise<void> {
  for (const [name, value] of Object.entries({
    Architecture: base.kernelArch,
    Hostname: base.hostname,
    Kernel: base.kernelVersion,
    'Local IP': base.ipV4Addr,
    Uptime: current.timeSinceUptime,
  })) {
    expect(value, `${name} API value must not be empty`).not.toBe('');
    await expect(systemValue(page, name)).toHaveText(String(value));
  }

  expect(base.prettyDistro).not.toBe('');
  await expect(systemValue(page, 'Operating system')).toContainText(
    base.prettyDistro,
  );
  if (base.platformVersion) {
    await expect(systemValue(page, 'Operating system')).toContainText(
      base.platformVersion,
    );
  }

  expect(Number.isFinite(current.uptime)).toBe(true);
  await expect(systemValue(page, 'Up since')).not.toHaveText(/^\s*(?:-|N\/A)?\s*$/i);

  await expect(
    page
      .locator('#dashboard .input-help')
      .filter({ hasText: `${base.cpuLogicalCores} ) cores` }),
  ).toBeVisible();

  const memoryText = await page
    .locator('#dashboard .input-help')
    .filter({ hasText: /GB\s*\/\s*\d+(?:\.\d+)?\s*GB/ })
    .innerText();
  const memory = memoryText.match(
    /(\d+(?:\.\d+)?)\s*GB\s*\/\s*(\d+(?:\.\d+)?)\s*GB/,
  );
  expect(memory, `Expected used/total memory, received: ${memoryText}`).not.toBeNull();
  const bytesPerGiB = 1024 ** 3;
  expect(Number(memory?.[1])).toBeCloseTo(current.memoryUsed / bytesPerGiB, 0);
  expect(Number(memory?.[2])).toBeCloseTo(current.memoryTotal / bytesPerGiB, 0);
}

async function expectKisSummary(
  page: Page,
  nodes: KisNode[],
  models: ModelSummary[],
): Promise<void> {
  await expect(kisSummaryValue(page, 'Total Providers')).toHaveText(
    String(nodes.length),
  );
  await expect(kisSummaryValue(page, 'Total Models')).toHaveText(
    nodes.length === 0 ? '-' : String(models.length),
  );

  const local = nodes.find((node) => node.isLocal);
  const gatewayHealthy = local?.serviceStatuses.kis_gateway === 'running';
  const providerHealthy = local?.serviceStatuses.kis_provider === 'healthy';
  await expect(kisSummaryValue(page, 'KIS Gateway')).toHaveText(
    gatewayHealthy ? 'Healthy' : 'Unhealthy',
  );
  await expect(kisSummaryValue(page, 'Local Provider')).toHaveText(
    providerHealthy ? 'Healthy' : 'Stopped',
  );
}

async function routeKisSummary(
  page: Page,
  readState: () => { models: ModelSummary[]; nodes: KisNode[] },
): Promise<void> {
  await page.route(`**${NODES_PATH}`, async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      json: {
        code: 200,
        data: { items: readState().nodes, kisDBCompatibility: true },
        message: '',
      },
      status: 200,
    });
  });
  await page.route(`**${MODELS_PATH}`, async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      json: {
        code: 200,
        data: { items: readState().models, total: readState().models.length },
        message: '',
      },
      status: 200,
    });
  });
}

test.describe('Overview health and system information [H,F,R,P,C,A]', () => {
  test('maps live identity, telemetry, and KIS summaries to their API values', async ({
    page,
  }) => {
    const overview = await openOverview(page);
    await expectSystemData(page, overview.base, overview.current);
    await expectKisSummary(page, overview.nodes, overview.models);

    const refreshed = await reloadOverview(page);
    await expectSystemData(page, refreshed.base, refreshed.current);
    await expectKisSummary(page, refreshed.nodes, refreshed.models);
  });

  test('updates KIS summaries from empty to multiple resources on reload', async ({
    page,
  }) => {
    let state: { models: ModelSummary[]; nodes: KisNode[] } = {
      models: [],
      nodes: [],
    };
    await routeKisSummary(page, () => state);

    const emptyNodes = responseFor(page, 'GET', NODES_PATH);
    await page.goto('/');
    const emptyNodeData = await readEnvelope<{ items: KisNode[] }>(
      await emptyNodes,
    );
    await expectKisSummary(page, emptyNodeData.items, []);

    state = {
      models: SAFE_MODELS,
      nodes: [HEALTHY_LOCAL_NODE, DEGRADED_REMOTE_NODE],
    };
    const overview = await reloadOverview(page);
    await expectKisSummary(page, overview.nodes, overview.models);
    await expect(
      kisSummaryValue(page, 'KIS Gateway').locator('span'),
    ).toHaveClass(/is-healthy/);
    await expect(
      kisSummaryValue(page, 'Local Provider').locator('span'),
    ).toHaveClass(/is-healthy/);
  });

  test('shows unavailable KIS feedback and recovers on reload', async ({ page }) => {
    let nodesUnavailable = true;
    let modelsUnavailable = true;
    await page.route(`**${NODES_PATH}`, async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        json: nodesUnavailable
          ? {
              code: 500,
              data: null,
              message: 'kneo-e2e KIS node summary unavailable',
            }
          : {
              code: 200,
              data: { items: [HEALTHY_LOCAL_NODE], kisDBCompatibility: true },
              message: '',
            },
        status: 200,
      });
    });
    await page.route(`**${MODELS_PATH}`, async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        json: modelsUnavailable
          ? {
              code: 500,
              data: null,
              message: 'kneo-e2e model summary unavailable',
            }
          : {
              code: 200,
              data: { items: SAFE_MODELS, total: SAFE_MODELS.length },
              message: '',
            },
        status: 200,
      });
    });

    const failedNodes = responseFor(page, 'GET', NODES_PATH);
    await page.goto('/');
    await failedNodes;
    await expect(
      page.getByText('kneo-e2e KIS node summary unavailable').first(),
    ).toBeVisible();
    await expect(kisSummaryValue(page, 'Total Models')).toHaveText('-');

    nodesUnavailable = false;
    const recoveredNodes = responseFor(page, 'GET', NODES_PATH);
    const failedModels = responseFor(page, 'POST', MODELS_PATH);
    await page.reload();
    await Promise.all([recoveredNodes, failedModels]);
    await expect(
      page.getByText('kneo-e2e model summary unavailable').first(),
    ).toBeVisible();

    modelsUnavailable = false;
    const recovered = await reloadOverview(page);
    await expectKisSummary(page, recovered.nodes, recovered.models);
    await expect(
      page.getByText('kneo-e2e KIS node summary unavailable'),
    ).toHaveCount(0);
    await expect(page.getByText('kneo-e2e model summary unavailable')).toHaveCount(
      0,
    );
  });
});
