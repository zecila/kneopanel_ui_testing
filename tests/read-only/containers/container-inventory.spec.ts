import type { Page, Response } from '@playwright/test';

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
  network: unknown[];
  ports: unknown[];
  runTime: string;
  state: string;
  websites: unknown[];
}

interface ContainerList {
  items: ContainerItem[];
  total: number;
}

interface ContainerSearch {
  excludeAppStore: boolean;
  filters: string;
  name?: string;
  order: string;
  orderBy: string;
  page: number;
  pageSize: number;
  state: string;
}

const DOCKER_STATUS_PATH = '/api/v2/containers/docker/status';
const INVENTORY_PATH = '/api/v2/containers/search';
const STATS_PATH = '/api/v2/containers/list/stats';
const STATUS_PATH = '/api/v2/containers/status';

const SAFE_CONTAINERS: ContainerItem[] = [
  {
    appInstallName: '',
    appName: '',
    containerID: 'kneo-e2e-container-alpha-id',
    createTime: '2026-10-07T18:00:00Z',
    description: 'kneo-e2e safe running container',
    imageID: 'sha256:kneo-e2e-alpha',
    imageName: 'example.invalid/kneo-e2e:alpha',
    isFromApp: false,
    isFromCompose: false,
    isPinned: false,
    name: 'kneo-e2e-container-alpha',
    network: [],
    ports: [],
    runTime: '2 minutes',
    state: 'running',
    websites: [],
  },
  {
    appInstallName: '',
    appName: '',
    containerID: 'kneo-e2e-container-beta-id',
    createTime: '2026-10-07T17:00:00Z',
    description: 'kneo-e2e safe exited container',
    imageID: 'sha256:kneo-e2e-beta',
    imageName: 'example.invalid/kneo-e2e:beta',
    isFromApp: false,
    isFromCompose: false,
    isPinned: false,
    name: 'kneo-e2e-container-beta',
    network: [],
    ports: [],
    runTime: '1 hour',
    state: 'exited',
    websites: [],
  },
];

const DEFAULT_SEARCH: ContainerSearch = {
  excludeAppStore: false,
  filters: '',
  order: 'null',
  orderBy: 'createdAt',
  page: 1,
  pageSize: 20,
  state: 'all',
};

async function readInventory(response: Response): Promise<ContainerList> {
  expect(response.ok()).toBe(true);
  const envelope = (await response.json()) as ApiEnvelope<ContainerList>;
  expect(envelope.code, envelope.message).toBe(200);
  expect(Array.isArray(envelope.data.items)).toBe(true);
  return envelope.data;
}

function inventoryResponse(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === INVENTORY_PATH,
  );
}

async function openInventory(
  page: Page,
): Promise<{ inventory: ContainerList; response: Response }> {
  const pending = inventoryResponse(page);
  await page.goto('/containers/container');
  const response = await pending;
  return { inventory: await readInventory(response), response };
}

async function routeActiveRuntime(page: Page): Promise<void> {
  await page.route(`**${DOCKER_STATUS_PATH}`, async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      json: {
        code: 200,
        data: { isActive: true, isExist: true },
        message: '',
      },
      status: 200,
    });
  });
  await page.route(`**${STATUS_PATH}`, async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      json: {
        code: 200,
        data: {
          composeCount: 0,
          composeTemplateCount: 0,
          containerCount: SAFE_CONTAINERS.length,
          created: 0,
          dead: 0,
          exited: 1,
          imageCount: 2,
          networkCount: 1,
          paused: 0,
          removing: 0,
          repoCount: 2,
          restarting: 0,
          running: 1,
          volumeCount: 0,
        },
        message: '',
      },
      status: 200,
    });
  });
  await page.route(`**${STATS_PATH}`, async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      json: { code: 200, data: [], message: '' },
      status: 200,
    });
  });
}

async function expectRows(page: Page, items: ContainerItem[]): Promise<void> {
  const rows = page.locator('.el-table__row');
  await expect(rows).toHaveCount(items.length);
  const renderedRows = await rows.evaluateAll((elements) =>
    elements.map((element) => element.textContent?.replace(/\s+/g, ' ').trim() ?? ''),
  );
  for (const item of items) {
    const matchingRows = renderedRows.filter((row) => row.includes(item.name));
    expect(matchingRows, `rendered row for ${item.name}`).toHaveLength(1);
    const row = matchingRows[0].toLowerCase();
    expect(row).toContain(item.imageName.toLowerCase());
    expect(row).toContain(item.state.toLowerCase());
    expect(row).toContain(item.description.toLowerCase());
    expect(row).toContain(item.runTime.toLowerCase());
  }
}

