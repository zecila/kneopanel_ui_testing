import type { Page, Response } from '@playwright/test';

import { test, expect } from '../../fixtures/read-only-test';

interface ApiEnvelope<T> {
  code: number;
  data: T;
  message: string;
}

interface OperationLog {
  createdAt: string;
  detailEN: string;
  id: number;
  ip: string;
  latency: number;
  message: string;
  method: string;
  node: string;
  path: string;
  source: string;
  status: string;
  userAgent: string;
}

interface OperationLogList {
  items: OperationLog[];
  total: number;
}

interface OperationLogSearch {
  node: string;
  operation: string;
  page: number;
  pageSize: number;
  source: string;
  status: string;
}

const OPERATION_LOGS_PATH = '/api/v2/core/logs/operation';

const DEFAULT_SEARCH: OperationLogSearch = {
  node: '',
  operation: '',
  page: 1,
  pageSize: 20,
  source: '',
  status: '',
};

const SAFE_LOGS: OperationLog[] = [
  {
    createdAt: '2026-10-07T18:00:00Z',
    detailEN: 'kneo-e2e operation alpha',
    id: 91001,
    ip: '192.0.2.10',
    latency: 23,
    message: 'kneo-e2e message alpha',
    method: 'POST',
    node: 'local',
    path: '/kneo-e2e/alpha',
    source: 'files',
    status: 'Success',
    userAgent: 'kneo-e2e-agent',
  },
  {
    createdAt: '2026-10-07T17:00:00Z',
    detailEN: 'kneo-e2e operation beta',
    id: 91002,
    ip: '192.0.2.11',
    latency: 41,
    message: 'kneo-e2e message beta',
    method: 'POST',
    node: 'local',
    path: '/kneo-e2e/beta',
    source: 'container',
    status: 'Failed',
    userAgent: 'kneo-e2e-agent',
  },
];

function operationResponse(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === OPERATION_LOGS_PATH,
  );
}

async function readOperationLogs(response: Response): Promise<OperationLogList> {
  expect(response.ok()).toBe(true);
  const envelope = (await response.json()) as ApiEnvelope<OperationLogList>;
  expect(envelope.code, envelope.message).toBe(200);
  expect(Array.isArray(envelope.data.items)).toBe(true);
  expect(typeof envelope.data.total).toBe('number');
  return envelope.data;
}

async function openOperationLogs(
  page: Page,
): Promise<{ logs: OperationLogList; response: Response }> {
  const pending = operationResponse(page);
  await page.goto('/logs/operation');
  const response = await pending;
  return { logs: await readOperationLogs(response), response };
}

async function selectFilter(
  page: Page,
  index: number,
  option: string,
): Promise<Response> {
  const pending = operationResponse(page);
  await page.locator('.el-select').nth(index).click();
  await page
    .locator('.el-select-dropdown:visible')
    .getByRole('option', { name: option, exact: true })
    .click();
  return pending;
}

async function expectSafeRows(page: Page, logs: OperationLog[]): Promise<void> {
  const rows = page.locator('.el-table__row');
  await expect(rows).toHaveCount(logs.length);
  for (const log of logs) {
    const row = rows.filter({ hasText: log.detailEN });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(log.status);
  }
}

