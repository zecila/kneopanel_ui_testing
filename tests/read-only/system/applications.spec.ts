import type { Locator, Page, Request, Response } from '@playwright/test';

import { test, expect } from '../../fixtures/read-only-test';

interface ApiEnvelope<T> {
  code: number;
  data: T;
  message: string;
}

interface InstalledApplication {
  appKey: string;
  appStatus: string;
  appType: string;
  createdAt: string;
  favorite: boolean;
  httpPort: number;
  httpsPort: number;
  id: number;
  message: string;
  name: string;
  status: string;
  version: string;
  webUI: string;
}

interface InstalledInventory {
  items: InstalledApplication[] | null;
  total: number;
}

interface InstalledSearch {
  name: string;
  page: number;
  pageSize: number;
  sync: boolean;
  tags: string[];
  update: boolean;
}

const SEARCH_PATH = '/api/v2/apps/installed/search';
const ICON_PATH = '/api/v2/apps/icon/';

const INITIAL_SEARCH: InstalledSearch = {
  page: 1,
  pageSize: 20,
  name: '',
  tags: [],
  update: false,
  sync: false,
};

const SYNC_SEARCH: InstalledSearch = {
  ...INITIAL_SEARCH,
  sync: true,
};

const SAFE_APPLICATIONS: InstalledApplication[] = [
  {
    id: 91_001,
    name: 'kneo-e2e-app-alpha',
    status: 'Running',
    message: '',
    appKey: 'kneo-e2e-alpha',
    appType: 'Tool',
    version: '1.2.3',
    httpPort: 42_001,
    httpsPort: 0,
    webUI: '',
    createdAt: '2026-10-07T12:00:00Z',
    favorite: true,
    appStatus: 'Normal',
  },
  {
    id: 91_002,
    name: 'kneo-e2e-app-beta',
    status: 'Stopped',
    message: '',
    appKey: 'kneo-e2e-beta',
    appType: 'Website',
    version: '4.5.6',
    httpPort: 0,
    httpsPort: 42_443,
    webUI: '',
    createdAt: '2026-10-06T12:00:00Z',
    favorite: false,
    appStatus: 'Normal',
  },
  {
    id: 91_003,
    name: 'kneo-e2e-app-gamma',
    status: 'Error',
    message: 'kneo-e2e synthetic application failure',
    appKey: 'kneo-e2e-gamma',
    appType: 'Database',
    version: '7.8.9',
    httpPort: 0,
    httpsPort: 0,
    webUI: '',
    createdAt: '2026-10-05T12:00:00Z',
    favorite: false,
    appStatus: 'Normal',
  },
];

function searchBody(request: Request): InstalledSearch | null {
  if (
    request.method() !== 'POST' ||
    new URL(request.url()).pathname !== SEARCH_PATH
  ) {
    return null;
  }
  return request.postDataJSON() as InstalledSearch | null;
}

function waitForSearch(
  page: Page,
  predicate: (body: InstalledSearch) => boolean,
): Promise<Response> {
  return page.waitForResponse((response) => {
    const body = searchBody(response.request());
    return body !== null && predicate(body);
  });
}

async function readInventory(response: Response): Promise<InstalledInventory> {
  expect(response.ok()).toBe(true);
  const envelope = (await response.json()) as ApiEnvelope<InstalledInventory>;
  expect(envelope.code, envelope.message).toBe(200);
  expect(
    envelope.data.items === null || Array.isArray(envelope.data.items),
  ).toBe(true);
  expect(Number.isInteger(envelope.data.total)).toBe(true);
  expect(envelope.data.total).toBeGreaterThanOrEqual(
    envelope.data.items?.length ?? 0,
  );
  return envelope.data;
}

function applicationCard(page: Page, name: string): Locator {
  return page
    .locator('.install-card')
    .filter({ has: page.getByText(name, { exact: true }) });
}

