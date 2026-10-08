import type { Page, Response } from '@playwright/test';

import { test, expect } from '../../fixtures/read-only-test';

interface ApiEnvelope<T> {
  code: number;
  data: T;
  message: string;
}

interface TaskLog {
  createdAt: string;
  currentStep: string;
  endAt: string;
  errorMsg: string;
  id: string;
  logFile: string;
  name: string;
  operate: string;
  operationLogID: number;
  resourceID: number;
  status: string;
  type: string;
}

interface TaskLogList {
  items: TaskLog[];
  total: number;
}

interface TaskLogSearch {
  page: number;
  pageSize: number;
  status: string;
  type: string;
}

const FILE_READ_PATH = '/api/v2/files/read';
const TASK_LOGS_PATH = '/api/v2/logs/tasks/search';

const DEFAULT_SEARCH: TaskLogSearch = {
  page: 1,
  pageSize: 20,
  status: '',
  type: '',
};

const SAFE_TASKS: TaskLog[] = [
  {
    createdAt: '2026-10-07T18:00:00Z',
    currentStep: 'kneo-e2e step alpha',
    endAt: '2026-10-07T18:01:00Z',
    errorMsg: '',
    id: 'kneo-e2e-task-alpha-id',
    logFile: '/tmp/kneo-e2e-task-alpha.log',
    name: 'kneo-e2e task alpha',
    operate: 'kneo-e2e operation alpha',
    operationLogID: 93001,
    resourceID: 94001,
    status: 'Success',
    type: 'kneo-e2e-type',
  },
  {
    createdAt: '2026-10-07T17:00:00Z',
    currentStep: 'kneo-e2e step beta',
    endAt: '2026-10-07T17:01:00Z',
    errorMsg: 'kneo-e2e safe failure',
    id: 'kneo-e2e-task-beta-id',
    logFile: '/tmp/kneo-e2e-task-beta.log',
    name: 'kneo-e2e task beta',
    operate: 'kneo-e2e operation beta',
    operationLogID: 93002,
    resourceID: 94002,
    status: 'Failed',
    type: 'kneo-e2e-type',
  },
];

function taskResponse(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === TASK_LOGS_PATH,
  );
}

async function readTaskLogs(response: Response): Promise<TaskLogList> {
  expect(response.ok()).toBe(true);
  const envelope = (await response.json()) as ApiEnvelope<TaskLogList>;
  expect(envelope.code, envelope.message).toBe(200);
  expect(Array.isArray(envelope.data.items)).toBe(true);
  expect(typeof envelope.data.total).toBe('number');
  return envelope.data;
}

async function openTaskLogs(
  page: Page,
): Promise<{ logs: TaskLogList; response: Response }> {
  const pending = taskResponse(page);
  await page.goto('/logs/task');
  const response = await pending;
  return { logs: await readTaskLogs(response), response };
}

async function expectTaskRows(page: Page, tasks: TaskLog[]): Promise<void> {
  const rows = page.locator('.el-table__row');
  await expect(rows).toHaveCount(tasks.length);
  for (const task of tasks) {
    const row = rows.filter({ hasText: task.name });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(task.status);
    await expect(
      row.getByRole('button', { name: 'View', exact: true }),
    ).toBeVisible();
  }
}

async function routeSafeTasks(page: Page): Promise<void> {
  await page.route(`**${TASK_LOGS_PATH}`, async (route) => {
    const body = route.request().postDataJSON() as TaskLogSearch;
    const items = SAFE_TASKS.filter(
      (task) => !body.status || task.status === body.status,
    );
    await route.fulfill({
      contentType: 'application/json',
      json: { code: 200, data: { items, total: items.length }, message: '' },
      status: 200,
    });
  });
}