test.describe('Containers > Inventory [H,F,R,P,C,A]', () => {
  test(
    'maps the live API inventory and its explicit empty state',
    { tag: '@smoke' },
    async ({ page }) => {
      const { inventory, response } = await openInventory(page);
      expect(response.request().postDataJSON()).toEqual(DEFAULT_SEARCH);

      for (const column of [
        'Name',
        'Image',
        'Status',
        'Resource usage',
        'IP address',
        'Related',
        'Port',
        'Description',
        'Uptime',
        'Actions',
      ]) {
        await expect(
          page.getByRole('columnheader', { name: column, exact: true }),
        ).toBeVisible();
      }
      await expectRows(page, inventory.items);
      expect(inventory.total).toBe(inventory.items.length);
      if (inventory.items.length === 0) {
        await expect(page.getByText('No Data', { exact: true })).toBeVisible();
      }

      const refreshedResponse = inventoryResponse(page);
      await page.reload();
      const refreshed = await readInventory(await refreshedResponse);
      await expectRows(page, refreshed.items);
    },
  );

  test('filters deterministic running and searched multi-item inventories', async ({
    page,
  }) => {
    await routeActiveRuntime(page);
    const requests: ContainerSearch[] = [];
    await page.route(`**${INVENTORY_PATH}`, async (route) => {
      const body = route.request().postDataJSON() as ContainerSearch;
      requests.push(body);
      const matching = SAFE_CONTAINERS.filter(
        (item) =>
          (body.state === 'all' || item.state === body.state) &&
          (!body.name || item.name.includes(body.name)),
      );
      await route.fulfill({
        contentType: 'application/json',
        json: {
          code: 200,
          data: { items: matching, total: matching.length },
          message: '',
        },
        status: 200,
      });
    });

    let result = await openInventory(page);
    await expectRows(page, SAFE_CONTAINERS);
    expect(result.response.request().postDataJSON()).toEqual(DEFAULT_SEARCH);

    let filteredResponse = inventoryResponse(page);
    await page.getByRole('button', { name: /^Running.*1$/ }).click();
    const runningResponse = await filteredResponse;
    result = {
      inventory: await readInventory(runningResponse),
      response: runningResponse,
    };
    expect(result.response.request().postDataJSON()).toEqual({
      ...DEFAULT_SEARCH,
      state: 'running',
    });
    await expectRows(page, [SAFE_CONTAINERS[0]]);

    const search = page.getByPlaceholder('Search');
    await search.fill('alpha');
    filteredResponse = inventoryResponse(page);
    await search.press('Enter');
    const searchResponse = await filteredResponse;
    result = {
      inventory: await readInventory(searchResponse),
      response: searchResponse,
    };
    expect(result.response.request().postDataJSON()).toEqual({
      ...DEFAULT_SEARCH,
      name: 'alpha',
      state: 'running',
    });
    await expectRows(page, [SAFE_CONTAINERS[0]]);
    expect(requests.length).toBeGreaterThanOrEqual(3);
  });

  test('explains an unavailable container runtime without searching inventory', async ({
    page,
  }) => {
    let inventoryRequests = 0;
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === INVENTORY_PATH) {
        inventoryRequests += 1;
      }
    });
    await page.route(`**${DOCKER_STATUS_PATH}`, async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        json: {
          code: 200,
          data: { isActive: false, isExist: false },
          message: '',
        },
        status: 200,
      });
    });

    await page.goto('/containers/dashboard');
    await expect(
      page.getByText(
        'The Docker service was not detected. Please install it quickly using the script library first!',
        { exact: true },
      ),
    ).toBeVisible();
    expect(inventoryRequests).toBe(0);
  });

  test('shows inventory failure feedback and recovers on reload', async ({
    page,
  }) => {
    await routeActiveRuntime(page);
    let unavailable = true;
    let attempts = 0;
    await page.route(`**${INVENTORY_PATH}`, async (route) => {
      attempts += 1;
      await route.fulfill({
        contentType: 'application/json',
        json: unavailable
          ? {
              code: 500,
              data: null,
              message: 'kneo-e2e container inventory unavailable',
            }
          : {
              code: 200,
              data: { items: SAFE_CONTAINERS, total: SAFE_CONTAINERS.length },
              message: '',
            },
        status: 200,
      });
    });

    const failed = inventoryResponse(page);
    await page.goto('/containers/container');
    expect(
      ((await (await failed).json()) as ApiEnvelope<null>).code,
    ).toBe(500);
    await expect(
      page.getByText('kneo-e2e container inventory unavailable').first(),
    ).toBeVisible();
    await expect(page.locator('.el-table__row')).toHaveCount(0);

    unavailable = false;
    const recoveredResponse = inventoryResponse(page);
    await page.reload();
    const recovered = await readInventory(await recoveredResponse);
    await expectRows(page, recovered.items);
    expect(attempts).toBeGreaterThanOrEqual(2);
  });
});