async function routeSyntheticInventory(
  page: Page,
  inventory: () => InstalledApplication[] | null = () => SAFE_APPLICATIONS,
): Promise<void> {
  await page.route(`**${ICON_PATH}*`, async (route) => {
    await route.fulfill({ status: 204, body: '' });
  });
  await page.route(`**${SEARCH_PATH}`, async (route) => {
    const body = searchBody(route.request());
    expect(body).not.toBeNull();
    const request = body as InstalledSearch;
    const name = request.name.toLowerCase();
    const tags = new Set(request.tags.map((tag) => tag.toLowerCase()));
    const source = inventory();
    const items =
      source === null
        ? null
        : source.filter(
            (item) =>
              item.name.toLowerCase().includes(name) &&
              (tags.size === 0 || tags.has(item.appType.toLowerCase())),
          );
    await route.fulfill({
      contentType: 'application/json',
      json: {
        code: 200,
        data: { items, total: items?.length ?? 0 },
        message: '',
      },
      status: 200,
    });
  });
}

async function openSyntheticInventory(page: Page): Promise<void> {
  const initialResponse = waitForSearch(page, (body) => body.sync === false);
  const syncedResponse = waitForSearch(page, (body) => body.sync === true);
  await page.goto('/hosts/apps');
  await initialResponse;
  await syncedResponse;
}

