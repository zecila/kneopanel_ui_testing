import type { Locator, Page, Response } from '@playwright/test';

import { test, expect } from '../../fixtures/mutating-test';
import { createShellCronJobThroughUi } from '../../helpers/cron-ui';
import { uniqueResourceName } from '../../helpers/mutation-safety';

interface ApiEnvelope<T> {
  code: number;
  data: T;
  message: string;
}

interface CronRecord {
  id: number | string;
  interval: number;
  startTime: string;
  status: string;
  taskID: string;
}

interface RecordList {
  items: CronRecord[];
  total: number;
}

const RECORDS_PATH = '/api/v2/cronjobs/search/records';
const HANDLE_PATH = '/api/v2/cronjobs/handle';

function cronRow(page: Page, name: string): Locator {
  return page.getByRole('row').filter({ hasText: name });
}

async function readRecords(response: Response): Promise<RecordList> {
  const envelope = (await response.json()) as ApiEnvelope<{
    items: CronRecord[] | null;
    total: number;
  }>;
  expect(envelope.code).toBe(200);
  expect(envelope.message).toBe('');
  return { ...envelope.data, items: envelope.data.items ?? [] };
}

async function waitForRecords(
  page: Page,
  expectedStatuses: string[],
  expectedTotal?: number,
): Promise<RecordList> {
  const response = await page.waitForResponse(async (candidate) => {
    if (
      candidate.request().method() !== 'POST' ||
      new URL(candidate.url()).pathname !== RECORDS_PATH ||
      !candidate.ok()
    ) {
      return false;
    }

    try {
      const records = await readRecords(candidate);
      const statuses = records.items.map((record) => record.status);
      return (
        (expectedTotal === undefined
          ? records.total >= expectedStatuses.length
          : records.total === expectedTotal) &&
        expectedStatuses.every((status) => statuses.includes(status))
      );
    } catch {
      return false;
    }
  });

  return readRecords(response);
}

async function runJob(page: Page, row: Locator, id: number | string) {
  const handled = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === HANDLE_PATH,
  );
  await row.getByRole('button', { name: 'Run', exact: true }).click();
  const response = await handled;
  expect(response.ok()).toBe(true);
  expect(response.request().postDataJSON()).toEqual({ id });
  expect((await response.json()) as ApiEnvelope<null>).toEqual({
    code: 200,
    data: null,
    message: 'success',
  });
}

async function openRecords(
  page: Page,
  row: Locator,
  expectedStatuses: string[],
  expectedTotal?: number,
): Promise<RecordList> {
  const records = waitForRecords(page, expectedStatuses, expectedTotal);
  await row.getByRole('button', { name: 'Records', exact: true }).click();
  await expect(page.getByText('Records', { exact: true })).toBeVisible();
  return records;
}

