import type { Page, Response, Route } from '@playwright/test';

import { test, expect } from '../../fixtures/read-only-test';

interface ApiEnvelope<T> {
  code: number;
  data: T;
  message: string;
}

interface FileReadBody {
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
const SYSTEM_FILES_PATH = '/api/v2/logs/system/files';
const SAFE_DATES = ['2026-10-07', '2026-10-06'];

function systemFilesResponse(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === 'GET' &&
      new URL(response.url()).pathname === SYSTEM_FILES_PATH,
  );
}

function fileReadResponse(page: Page): Promise<Response> {
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
    path: '/tmp/kneo-e2e-system.log',
    scope: '',
    taskStatus: '',
    total: lines.length,
    totalLines: lines.length,
  };
}

async function fulfillLogRead(route: Route, lines: string[] = []): Promise<void> {
  await route.fulfill({
    contentType: 'application/json',
    json: { code: 200, data: logData(lines), message: '' },
    status: 200,
  });
}

async function readSystemDates(response: Response): Promise<string[]> {
  expect(response.ok()).toBe(true);
  const envelope = (await response.json()) as ApiEnvelope<string[]>;
  expect(envelope.code, envelope.message).toBe(200);
  expect(Array.isArray(envelope.data)).toBe(true);
  for (const date of envelope.data) {
    expect(typeof date).toBe('string');
  }
  return envelope.data;
}

test.describe('Logs > System logs [H,F,R,P,C,A]', () => {
  test('maps live dates while replacing content reads with an empty safe response', async ({
    page,
  }) => {
    const readBodies: FileReadBody[] = [];
    await page.route(`**${FILE_READ_PATH}*`, async (route) => {
      readBodies.push(route.request().postDataJSON() as FileReadBody);
      await fulfillLogRead(route);
    });
    const filesResponse = systemFilesResponse(page);
    await page.goto('/logs/system');
    const dates = await readSystemDates(await filesResponse);

    if (dates.length === 0) {
      await expect(page.getByText('No logs available', { exact: true })).toBeVisible();
      return;
    }

    await expect.poll(() => readBodies.length).toBe(1);
    expect(readBodies[0]).toEqual({
      latest: true,
      name: dates[0],
      page: 1,
      pageSize: 500,
      type: 'system',
    });
    await expect(page.locator('.el-select').first()).toContainText(dates[0]);
    await expect(page.getByText('No logs available', { exact: true })).toBeVisible();

    const refreshedFiles = systemFilesResponse(page);
    await page.reload();
    expect(await readSystemDates(await refreshedFiles)).toEqual(dates);
    await expect.poll(() => readBodies.length).toBe(2);
    expect(readBodies[1]).toMatchObject({
      name: dates[0],
      type: 'system',
    });
  });

  test('switches dates and sources with exact synthetic read payloads', async ({
    page,
  }) => {
    const bodies: FileReadBody[] = [];
    await page.route(`**${SYSTEM_FILES_PATH}`, async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        json: { code: 200, data: SAFE_DATES, message: '' },
        status: 200,
      });
    });
    await page.route(`**${FILE_READ_PATH}*`, async (route) => {
      const body = route.request().postDataJSON() as FileReadBody;
      bodies.push(body);
      await fulfillLogRead(route, [`kneo-e2e safe line for ${body.name}`]);
    });

    let pending = fileReadResponse(page);
    await page.goto('/logs/system');
    let response = await pending;
    expect(response.request().postDataJSON()).toEqual({
      latest: true,
      name: SAFE_DATES[0],
      page: 1,
      pageSize: 500,
      type: 'system',
    });
    await expect(
      page.getByText(`kneo-e2e safe line for ${SAFE_DATES[0]}`, { exact: true }),
    ).toBeVisible();

    pending = fileReadResponse(page);
    await page.getByText('Panel Service', { exact: true }).click();
    response = await pending;
    expect(response.request().postDataJSON()).toEqual({
      latest: true,
      name: `Core-${SAFE_DATES[0]}`,
      page: 1,
      pageSize: 500,
      type: 'system',
    });
    await expect(
      page.getByRole('radio', { name: 'Panel Service', exact: true }),
    ).toBeChecked();

    pending = fileReadResponse(page);
    await page.locator('.el-select').first().click();
    await page
      .locator('.el-select-dropdown:visible')
      .getByRole('option', { name: SAFE_DATES[1], exact: true })
      .click();
    response = await pending;
    expect(response.request().postDataJSON()).toEqual({
      latest: true,
      name: `Core-${SAFE_DATES[1]}`,
      page: 1,
      pageSize: 500,
      type: 'system',
    });
    await expect(
      page.getByText(`kneo-e2e safe line for Core-${SAFE_DATES[1]}`, {
        exact: true,
      }),
    ).toBeVisible();
    expect(bodies).toHaveLength(3);
  });

  test('renders an empty date inventory', async ({
    page,
  }) => {
    await page.route(`**${FILE_READ_PATH}*`, async (route) => {
      await fulfillLogRead(route);
    });
    await page.route(`**${SYSTEM_FILES_PATH}`, async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        json: { code: 200, data: [], message: '' },
        status: 200,
      });
    });

    await page.goto('/logs/system');
    await expect(page.getByText('No logs available', { exact: true })).toBeVisible();
  });

  test('shows date-list failure feedback and recovers on reload', async ({
    page,
  }) => {
    let unavailable = true;
    let attempts = 0;
    await page.route(`**${FILE_READ_PATH}*`, (route) => fulfillLogRead(route));
    await page.route(`**${SYSTEM_FILES_PATH}`, async (route) => {
      attempts += 1;
      await route.fulfill({
        contentType: 'application/json',
        json: unavailable
          ? {
              code: 500,
              data: null,
              message: 'kneo-e2e system logs unavailable',
            }
          : { code: 200, data: SAFE_DATES, message: '' },
        status: 200,
      });
    });

    const rejected = systemFilesResponse(page);
    await page.goto('/logs/system');
    expect(((await (await rejected).json()) as ApiEnvelope<null>).code).toBe(500);
    await expect(
      page.getByText('kneo-e2e system logs unavailable').first(),
    ).toBeVisible();

    unavailable = false;
    const retriedFiles = systemFilesResponse(page);
    const retriedRead = fileReadResponse(page);
    await page.reload();
    expect(await readSystemDates(await retriedFiles)).toEqual(SAFE_DATES);
    await retriedRead;
    await expect(page.locator('.el-select').first()).toContainText(SAFE_DATES[0]);
    expect(attempts).toBeGreaterThanOrEqual(2);
  });
});
