import type { Page, Request, Response } from '@playwright/test';

import { test, expect } from '../../fixtures/read-only-test';

interface ApiEnvelope<T> {
  code: number;
  data: T;
  message: string;
}

interface ContainerItem {
  appInstallName: string;
  appName: string;
  containerID: string;
  createTime: string;
  description: string;
  imageID: string;
  imageName: string;
  isFromApp: boolean;
  isFromCompose: boolean;
  isPinned: boolean;
  name: string;
  network: string[];
  ports: string[];
  runTime: string;
  state: string;
  websites: string[];
}

interface ContainerStat {
  containerID: string;
  cpuPercent: number;
  cpuTotalUsage: number;
  memoryCache: number;
  memoryLimit: number;
  memoryPercent: number;
  memoryUsage: number;
  percpuUsage: number;
  systemUsage: number;
}

interface ContainerList {
  items: ContainerItem[];
  total: number;
}

const DOCKER_STATUS_PATH = '/api/v2/containers/docker/status';
const INSPECT_PATH = '/api/v2/containers/inspect';
const INVENTORY_PATH = '/api/v2/containers/search';
const LOG_PATH = '/api/v2/containers/search/log';
const STATS_PATH = '/api/v2/containers/list/stats';
const STATUS_PATH = '/api/v2/containers/status';

const SAFE_CONTAINER: ContainerItem = {
  appInstallName: '',
  appName: '',
  containerID: 'kneo-e2e-container-details-id',
  createTime: '2026-10-07T18:00:00Z',
  description: 'kneo-e2e safe container details',
  imageID: 'sha256:kneo-e2e-details',
  imageName: 'example.invalid/kneo-e2e:details',
  isFromApp: false,
  isFromCompose: false,
  isPinned: false,
  name: 'kneo-e2e-container-details',
  network: ['192.0.2.42'],
  ports: ['127.0.0.1:42042->8042/tcp'],
  runTime: '2 minutes',
  state: 'running',
  websites: [],
};

const SAFE_STAT: ContainerStat = {
  containerID: SAFE_CONTAINER.containerID,
  cpuPercent: 12.5,
  cpuTotalUsage: 100,
  memoryCache: 1024,
  memoryLimit: 512 * 1024 * 1024,
  memoryPercent: 12.5,
  memoryUsage: 64 * 1024 * 1024,
  percpuUsage: 4,
  systemUsage: 1_000,
};

const SAFE_INSPECT = {
  Args: ['kneo-e2e-safe'],
  Config: {
    Cmd: ['echo', 'kneo-e2e-safe'],
    Entrypoint: ['/bin/sh'],
    Env: ['KNEO_E2E_SAFE=1'],
    Hostname: 'kneo-e2e-host',
    Image: SAFE_CONTAINER.imageName,
    WorkingDir: '/tmp/kneo-e2e-work',
  },
  Created: '2026-10-07T18:00:00Z',
  HostConfig: {
    NetworkMode: 'kneo-e2e-network',
    RestartPolicy: { MaximumRetryCount: 0, Name: 'no' },
  },
  Id: SAFE_CONTAINER.containerID,
  Image: SAFE_CONTAINER.imageID,
  Mounts: [
    {
      Destination: '/tmp/kneo-e2e-destination',
      Mode: 'rw',
      Propagation: 'rprivate',
      RW: true,
      Source: '/tmp/kneo-e2e-source',
      Type: 'bind',
    },
  ],
  Name: `/${SAFE_CONTAINER.name}`,
  NetworkSettings: {
    Networks: {
      'kneo-e2e-network': {
        EndpointID: 'kneo-e2e-endpoint-id',
        Gateway: '192.0.2.1',
        IPAddress: '192.0.2.42',
        IPv6Gateway: '',
        MacAddress: '02:42:c0:00:02:2a',
        NetworkID: 'kneo-e2e-network-id',
      },
    },
  },
  Path: '/bin/sh',
  State: {
    Dead: false,
    Error: '',
    ExitCode: 0,
    FinishedAt: '0001-01-01T00:00:00Z',
    OOMKilled: false,
    Paused: false,
    Pid: 4242,
    Restarting: false,
    Running: true,
    StartedAt: '2026-10-07T18:00:01Z',
    Status: 'running',
  },
};

function apiResponse(page: Page, method: string, path: string): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === method &&
      new URL(response.url()).pathname === path,
  );
}

function logRequest(page: Page): Promise<Request> {
  return page.waitForRequest(
    (request) =>
      request.method() === 'GET' && new URL(request.url()).pathname === LOG_PATH,
  );
}

function queryOf(request: Request): Record<string, string> {
  return Object.fromEntries(new URL(request.url()).searchParams.entries());
}

function safeRow(page: Page) {
  return page
    .locator('.el-table__row')
    .filter({ hasText: SAFE_CONTAINER.name })
    .first();
}