test.describe('System > Applications inventory [H,F,R,P,C,A]', () => {
  test('maps the live request contract and inventory cardinality without opening a row action', async ({
    page,
  }) => {
    const initialResponse = waitForSearch(
      page,
      (body) => body.sync === false,
    );
    const syncedResponse = waitForSearch(page, (body) => body.sync === true);
    await page.goto('/hosts/apps');

    const initial = await readInventory(await initialResponse);
    const synced = await readInventory(await syncedResponse);
    expect((await initialResponse).request().postDataJSON()).toEqual(
      INITIAL_SEARCH,
    );
    expect((await syncedResponse).request().postDataJSON()).toEqual(SYNC_SEARCH);

    await expect(page).toHaveURL(/\/hosts\/apps(?:[/?#]|$)/);
    await expect(page.getByText('Quick access', { exact: true })).toBeVisible();
    await expect(page.locator('.install-card')).toHaveCount(
      synced.items?.length ?? 0,
    );
    await expect(
      page.getByText(`Total ${synced.total}`, { exact: true }),
    ).toBeVisible();

    if (
      (initial.items?.length ?? 0) === 0 &&
      (synced.items?.length ?? 0) === 0
    ) {
      await expect(
        page.getByText('No apps installed yet', { exact: true }),
      ).toBeVisible();
    }
  });

  test('renders multiple synthetic statuses and enforces action eligibility', async ({
    page,
  }) => {
    await routeSyntheticInventory(page);
    await openSyntheticInventory(page);
    await expect(page.locator('.install-card')).toHaveCount(
      SAFE_APPLICATIONS.length,
    );

    const running = applicationCard(page, SAFE_APPLICATIONS[0].name);
    await expect(running).toContainText('Running');
    await expect(running).toContainText('Version: 1.2.3');
    await expect(running).toContainText('Port: 42001');
    await expect(
      running.getByRole('button', { name: 'Start', exact: true }),
    ).toBeDisabled();
    await expect(
      running.getByRole('button', { name: 'Stop', exact: true }),
    ).toBeEnabled();

    const stopped = applicationCard(page, SAFE_APPLICATIONS[1].name);
    await expect(stopped).toContainText('Stopped');
    await expect(stopped).toContainText('Version: 4.5.6');
    await expect(stopped).toContainText(/Port.*42443/);
    await expect(
      stopped.getByRole('button', { name: 'Start', exact: true }),
    ).toBeEnabled();
    await expect(
      stopped.getByRole('button', { name: 'Stop', exact: true }),
    ).toBeDisabled();

    const failed = applicationCard(page, SAFE_APPLICATIONS[2].name);
    await expect(failed).toContainText('Error');
    await expect(
      failed.getByRole('button', { name: 'Start', exact: true }),
    ).toBeDisabled();
    await expect(
      failed.getByRole('button', { name: 'Stop', exact: true }),
    ).toBeDisabled();
    await expect(page.getByText('Total 3', { exact: true })).toBeVisible();
  });

  test('maps tag and name filters to exact requests and a single result', async ({
    page,
  }) => {
    await routeSyntheticInventory(page);
    await openSyntheticInventory(page);
    await expect(page.locator('.install-card')).toHaveCount(3);

    const tagResponse = waitForSearch(
      page,
      (body) => body.tags.length === 1 && body.tags[0] === 'Tool',
    );
    await page
      .locator('.el-check-tag')
      .filter({ hasText: /^Tool$/ })
      .first()
      .click();
    expect((await tagResponse).request().postDataJSON()).toEqual({
      ...SYNC_SEARCH,
      tags: ['Tool'],
    });
    await expect(page.locator('.install-card')).toHaveCount(1);
    await expect(applicationCard(page, SAFE_APPLICATIONS[0].name)).toBeVisible();

    const search = page.getByPlaceholder('Search');
    await search.fill('alpha');
    const nameResponse = waitForSearch(page, (body) => body.name === 'alpha');
    await search.press('Enter');
    expect((await nameResponse).request().postDataJSON()).toEqual({
      ...SYNC_SEARCH,
      name: 'alpha',
      tags: ['Tool'],
    });
    await expect(page.locator('.install-card')).toHaveCount(1);
  });

  test('renders a deterministic empty inventory', async ({ page }) => {
    await routeSyntheticInventory(page, () => null);
    await openSyntheticInventory(page);

    await expect(page.locator('.install-card')).toHaveCount(0);
    await expect(
      page.getByText('No apps installed yet', { exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Total 0', { exact: true })).toBeVisible();
  });

  test('refreshes changed server state and retains it after reload', async ({
    page,
  }) => {
    let version = '1.2.3';
    await routeSyntheticInventory(page, () => [
      { ...SAFE_APPLICATIONS[0], version },
    ]);
    await openSyntheticInventory(page);
    await expect(page.getByText('Version: 1.2.3', { exact: true })).toBeVisible();

    version = '1.2.4';
    const refreshedResponse = waitForSearch(
      page,
      (body) => body.sync === true,
    );
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    expect((await refreshedResponse).request().postDataJSON()).toEqual(
      SYNC_SEARCH,
    );
    await expect(page.getByText('Version: 1.2.4', { exact: true })).toBeVisible();

    await page.reload();
    await expect(page.getByText('Version: 1.2.4', { exact: true })).toBeVisible();
  });

  test('shows inventory failure feedback and recovers on reload', async ({
    page,
  }) => {
    let unavailable = true;
    await page.route(`**${ICON_PATH}*`, async (route) => {
      await route.fulfill({ status: 204, body: '' });
    });
    await page.route(`**${SEARCH_PATH}`, async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        json: unavailable
          ? {
              code: 500,
              data: null,
              message: 'kneo-e2e applications unavailable',
            }
          : {
              code: 200,
              data: { items: [SAFE_APPLICATIONS[0]], total: 1 },
              message: '',
            },
        status: 200,
      });
    });

    await page.goto('/hosts/apps');
    await expect(
      page.getByText('kneo-e2e applications unavailable', { exact: true }).last(),
    ).toBeVisible();
    await expect(page.locator('.install-card')).toHaveCount(0);

    unavailable = false;
    const retryResponse = waitForSearch(page, (body) => body.sync === false);
    await page.reload();
    await readInventory(await retryResponse);
    await expect(page.locator('.install-card')).toHaveCount(1);
    await expect(applicationCard(page, SAFE_APPLICATIONS[0].name)).toBeVisible();
  });

  test('records the active Applications route and absent navigation entry', async ({
    page,
  }) => {
    test.info().annotations.push({
      type: 'product-question',
      description:
        'docs/bugs/2026-10-07/verified-ui-bugs-10-07-2026.md#36-applications-route-remains-active-without-a-navigation-entry-intent-unclear',
    });

    await page.goto('/');
    await page.getByRole('menuitem', { name: 'System', exact: true }).click();
    const applications = page.getByRole('menuitem', {
      name: 'Applications',
      exact: true,
    });
    await expect(applications).toHaveCount(0);

    await page.goto('/hosts/apps');
    await expect(page).toHaveURL(/\/hosts\/apps(?:[/?#]|$)/);
    await expect(page.getByText('Quick access', { exact: true })).toBeVisible();

    await page.goto('/apps');
    await expect(page).toHaveURL(/\/hosts\/apps(?:[/?#]|$)/);
    await expect(page.getByText('Quick access', { exact: true })).toBeVisible();
  });
});
