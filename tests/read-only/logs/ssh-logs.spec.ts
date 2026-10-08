import type { Page, Response } from '@playwright/test';

import { test, expect } from '../../fixtures/read-only-test';

interface ApiEnvelope<T> {
  code: number;
  data: T;
  message?: string;
}

interface SshLog {
  address: string;
  area: string;
  authMode: string;
  date: string;
  dateStr: string;
  message: string;
  port: string;
  status: string;
  user: string;
}

interface SshLogList {
  items: SshLog[];
  total: number;
}

interface SshSearch {
  info?: string;
  page: number;
  pageSize: number;
  status: string;
}

const SSH_LOGS_PATH = '/api/v2/hosts/ssh/log';
const DEFAULT_SEARCH: SshSearch = { page: 1, pageSize: 20, status: 'All' };
const SAFE_LOGS: SshLog[] = [
  {
    address: '192.0.2.41',
    area: 'Intranet',
    authMode: 'Password',
    date: '2026-10-07T18:00:00Z',
    dateStr: '2026-10-07 18:00:00',
    message: '',
    port: '42001',
    status: 'Success',
    user: 'kneo-e2e-user-a',
  },
  {
    address: '192.0.2.42',
    area: 'Extranet',
    authMode: 'Key',
    date: '2026-10-07T17:00:00Z',
    dateStr: '2026-10-07 17:00:00',
    message: 'kneo-e2e safe failure',
    port: '42002',
    status: 'Failed',
    user: 'kneo-e2e-user-b',
  },
];

function sshResponse(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === SSH_LOGS_PATH,
  );
}

async function readSshLogs(response: Response): Promise<SshLogList> {
  expect(response.ok()).toBe(true);
  const envelope = (await response.json()) as ApiEnvelope<SshLogList>;
  expect(envelope.code, envelope.message).toBe(200);
  expect(Array.isArray(envelope.data.items)).toBe(true);
  expect(typeof envelope.data.total).toBe('number');
  return envelope.data;
}

function sshRows(page: Page) {
  return page.locator('.el-table__body-wrapper .el-table__row');
}

async function expectSafeRows(page: Page, logs: SshLog[]): Promise<void> {
  const rows = sshRows(page);
  await expect(rows).toHaveCount(logs.length);
  for (let index = 0; index < logs.length; index += 1) {
    const text = (await rows.nth(index).innerText()).replace(/\s+/g, ' ');
    for (const value of [
      logs[index].address,
      logs[index].area,
      logs[index].port,
      logs[index].authMode,
      logs[index].user,
      logs[index].status,
      logs[index].dateStr.slice(0, 10),
    ]) {
      expect(text).toContain(value);
    }
  }
}

async function routeSafeLogs(page: Page, requests: SshSearch[]): Promise<void> {
  await page.route(`**${SSH_LOGS_PATH}`, (route) => {
    const body = route.request().postDataJSON() as SshSearch;
    requests.push(body);
    const info = body.info?.toLowerCase() ?? '';
    const items = SAFE_LOGS.filter(
      (log) =>
        (body.status === 'All' || log.status === body.status) &&
        (!info ||
          [log.address, log.area, log.authMode, log.port, log.user]
            .join(' ')
            .toLowerCase()
            .includes(info)),
    );
    return route.fulfill({
      json: { code: 200, data: { items, total: items.length }, message: '' },
    });
  });
}

test.describe('Logs > SSH logs [H,F,R,P,C,A]', () => {
  test('maps the live paged schema and table cardinality without exposing records', async ({
    page,
  }) => {
    const pending = sshResponse(page);
    await page.goto('/logs/ssh');
    const response = await pending;
    expect(response.request().postDataJSON()).toEqual(DEFAULT_SEARCH);
    const logs = await readSshLogs(response);
    expect(logs.total).toBeGreaterThanOrEqual(logs.items.length);
    if (logs.items.length > 0) {
      expect(Object.keys(logs.items[0]).sort()).toEqual(
        [
          'address', 'area', 'authMode', 'date', 'dateStr', 'message', 'port',
          'status', 'user',
        ].sort(),
      );
    }
    await expect(sshRows(page)).toHaveCount(logs.items.length);
    for (const header of [
      'Login IP', 'Belong', 'Port', 'Mode', 'Owner', 'Status', 'Date',
    ]) {
      await expect(
        page.getByRole('columnheader', { name: header, exact: true }),
      ).toBeVisible();
    }

    const reloaded = sshResponse(page);
    await page.reload();
    const refreshed = await readSshLogs(await reloaded);
    await expect(sshRows(page)).toHaveCount(refreshed.items.length);
  });

  test('filters deterministic multi-item logs by status and search text', async ({
    page,
  }) => {
    const requests: SshSearch[] = [];
    await routeSafeLogs(page, requests);
    await page.goto('/logs/ssh');
    await expectSafeRows(page, SAFE_LOGS);
    expect(requests[0]).toEqual(DEFAULT_SEARCH);

    let pending = sshResponse(page);
    await page.locator('.el-select').first().click();
    await page
      .locator('.el-select-dropdown:visible')
      .getByRole('option', { name: 'Failed', exact: true })
      .click();
    let body = (await pending).request().postDataJSON() as SshSearch;
    expect(body).toEqual({ ...DEFAULT_SEARCH, status: 'Failed' });
    await expectSafeRows(page, [SAFE_LOGS[1]]);

    const search = page.getByPlaceholder('Search');
    await search.fill(SAFE_LOGS[0].address);
    pending = sshResponse(page);
    await search.press('Enter');
    body = (await pending).request().postDataJSON() as SshSearch;
    expect(body).toEqual({
      ...DEFAULT_SEARCH,
      info: SAFE_LOGS[0].address,
      status: 'Failed',
    });
    await expect(sshRows(page)).toHaveCount(0);
    await expect(page.getByText('No Data', { exact: true })).toBeVisible();
  });

  test('refreshes on demand and recovers from retrieval failure', async ({ page }) => {
    let unavailable = true;
    let attempts = 0;
    await page.route(`**${SSH_LOGS_PATH}`, (route) => {
      attempts += 1;
      return route.fulfill({
        json: unavailable
          ? { code: 500, data: null, message: 'kneo-e2e SSH logs unavailable' }
          : {
              code: 200,
              data: { items: SAFE_LOGS, total: SAFE_LOGS.length },
              message: '',
            },
      });
    });

    await page.goto('/logs/ssh');
    await expect(
      page.getByRole('alert').filter({ hasText: 'kneo-e2e SSH logs unavailable' }),
    ).toBeVisible();
    await expect(sshRows(page)).toHaveCount(0);

    unavailable = false;
    const retried = sshResponse(page);
    await page.locator('.fresh-button').click();
    await readSshLogs(await retried);
    await expectSafeRows(page, SAFE_LOGS);
    expect(attempts).toBeGreaterThanOrEqual(2);
  });
});