async function routeSyntheticContainer(page: Page): Promise<void> {
  await page.route(`**${DOCKER_STATUS_PATH}`, (route) =>
    route.fulfill({
      json: {
        code: 200,
        data: { isActive: true, isExist: true },
        message: '',
      },
    }),
  );
  await page.route(`**${STATUS_PATH}`, (route) =>
    route.fulfill({
      json: {
        code: 200,
        data: {
          composeCount: 0,
          composeTemplateCount: 0,
          containerCount: 1,
          created: 0,
          dead: 0,
          exited: 0,
          imageCount: 1,
          networkCount: 1,
          paused: 0,
          removing: 0,
          repoCount: 1,
          restarting: 0,
          running: 1,
          volumeCount: 0,
        },
        message: '',
      },
    }),
  );
  await page.route(`**${INVENTORY_PATH}`, (route) =>
    route.fulfill({
      json: {
        code: 200,
        data: { items: [SAFE_CONTAINER], total: 1 },
        message: '',
      },
    }),
  );
  await page.route(`**${STATS_PATH}`, (route) =>
    route.fulfill({
      json: { code: 200, data: [SAFE_STAT], message: '' },
    }),
  );
}

async function openSyntheticInventory(page: Page): Promise<void> {
  await routeSyntheticContainer(page);
  await page.goto('/containers/container');
  await expect(safeRow(page)).toBeVisible();
}