test.describe('Logs > Operation logs [H,V,F,R,P,C,A]', () => {
  test('maps the live paged response without exposing log contents', async ({
    page,
  }) => {
    const { logs, response } = await openOperationLogs(page);
    expect(response.request().postDataJSON()).toEqual(DEFAULT_SEARCH);
    expect(logs.total).toBeGreaterThanOrEqual(logs.items.length);
    await expect(page.locator('.el-table__row')).toHaveCount(logs.items.length);

    for (const header of ['Resource', 'Actions', 'Status', 'Date']) {
      await expect(
        page.getByRole('columnheader', { name: header, exact: true }),
      ).toBeVisible();
    }
    if (logs.items.length === 0) {
      await expect(page.getByText('No Data', { exact: true })).toBeVisible();
    }

    const refreshedResponse = operationResponse(page);
    await page.reload();
    const refreshed = await readOperationLogs(await refreshedResponse);
    await expect(page.locator('.el-table__row')).toHaveCount(
      refreshed.items.length,
    );
  });

  test('filters and searches deterministic multi-item and empty states', async ({
    page,
  }) => {
    const requests: OperationLogSearch[] = [];
    await page.route(`**${OPERATION_LOGS_PATH}`, async (route) => {
      const body = route.request().postDataJSON() as OperationLogSearch;
      requests.push(body);
      const items = SAFE_LOGS.filter(
        (log) =>
          (!body.operation ||
            log.detailEN.toLowerCase().includes(body.operation.toLowerCase())) &&
          (!body.source ||
            log.source.toLowerCase() === body.source.toLowerCase()) &&
          (!body.status || log.status === body.status) &&
          (!body.node || log.node === body.node),
      );
      await route.fulfill({
        contentType: 'application/json',
        json: { code: 200, data: { items, total: items.length }, message: '' },
        status: 200,
      });
    });

    const opened = await openOperationLogs(page);
    expect(opened.response.request().postDataJSON()).toEqual(DEFAULT_SEARCH);
    await expectSafeRows(page, SAFE_LOGS);

    let response = await selectFilter(page, 0, 'File');
    let body = response.request().postDataJSON() as OperationLogSearch;
    expect(body).toEqual({ ...DEFAULT_SEARCH, source: 'files' });
    await expectSafeRows(page, [SAFE_LOGS[0]]);

    response = await selectFilter(page, 1, 'Success');
    body = response.request().postDataJSON() as OperationLogSearch;
    expect(body).toEqual({
      ...DEFAULT_SEARCH,
      source: 'files',
      status: 'Success',
    });
    await expectSafeRows(page, [SAFE_LOGS[0]]);

    response = await selectFilter(page, 2, 'Main Node');
    body = response.request().postDataJSON() as OperationLogSearch;
    expect(body).toEqual({
      ...DEFAULT_SEARCH,
      node: 'local',
      source: 'files',
      status: 'Success',
    });
    await expectSafeRows(page, [SAFE_LOGS[0]]);

    const search = page.getByPlaceholder('Search');
    await search.fill('no-match');
    const searched = operationResponse(page);
    await search.press('Enter');
    body = (await searched).request().postDataJSON() as OperationLogSearch;
    expect(body).toEqual({
      ...DEFAULT_SEARCH,
      node: 'local',
      operation: 'no-match',
      source: 'files',
      status: 'Success',
    });
    await expect(page.locator('.el-table__row')).toHaveCount(0);
    await expect(page.getByText('No Data', { exact: true })).toBeVisible();
    expect(requests.length).toBeGreaterThanOrEqual(5);
  });

  test('cancels clean logs without sending a cleanup request', async ({ page }) => {
    await page.route(`**${OPERATION_LOGS_PATH}`, async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        json: {
          code: 200,
          data: { items: SAFE_LOGS, total: SAFE_LOGS.length },
          message: '',
        },
        status: 200,
      });
    });
    const writeRequests: string[] = [];
    page.on('request', (request) => {
      const path = new URL(request.url()).pathname;
      if (
        !['GET', 'HEAD', 'OPTIONS'].includes(request.method()) &&
        path.includes('/api/v2/') &&
        path.includes('/logs/') &&
        path !== OPERATION_LOGS_PATH
      ) {
        writeRequests.push(`${request.method()} ${path}`);
      }
    });

    await openOperationLogs(page);
    await page.getByRole('button', { name: 'Clean logs', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(dialog).toBeHidden();
    expect(writeRequests).toEqual([]);
    await expectSafeRows(page, SAFE_LOGS);
  });

  test('shows retrieval failure feedback and recovers on reload', async ({
    page,
  }) => {
    let unavailable = true;
    let attempts = 0;
    await page.route(`**${OPERATION_LOGS_PATH}`, async (route) => {
      attempts += 1;
      await route.fulfill({
        contentType: 'application/json',
        json: unavailable
          ? {
              code: 500,
              data: null,
              message: 'kneo-e2e operation logs unavailable',
            }
          : {
              code: 200,
              data: { items: SAFE_LOGS, total: SAFE_LOGS.length },
              message: '',
            },
        status: 200,
      });
    });

    const rejected = operationResponse(page);
    await page.goto('/logs/operation');
    expect(((await (await rejected).json()) as ApiEnvelope<null>).code).toBe(500);
    await expect(
      page.getByText('kneo-e2e operation logs unavailable').first(),
    ).toBeVisible();
    await expect(page.locator('.el-table__row')).toHaveCount(0);

    unavailable = false;
    const retried = operationResponse(page);
    await page.reload();
    await readOperationLogs(await retried);
    await expectSafeRows(page, SAFE_LOGS);
    expect(attempts).toBeGreaterThanOrEqual(2);
  });
});
