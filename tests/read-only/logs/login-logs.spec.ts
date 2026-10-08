import type { Page, Response } from '@playwright/test';

import { test, expect } from '../../fixtures/read-only-test';

interface ApiEnvelope<T> {
  code: number;
  data: T;
  message: string;
}

interface LoginLog {
  address: string;
  agent: string;
  createdAt: string;
  id: number;
  ip: string;
  message: string;
  status: string;
}

interface LoginLogList {
  items: LoginLog[];
  total: number;
}

interface LoginLogSearch {
  ip: string;
  page: number;
  pageSize: number;
  status: string;
}

const LOGIN_LOGS_PATH = '/api/v2/core/logs/login';

const DEFAULT_SEARCH: LoginLogSearch = {
  ip: '',
  page: 1,
  pageSize: 20,
  status: '',
};

const SAFE_LOGS: LoginLog[] = [
  {
    address: 'kneo-e2e entrance alpha',
    agent: 'kneo-e2e-agent-alpha',
    createdAt: '2026-10-07T18:00:00Z',
    id: 92001,
    ip: '192.0.2.10',
    message: 'kneo-e2e login alpha',
    status: 'Success',
  },
  {
    address: 'kneo-e2e entrance beta',
    agent: 'kneo-e2e-agent-beta',
    createdAt: '2026-10-07T17:00:00Z',
    id: 92002,
    ip: '192.0.2.11',
    message: 'kneo-e2e login beta',
    status: 'Failed',
  },
];

function loginResponse(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === LOGIN_LOGS_PATH,
  );
}

async function readLoginLogs(response: Response): Promise<LoginLogList> {
  expect(response.ok()).toBe(true);
  const envelope = (await response.json()) as ApiEnvelope<LoginLogList>;
  expect(envelope.code, envelope.message).toBe(200);
  expect(Array.isArray(envelope.data.items)).toBe(true);
  expect(typeof envelope.data.total).toBe('number');
  return envelope.data;
}

async function openLoginLogs(
  page: Page,
): Promise<{ logs: LoginLogList; response: Response }> {
  const pending = loginResponse(page);
  await page.goto('/logs/login');
  const response = await pending;
  return { logs: await readLoginLogs(response), response };
}

async function expectSafeRows(page: Page, logs: LoginLog[]): Promise<void> {
  const rows = page.locator('.el-table__row');
  await expect(rows).toHaveCount(logs.length);
  for (const log of logs) {
    const row = rows.filter({ hasText: log.ip });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(log.status);
    await expect(row).toContainText(log.agent);
  }
}

test.describe('Logs > Login logs [H,F,R,P,C,A]', () => {
  test('maps the live paged response without exposing login records', async ({
    page,
  }) => {
    const { logs, response } = await openLoginLogs(page);
    expect(response.request().postDataJSON()).toEqual(DEFAULT_SEARCH);
    expect(logs.total).toBeGreaterThanOrEqual(logs.items.length);
    await expect(page.locator('.el-table__row')).toHaveCount(logs.items.length);
    if (logs.items.length === 0) {
      await expect(page.getByText('No Data', { exact: true })).toBeVisible();
    }

    const refreshedResponse = loginResponse(page);
    await page.reload();
    const refreshed = await readLoginLogs(await refreshedResponse);
    await expect(page.locator('.el-table__row')).toHaveCount(
      refreshed.items.length,
    );
  });

  test('filters and searches deterministic multi-item and empty states', async ({
    page,
  }) => {
    const requests: LoginLogSearch[] = [];
    await page.route(`**${LOGIN_LOGS_PATH}`, async (route) => {
      const body = route.request().postDataJSON() as LoginLogSearch;
      requests.push(body);
      const items = SAFE_LOGS.filter(
        (log) =>
          (!body.ip || log.ip.includes(body.ip)) &&
          (!body.status || log.status === body.status),
      );
      await route.fulfill({
        contentType: 'application/json',
        json: { code: 200, data: { items, total: items.length }, message: '' },
        status: 200,
      });
    });

    const opened = await openLoginLogs(page);
    expect(opened.response.request().postDataJSON()).toEqual(DEFAULT_SEARCH);
    await expectSafeRows(page, SAFE_LOGS);

    let pending = loginResponse(page);
    await page.locator('.el-select').first().click();
    await page
      .locator('.el-select-dropdown:visible')
      .getByRole('option', { name: 'Success', exact: true })
      .click();
    let body = (await pending).request().postDataJSON() as LoginLogSearch;
    expect(body).toEqual({ ...DEFAULT_SEARCH, status: 'Success' });
    await expectSafeRows(page, [SAFE_LOGS[0]]);

    const search = page.getByPlaceholder('Search');
    await search.fill('192.0.2.10');
    pending = loginResponse(page);
    await search.press('Enter');
    body = (await pending).request().postDataJSON() as LoginLogSearch;
    expect(body).toEqual({
      ...DEFAULT_SEARCH,
      ip: '192.0.2.10',
      status: 'Success',
    });
    await expectSafeRows(page, [SAFE_LOGS[0]]);

    await search.fill('192.0.2.99');
    pending = loginResponse(page);
    await search.press('Enter');
    await pending;
    await expect(page.locator('.el-table__row')).toHaveCount(0);
    await expect(page.getByText('No Data', { exact: true })).toBeVisible();
    expect(requests.length).toBeGreaterThanOrEqual(4);
  });

  test('shows retrieval failure feedback and recovers on reload', async ({
    page,
  }) => {
    let unavailable = true;
    let attempts = 0;
    await page.route(`**${LOGIN_LOGS_PATH}`, async (route) => {
      attempts += 1;
      await route.fulfill({
        contentType: 'application/json',
        json: unavailable
          ? {
              code: 500,
              data: null,
              message: 'kneo-e2e login logs unavailable',
            }
          : {
              code: 200,
              data: { items: SAFE_LOGS, total: SAFE_LOGS.length },
              message: '',
            },
        status: 200,
      });
    });

    const rejected = loginResponse(page);
    await page.goto('/logs/login');
    expect(((await (await rejected).json()) as ApiEnvelope<null>).code).toBe(500);
    await expect(
      page.getByText('kneo-e2e login logs unavailable').first(),
    ).toBeVisible();
    await expect(page.locator('.el-table__row')).toHaveCount(0);

    unavailable = false;
    const retried = loginResponse(page);
    await page.reload();
    await readLoginLogs(await retried);
    await expectSafeRows(page, SAFE_LOGS);
    expect(attempts).toBeGreaterThanOrEqual(2);
  });
});
