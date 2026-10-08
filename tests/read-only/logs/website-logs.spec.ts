import type { Page, Response, Route } from '@playwright/test';

import { test, expect } from '../../fixtures/read-only-test';

interface ApiEnvelope<T> {
  code: number;
  data: T;
  message?: string;
}

interface Website {
  id: number;
  primaryDomain: string;
}

interface WebsiteReadBody {
  id: number;
  latest: boolean;
  name: string;
  page: number;
  pageSize: number;
  type: string;
}

interface LogReadData {
  end: boolean;
  lines: string[];
  path: string;
  scope: string;
  taskStatus: string;
  total: number;
  totalLines: number;
}

const FILE_READ_PATH = '/api/v2/files/read';
const WEBSITE_LIST_PATH = '/api/v2/websites/list';
const SAFE_WEBSITES: Website[] = [
  { id: 97001, primaryDomain: 'alpha.kneo-e2e.invalid' },
  { id: 97002, primaryDomain: 'beta.kneo-e2e.invalid' },
];

function listResponse(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === 'GET' &&
      new URL(response.url()).pathname === WEBSITE_LIST_PATH,
  );
}

function readResponse(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === FILE_READ_PATH,
  );
}

function logData(lines: string[] = []): LogReadData {
  return {
    end: true,
    lines,
    path: '/tmp/kneo-e2e-website.log',
    scope: '',
    taskStatus: '',
    total: lines.length,
    totalLines: lines.length,
  };
}

async function fulfillRead(route: Route, lines: string[] = []): Promise<void> {
  await route.fulfill({
    json: { code: 200, data: logData(lines), message: '' },
  });
}

async function routeWebsites(page: Page, websites = SAFE_WEBSITES): Promise<void> {
  await page.route(`**${WEBSITE_LIST_PATH}`, (route) =>
    route.fulfill({ json: { code: 200, data: websites, message: '' } }),
  );
}

test.describe('Logs > Website logs [H,V,F,R,P,C,A]', () => {
  test('maps the live website inventory without reading live log content', async ({
    page,
  }) => {
    const bodies: WebsiteReadBody[] = [];
    await page.route(`**${FILE_READ_PATH}*`, async (route) => {
      bodies.push(route.request().postDataJSON() as WebsiteReadBody);
      await fulfillRead(route);
    });
    const pending = listResponse(page);
    await page.goto('/logs/website');
    const response = await pending;
    expect(response.ok()).toBe(true);
    const envelope = (await response.json()) as ApiEnvelope<Website[] | null>;
    expect(envelope.code, envelope.message).toBe(200);
    const websites = envelope.data ?? [];
    expect(Array.isArray(websites)).toBe(true);

    if (websites.length === 0) {
      await expect(page.getByRole('button', { name: 'Download' })).toBeDisabled();
      await expect(page.getByRole('button', { name: 'Clean logs' })).toBeDisabled();
      expect(bodies).toEqual([]);
      return;
    }

    await expect.poll(() => bodies.length).toBe(1);
    expect(bodies[0]).toMatchObject({
      id: websites[0].id,
      name: 'access.log',
      type: 'website',
    });
    await expect(page.locator('.el-select').first()).toContainText(
      websites[0].primaryDomain,
    );
  });

  test('switches exact sites and access/error logs with safe rendered content', async ({
    page,
  }) => {
    await routeWebsites(page);
    const bodies: WebsiteReadBody[] = [];
    await page.route(`**${FILE_READ_PATH}*`, async (route) => {
      const body = route.request().postDataJSON() as WebsiteReadBody;
      bodies.push(body);
      await fulfillRead(route, [
        `kneo-e2e safe ${body.name} line for website ${body.id}`,
      ]);
    });

    let pending = readResponse(page);
    await page.goto('/logs/website');
    let response = await pending;
    expect(response.request().postDataJSON()).toEqual({
      id: SAFE_WEBSITES[0].id,
      latest: true,
      name: 'access.log',
      page: 1,
      pageSize: 500,
      type: 'website',
    });
    await expect(
      page.getByText(
        `kneo-e2e safe access.log line for website ${SAFE_WEBSITES[0].id}`,
        { exact: true },
      ),
    ).toBeVisible();

    pending = readResponse(page);
    await page.getByRole('button', { name: 'Error logs', exact: true }).click();
    response = await pending;
    expect(response.request().postDataJSON()).toMatchObject({
      id: SAFE_WEBSITES[0].id,
      name: 'error.log',
      type: 'website',
    });

    pending = readResponse(page);
    await page.locator('.el-select').first().click();
    await page
      .locator('.el-select-dropdown:visible')
      .getByRole('option', { name: SAFE_WEBSITES[1].primaryDomain, exact: true })
      .click();
    response = await pending;
    expect(response.request().postDataJSON()).toMatchObject({
      id: SAFE_WEBSITES[1].id,
      name: 'error.log',
      type: 'website',
    });
    await expect(
      page.getByText(
        `kneo-e2e safe error.log line for website ${SAFE_WEBSITES[1].id}`,
        { exact: true },
      ),
    ).toBeVisible();
    expect(bodies).toHaveLength(3);
  });

  test('cancels cleanup without sending a website-log mutation', async ({ page }) => {
    await routeWebsites(page, [SAFE_WEBSITES[0]]);
    await page.route(`**${FILE_READ_PATH}*`, (route) =>
      fulfillRead(route, ['kneo-e2e safe website line']),
    );
    const mutations: string[] = [];
    page.on('request', (request) => {
      const path = new URL(request.url()).pathname;
      if (request.method() === 'POST' && path === '/api/v2/websites/log') {
        mutations.push(path);
      }
    });

    await page.goto('/logs/website');
    const clean = page.getByRole('button', { name: 'Clean logs', exact: true });
    await expect(clean).toBeEnabled();
    await clean.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(dialog).toBeHidden();
    expect(mutations).toEqual([]);
  });

  test('handles an empty website inventory without reading log content', async ({
    page,
  }) => {
    await routeWebsites(page, []);
    const readBodies: WebsiteReadBody[] = [];
    await page.route(`**${FILE_READ_PATH}*`, async (route) => {
      readBodies.push(route.request().postDataJSON() as WebsiteReadBody);
      await fulfillRead(route);
    });

    await page.goto('/logs/website');
    await expect(page.getByRole('button', { name: 'Download' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Clean logs' })).toBeDisabled();
    expect(readBodies).toEqual([]);
  });

  test('shows inventory failure feedback and recovers on reload', async ({ page }) => {
    let unavailable = true;
    let attempts = 0;
    await page.route(`**${WEBSITE_LIST_PATH}`, (route) => {
      attempts += 1;
      return route.fulfill({
        json: unavailable
          ? { code: 500, data: null, message: 'kneo-e2e websites unavailable' }
          : { code: 200, data: SAFE_WEBSITES, message: '' },
      });
    });
    await page.route(`**${FILE_READ_PATH}*`, (route) => fulfillRead(route));

    await page.goto('/logs/website');
    await expect(page.getByRole('alert')).toContainText(
      'kneo-e2e websites unavailable',
    );

    unavailable = false;
    const retriedList = listResponse(page);
    const retriedRead = readResponse(page);
    await page.reload();
    const envelope = (await (await retriedList).json()) as ApiEnvelope<Website[]>;
    expect(envelope.data).toEqual(SAFE_WEBSITES);
    await retriedRead;
    await expect(page.locator('.el-select').first()).toContainText(
      SAFE_WEBSITES[0].primaryDomain,
    );
    expect(attempts).toBe(2);
  });
});