test.describe('Cron job state and execution [H,V,F,R,C,K,A]', () => {
  test('cancels, disables, persists, and re-enables one exact job', async ({
    mutationRegistry,
    page,
  }) => {
    const name = uniqueResourceName('cron-status');
    const job = await createShellCronJobThroughUi(
      page,
      mutationRegistry,
      name,
    );
    let row = cronRow(page, name);
    await expect(row.getByRole('button', { name: 'Enabled' })).toBeVisible();
    await row.locator('.el-checkbox').click();

    let statusRequestCount = 0;
    page.on('request', (request) => {
      if (
        request.method() === 'POST' &&
        new URL(request.url()).pathname === '/api/v2/cronjobs/status'
      ) {
        statusRequestCount += 1;
      }
    });

    await page.getByRole('button', { name: 'Disable', exact: true }).click();
    let dialog = page.getByRole('dialog', { name: 'Change status' });
    await expect(dialog).toContainText(
      'This will stop the scheduled task from automatically executing.',
    );
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    expect(statusRequestCount).toBe(0);
    await expect(row.getByRole('button', { name: 'Enabled' })).toBeVisible();

    const disabled = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === '/api/v2/cronjobs/status',
    );
    await page.getByRole('button', { name: 'Disable', exact: true }).click();
    dialog = page.getByRole('dialog', { name: 'Change status' });
    await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
    const disabledResponse = await disabled;
    expect(disabledResponse.ok()).toBe(true);
    expect(disabledResponse.request().postDataJSON()).toEqual({
      id: job.id,
      status: 'Disable',
    });
    await expect(row.getByRole('button', { name: 'Disabled' })).toBeVisible();

    await page.reload();
    row = cronRow(page, name);
    await expect(row.getByRole('button', { name: 'Disabled' })).toBeVisible();
    await row.locator('.el-checkbox').click();

    const enabled = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === '/api/v2/cronjobs/status',
    );
    await page.getByRole('button', { name: 'Enable', exact: true }).click();
    dialog = page.getByRole('dialog', { name: 'Change status' });
    await expect(dialog).toContainText(
      'This will allow the scheduled task to automatically execute.',
    );
    await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
    const enabledResponse = await enabled;
    expect(enabledResponse.ok()).toBe(true);
    expect(enabledResponse.request().postDataJSON()).toEqual({
      id: job.id,
      status: 'Enable',
    });

    await page.reload();
    await expect(
      cronRow(page, name).getByRole('button', { name: 'Enabled' }),
    ).toBeVisible();
  });

  test('runs a safe command and persists its successful record', async ({
    mutationRegistry,
    page,
  }) => {
    const name = uniqueResourceName('cron-success');
    const job = await createShellCronJobThroughUi(
      page,
      mutationRegistry,
      name,
    );
    let row = cronRow(page, name);

    await runJob(page, row, job.id);
    let records = await openRecords(page, row, ['Success']);
    expect(records.total).toBe(1);
    expect(records.items).toHaveLength(1);
    expect(records.items[0]).toEqual(
      expect.objectContaining({
        interval: expect.any(Number),
        startTime: expect.any(String),
        status: 'Success',
        taskID: expect.any(String),
      }),
    );
    await expect(page.getByText('Success', { exact: true }).first()).toBeVisible();
    await expect(page.getByText(`Run script ${name} succeeded`)).toBeVisible();
    await expect(page.getByText('[TASK-END]', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: /Back/ }).click();
    await page.reload();
    row = cronRow(page, name);
    records = await openRecords(page, row, ['Success']);
    expect(records.total).toBe(1);
    await expect(page.getByText('Success', { exact: true }).first()).toBeVisible();

    const downloadEvent = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download', exact: true }).click();
    const download = await downloadEvent;
    expect(download.suggestedFilename()).toBe(`${records.items[0].taskID}.log`);
    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    const output = Buffer.concat(chunks).toString('utf8');
    expect(output).toContain(`Execute [cronjob-${name}] [START]`);
    expect(output).toContain(`Run script ${name} succeeded`);
    expect(output).toContain('[TASK-END]');

    const clearButton = page.getByRole('button', {
      name: 'Clear',
      exact: true,
    });
    await clearButton.click();
    let dialog = page.getByRole('dialog', { name: 'Clear' });
    await expect(dialog).toContainText(
      'This cleanup cannot be undone. Continue?',
    );
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Download', exact: true }),
    ).toBeVisible();

    const cleared = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname ===
          '/api/v2/cronjobs/records/clean',
    );
    const emptyRecords = waitForRecords(page, [], 0);
    await clearButton.click();
    dialog = page.getByRole('dialog', { name: 'Clear' });
    await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
    const clearedResponse = await cleared;
    expect(clearedResponse.request().postDataJSON()).toEqual({
      cronjobID: job.id,
    });
    expect((await clearedResponse.json()) as ApiEnvelope<null>).toEqual({
      code: 200,
      data: null,
      message: 'success',
    });
    records = await emptyRecords;
    expect(records).toEqual({ items: [], total: 0 });
    await expect(
      page.getByRole('button', { name: 'Download', exact: true }),
    ).toHaveCount(0);

    await page.getByRole('button', { name: /Back/ }).click();
    await page.reload();
    row = cronRow(page, name);
    records = await openRecords(page, row, [], 0);
    expect(records).toEqual({ items: [], total: 0 });
  });

  test('shows a failed trigger request and allows a clean retry', async ({
    mutationRegistry,
    page,
  }) => {
    const name = uniqueResourceName('cron-trigger-retry');
    const job = await createShellCronJobThroughUi(
      page,
      mutationRegistry,
      name,
    );
    let row = cronRow(page, name);

    await page.route(`**${HANDLE_PATH}`, async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        json: {
          code: 500,
          data: null,
          message: 'kneo-e2e trigger unavailable',
        },
        status: 200,
      });
    });
    const rejected = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === HANDLE_PATH,
    );
    await row.getByRole('button', { name: 'Run', exact: true }).click();
    const rejectedResponse = await rejected;
    expect(rejectedResponse.request().postDataJSON()).toEqual({ id: job.id });
    expect((await rejectedResponse.json()) as ApiEnvelope<null>).toEqual({
      code: 500,
      data: null,
      message: 'kneo-e2e trigger unavailable',
    });
    await expect(page.getByText('kneo-e2e trigger unavailable')).toBeVisible();

    let records = await openRecords(page, row, [], 0);
    expect(records).toEqual({ items: [], total: 0 });
    await page.getByRole('button', { name: /Back/ }).click();
    await page.unroute(`**${HANDLE_PATH}`);

    row = cronRow(page, name);
    await runJob(page, row, job.id);
    records = await openRecords(page, row, ['Success'], 1);
    expect(records.items).toHaveLength(1);
    await expect(page.getByText(`Run script ${name} succeeded`)).toBeVisible();
  });

  test('rejects a concurrent run and creates only one history record', async ({
    mutationRegistry,
    page,
  }) => {
    test.setTimeout(90_000);
    const name = uniqueResourceName('cron-run-guard');
    const job = await createShellCronJobThroughUi(
      page,
      mutationRegistry,
      name,
      undefined,
      'sleep 3',
    );
    const row = cronRow(page, name);
    const runButton = row.getByRole('button', { name: 'Run', exact: true });

    const firstHandled = page.waitForResponse(async (response) => {
      if (
        response.request().method() !== 'POST' ||
        new URL(response.url()).pathname !== HANDLE_PATH
      ) {
        return false;
      }
      const envelope = (await response.json()) as ApiEnvelope<null>;
      return envelope.code === 200;
    });
    await runButton.click();

    const concurrentRejected = page.waitForResponse(async (response) => {
      if (
        response.request().method() !== 'POST' ||
        new URL(response.url()).pathname !== HANDLE_PATH
      ) {
        return false;
      }
      const envelope = (await response.json()) as ApiEnvelope<null>;
      return envelope.code === 500;
    });
    await runButton.click();
    const rejectedResponse = await concurrentRejected;
    expect(rejectedResponse.request().postDataJSON()).toEqual({ id: job.id });
    expect((await rejectedResponse.json()) as ApiEnvelope<null>).toEqual({
      code: 500,
      data: null,
      message: 'Internal server error: Task is already running',
    });
    await expect(page.getByText('Task is already running')).toBeVisible();

    const firstResponse = await firstHandled;
    expect(firstResponse.request().postDataJSON()).toEqual({ id: job.id });
    const records = await openRecords(page, row, ['Success'], 1);
    expect(records.items).toHaveLength(1);
    expect(records.items[0].status).toBe('Success');
  });

  test('shows a failed command, then records a successful retry', async ({
    mutationRegistry,
    page,
  }) => {
    test.setTimeout(120_000);
    const name = uniqueResourceName('cron-retry');
    const job = await createShellCronJobThroughUi(
      page,
      mutationRegistry,
      name,
      undefined,
      'echo kneo-e2e-expected-failure >&2\nexit 7',
    );
    let row = cronRow(page, name);

    await runJob(page, row, job.id);
    let records = await openRecords(page, row, ['Failed']);
    expect(records.total).toBe(1);
    await expect(page.getByText('Failed', { exact: true }).first()).toBeVisible();
    await expect(
      page.getByText(`Run script ${name} failed: exit status 7`).first(),
    ).toBeVisible();

    await page.getByRole('button', { name: /Back/ }).click();
    row = cronRow(page, name);
    await row.getByRole('button', { name: 'More', exact: true }).last().click();
    await page.getByRole('menuitem', { name: 'Edit', exact: true }).click();
    await page.locator('[contenteditable="true"]').fill('/bin/true');
    const updated = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === '/api/v2/cronjobs/update',
    );
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();
    expect((await updated).ok()).toBe(true);

    row = cronRow(page, name);
    await runJob(page, row, job.id);
    records = await openRecords(page, row, ['Failed', 'Success']);
    expect(records.total).toBe(2);
    expect(records.items.map((record) => record.status).sort()).toEqual([
      'Failed',
      'Success',
    ]);
    await expect(page.getByText('Failed', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Success', { exact: true }).first()).toBeVisible();
  });
});