test.describe('Logs > Task logs [H,F,R,P,C,A]', () => {
  test('maps the live paged response without exposing task contents', async ({
    page,
  }) => {
    const { logs, response } = await openTaskLogs(page);
    expect(response.request().postDataJSON()).toEqual(DEFAULT_SEARCH);
    expect(logs.total).toBeGreaterThanOrEqual(logs.items.length);
    await expect(page.locator('.el-table__row')).toHaveCount(logs.items.length);

    for (const header of ['Task Name', 'Status', 'Logs', 'Date']) {
      await expect(
        page.getByRole('columnheader', { name: header, exact: true }),
      ).toBeVisible();
    }
    if (logs.items.length === 0) {
      await expect(page.getByText('No Data', { exact: true })).toBeVisible();
    }

    const refreshedResponse = taskResponse(page);
    await page.reload();
    const refreshed = await readTaskLogs(await refreshedResponse);
    await expect(page.locator('.el-table__row')).toHaveCount(
      refreshed.items.length,
    );
  });

  test('filters deterministic multi-item results into success and empty states', async ({
    page,
  }) => {
    await routeSafeTasks(page);
    const opened = await openTaskLogs(page);
    expect(opened.response.request().postDataJSON()).toEqual(DEFAULT_SEARCH);
    await expectTaskRows(page, SAFE_TASKS);

    let pending = taskResponse(page);
    await page.locator('.el-select').first().click();
    await page
      .locator('.el-select-dropdown:visible')
      .getByRole('option', { name: 'Success', exact: true })
      .click();
    let body = (await pending).request().postDataJSON() as TaskLogSearch;
    expect(body).toEqual({ ...DEFAULT_SEARCH, status: 'Success' });
    await expectTaskRows(page, [SAFE_TASKS[0]]);

    pending = taskResponse(page);
    await page.locator('.el-select').first().click();
    await page
      .locator('.el-select-dropdown:visible')
      .getByRole('option', { name: 'Running', exact: true })
      .click();
    body = (await pending).request().postDataJSON() as TaskLogSearch;
    expect(body).toEqual({ ...DEFAULT_SEARCH, status: 'Executing' });
    await expect(page.locator('.el-table__row')).toHaveCount(0);
    await expect(page.getByText('No Data', { exact: true })).toBeVisible();
  });

  test('loads exact synthetic task output in the detail dialog', async ({ page }) => {
    await routeSafeTasks(page);
    const safeLines = [
      'kneo-e2e task output alpha',
      'kneo-e2e task output complete',
    ];
    await page.route(`**${FILE_READ_PATH}*`, async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        json: {
          code: 200,
          data: {
            end: true,
            lines: safeLines,
            path: '/tmp/kneo-e2e-task-alpha.log',
            scope: '',
            taskStatus: 'Success',
            total: safeLines.length,
            totalLines: safeLines.length,
          },
          message: '',
        },
        status: 200,
      });
    });
    await openTaskLogs(page);

    const task = SAFE_TASKS[0];
    const readResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === FILE_READ_PATH,
    );
    await page
      .locator('.el-table__row')
      .filter({ hasText: task.name })
      .getByRole('button', { name: 'View', exact: true })
      .click();
    const response = await readResponse;
    const body = response.request().postDataJSON();
    expect(body).toMatchObject({
      latest: true,
      page: 1,
      pageSize: 500,
      taskID: task.id,
      type: 'task',
    });
    expect(new URL(response.url()).searchParams.get('operateNode')).toBe('local');
    const envelope = (await response.json()) as ApiEnvelope<{
      lines: string[];
      totalLines: number;
    }>;
    expect(envelope.data.lines).toEqual(safeLines);
    expect(envelope.data.totalLines).toBe(safeLines.length);

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    for (const line of safeLines) {
      await expect(dialog).toContainText(line);
    }
  });

  test('shows retrieval failure feedback and recovers on reload', async ({
    page,
  }) => {
    let unavailable = true;
    let attempts = 0;
    await page.route(`**${TASK_LOGS_PATH}`, async (route) => {
      attempts += 1;
      await route.fulfill({
        contentType: 'application/json',
        json: unavailable
          ? {
              code: 500,
              data: null,
              message: 'kneo-e2e task logs unavailable',
            }
          : {
              code: 200,
              data: { items: SAFE_TASKS, total: SAFE_TASKS.length },
              message: '',
            },
        status: 200,
      });
    });

    const rejected = taskResponse(page);
    await page.goto('/logs/task');
    expect(((await (await rejected).json()) as ApiEnvelope<null>).code).toBe(500);
    await expect(
      page.getByText('kneo-e2e task logs unavailable').first(),
    ).toBeVisible();
    await expect(page.locator('.el-table__row')).toHaveCount(0);

    unavailable = false;
    const retried = taskResponse(page);
    await page.reload();
    await readTaskLogs(await retried);
    await expectTaskRows(page, SAFE_TASKS);
    expect(attempts).toBeGreaterThanOrEqual(2);
  });
});