test.describe('Containers > Details, stats, and logs [H,V,F,R,P,C,A]', () => {
  test('maps the live statistics contract to inventory rows without exposing values', async ({
    page,
  }) => {
    const inventoryPending = apiResponse(page, 'POST', INVENTORY_PATH);
    const statsPending = apiResponse(page, 'GET', STATS_PATH);
    await page.goto('/containers/container');
    const inventoryEnvelope = (await (
      await inventoryPending
    ).json()) as ApiEnvelope<ContainerList>;
    const statsEnvelope = (await (
      await statsPending
    ).json()) as ApiEnvelope<ContainerStat[]>;
    expect(inventoryEnvelope.code, inventoryEnvelope.message).toBe(200);
    expect(statsEnvelope.code, statsEnvelope.message).toBe(200);
    expect(Array.isArray(statsEnvelope.data)).toBe(true);
    if (statsEnvelope.data.length > 0) {
      expect(Object.keys(statsEnvelope.data[0]).sort()).toEqual(
        Object.keys(SAFE_STAT).sort(),
      );
    }

    const inventoryIDs = new Set(
      inventoryEnvelope.data.items.map((item) => item.containerID),
    );
    expect(
      statsEnvelope.data.every((stat) => inventoryIDs.has(stat.containerID)),
      'Every live statistics record should belong to a container in the live inventory.',
    ).toBe(true);

    const rowTexts = await page.locator('.el-table__row').evaluateAll((rows) =>
      rows.map((row) => row.textContent?.replace(/\s+/g, ' ') ?? ''),
    );
    const statsByID = new Map(
      statsEnvelope.data.map((stat) => [stat.containerID, stat]),
    );
    const mapped = inventoryEnvelope.data.items.every((item, index) => {
      const stat = statsByID.get(item.containerID);
      if (!stat) return true;
      const text = rowTexts[index] ?? '';
      return (
        text.includes(`CPU: ${stat.cpuPercent.toFixed(2)}%`) &&
        text.includes(`Memory: ${stat.memoryPercent.toFixed(2)}%`)
      );
    });
    expect(
      mapped,
      'Every live row with statistics should display its matching CPU and memory percentages.',
    ).toBe(true);
  });

  test('maps exact synthetic CPU and memory statistics to the owned row', async ({
    page,
  }) => {
    const pending = apiResponse(page, 'GET', STATS_PATH);
    await openSyntheticInventory(page);
    const response = await pending;
    const envelope = (await response.json()) as ApiEnvelope<ContainerStat[]>;
    expect(envelope.code, envelope.message).toBe(200);
    expect(envelope.data).toEqual([SAFE_STAT]);

    await expect(safeRow(page)).toContainText('CPU: 12.50%');
    await expect(safeRow(page)).toContainText('Memory: 12.50%');
  });

  test('opens complete synthetic inspection tabs with the exact read request', async ({
    page,
  }) => {
    await routeSyntheticContainer(page);
    await page.route(`**${INSPECT_PATH}`, (route) =>
      route.fulfill({
        json: { code: 200, data: SAFE_INSPECT, message: '' },
      }),
    );
    await page.goto('/containers/container');

    const pending = apiResponse(page, 'POST', INSPECT_PATH);
    await page.getByText(SAFE_CONTAINER.name, { exact: true }).click();
    const response = await pending;
    expect(response.request().postDataJSON()).toEqual({
      detail: '',
      id: SAFE_CONTAINER.containerID,
      type: 'container',
    });

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    for (const value of [
      SAFE_CONTAINER.name,
      SAFE_CONTAINER.containerID,
      '4242',
      SAFE_CONTAINER.imageName,
      '/tmp/kneo-e2e-work',
      'KNEO_E2E_SAFE=1',
    ]) {
      await expect(dialog).toContainText(value);
    }

    await dialog.getByRole('tab', { name: 'Network', exact: true }).click();
    for (const value of [
      'kneo-e2e-network',
      '192.0.2.42',
      '192.0.2.1',
      '02:42:c0:00:02:2a',
    ]) {
      await expect(dialog).toContainText(value);
    }

    await dialog.getByRole('tab', { name: 'Volume', exact: true }).click();
    await expect(dialog).toContainText('/tmp/kneo-e2e-source');
    await expect(dialog).toContainText('/tmp/kneo-e2e-destination');
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(dialog).toBeHidden();
  });

  test('streams safe logs and maps every log-view option to its exact query', async ({
    page,
  }) => {
    await routeSyntheticContainer(page);
    await page.route(`**${LOG_PATH}?*`, (route) =>
      route.fulfill({
        body:
          'data: kneo-e2e safe container log line\n\n' +
          'data: kneo-e2e second container log line\n\n',
        contentType: 'text/event-stream',
        status: 200,
      }),
    );
    await page.goto('/containers/container');

    let pending = logRequest(page);
    await safeRow(page).getByRole('button', { name: 'Logs', exact: true }).click();
    expect(queryOf(await pending)).toEqual({
      container: SAFE_CONTAINER.name,
      follow: 'true',
      operateNode: 'local',
      since: 'all',
      tail: '100',
      timestamp: 'false',
    });
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(/^Logs - kneo-e2e-container-deta/)).toBeVisible();
    await expect(page.locator('.xterm-rows')).toContainText(
      'kneo-e2e safe container log line',
    );

    const selects = dialog.locator('.el-select');
    pending = logRequest(page);
    await selects.nth(1).click();
    await page
      .locator('.el-select-dropdown:visible')
      .getByRole('option', { name: '200', exact: true })
      .click();
    expect(queryOf(await pending)).toMatchObject({ tail: '200' });

    const follow = dialog.getByRole('checkbox', { name: 'Follow', exact: true });
    const timestamp = dialog.getByRole('checkbox', { name: 'Date', exact: true });
    await expect(follow).toBeChecked();
    await expect(timestamp).not.toBeChecked();

    pending = logRequest(page);
    await dialog.getByText('Follow', { exact: true }).click();
    expect(queryOf(await pending)).toMatchObject({ follow: 'false', tail: '200' });

    pending = logRequest(page);
    await dialog.getByText('Date', { exact: true }).click();
    expect(queryOf(await pending)).toMatchObject({
      follow: 'false',
      tail: '200',
      timestamp: 'true',
    });

    pending = logRequest(page);
    await selects.nth(0).click();
    await page
      .locator('.el-select-dropdown:visible')
      .getByRole('option', { name: 'Last 10 minutes', exact: true })
      .click();
    expect(queryOf(await pending)).toMatchObject({ since: '10m' });

    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(dialog).toBeHidden();
  });

  test('shows log-stream failure feedback and retries from an option change', async ({
    page,
  }) => {
    await routeSyntheticContainer(page);
    let unavailable = true;
    let attempts = 0;
    await page.route(`**${LOG_PATH}?*`, (route) => {
      attempts += 1;
      return route.fulfill({
        body: unavailable
          ? 'event: error\ndata: kneo-e2e container logs unavailable\n\n'
          : 'data: kneo-e2e recovered container log line\n\n',
        contentType: 'text/event-stream',
        status: 200,
      });
    });
    await page.goto('/containers/container');
    await safeRow(page).getByRole('button', { name: 'Logs', exact: true }).click();
    await expect(
      page.getByRole('alert').filter({
        hasText: 'kneo-e2e container logs unavailable',
      }),
    ).toBeVisible();

    unavailable = false;
    const retried = logRequest(page);
    const dialog = page.getByRole('dialog');
    await dialog.locator('.el-select').nth(1).click();
    await page
      .locator('.el-select-dropdown:visible')
      .getByRole('option', { name: '200', exact: true })
      .click();
    expect(queryOf(await retried)).toMatchObject({
      container: SAFE_CONTAINER.name,
      tail: '200',
    });
    await expect(page.locator('.xterm-rows')).toContainText(
      'kneo-e2e recovered container log line',
    );
    expect(attempts).toBe(2);
  });

  test('shows inspection failure feedback and retries the same synthetic ID', async ({
    page,
  }) => {
    await routeSyntheticContainer(page);
    let unavailable = true;
    const bodies: unknown[] = [];
    await page.route(`**${INSPECT_PATH}`, (route) => {
      bodies.push(route.request().postDataJSON());
      return route.fulfill({
        json: unavailable
          ? { code: 500, data: null, message: 'kneo-e2e inspect unavailable' }
          : { code: 200, data: SAFE_INSPECT, message: '' },
      });
    });
    await page.goto('/containers/container');

    await page.getByText(SAFE_CONTAINER.name, { exact: true }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: 'kneo-e2e inspect unavailable' }),
    ).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    unavailable = false;
    await page.getByText(SAFE_CONTAINER.name, { exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(bodies).toEqual([
      { detail: '', id: SAFE_CONTAINER.containerID, type: 'container' },
      { detail: '', id: SAFE_CONTAINER.containerID, type: 'container' },
    ]);
  });
});
