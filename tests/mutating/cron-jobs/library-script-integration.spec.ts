import type { Locator, Page, Response } from '@playwright/test';

import { test, expect } from '../../fixtures/mutating-test';
import { createScriptThroughUi, openScriptLibrary, visibleDrawer } from '../../helpers/cron-ui';
import { uniqueResourceName } from '../../helpers/mutation-safety';

interface ApiEnvelope<T> {
  code: number;
  data: T;
  message: string;
}

interface CronRecord {
  status: string;
}

interface RecordList {
  items: CronRecord[];
  total: number;
}

const CREATE_PATH = '/api/v2/cronjobs';
const DELETE_JOB_PATH = '/api/v2/cronjobs/del';
const DELETE_SCRIPT_PATH = '/api/v2/core/script/del';
const HANDLE_PATH = '/api/v2/cronjobs/handle';
const RECORDS_PATH = '/api/v2/cronjobs/search/records';

function cronRow(page: Page, name: string): Locator {
  return page.getByRole('row').filter({ hasText: name });
}

function scriptFormItem(page: Page): Locator {
  return page
    .locator('.el-form-item__label')
    .filter({ hasText: /^Script$/ })
    .locator('xpath=..');
}

function scriptLibrarySelect(page: Page): Locator {
  return page
    .getByRole('radiogroup', { name: 'Script', exact: true })
    .locator('xpath=following::input[@role="combobox"][1]');
}

function scriptLibraryControl(page: Page): Locator {
  return scriptLibrarySelect(page).locator(
    'xpath=ancestor::div[contains(concat(" ", normalize-space(@class), " "), " el-select ")][1]',
  );
}

async function selectLibraryScript(page: Page, name: string): Promise<void> {
  const item = scriptFormItem(page);
  await item.getByText('Script Library', { exact: true }).click();
  const select = scriptLibrarySelect(page);
  await expect(select).toBeVisible();
  await select.click();
  await page.getByRole('option', { name, exact: true }).click();
  await expect(scriptLibraryControl(page)).toContainText(name);
}

function containsExactValue(value: unknown, expected: unknown): boolean {
  if (String(value) === String(expected)) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.some((item) => containsExactValue(item, expected));
  }
  if (value && typeof value === 'object') {
    return Object.values(value).some((item) =>
      containsExactValue(item, expected),
    );
  }
  return false;
}

async function readRecords(response: Response): Promise<RecordList> {
  const envelope = (await response.json()) as ApiEnvelope<{
    items: CronRecord[] | null;
    total: number;
  }>;
  expect(envelope.code, envelope.message).toBe(200);
  return { ...envelope.data, items: envelope.data.items ?? [] };
}

async function waitForSuccessfulRecords(
  page: Page,
  expectedTotal: number,
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
      return (
        records.total === expectedTotal &&
        records.items.every((record) => record.status === 'Success')
      );
    } catch {
      return false;
    }
  });
  return readRecords(response);
}

async function waitForRecordTotal(
  page: Page,
  expectedTotal: number,
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
      return (await readRecords(candidate)).total === expectedTotal;
    } catch {
      return false;
    }
  });
  return readRecords(response);
}

async function runAndOpenRecords(
  page: Page,
  row: Locator,
  jobId: number | string,
  expectedTotal: number,
): Promise<RecordList> {
  const handled = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === HANDLE_PATH,
  );
  await row.getByRole('button', { name: 'Run', exact: true }).click();
  const handledResponse = await handled;
  expect(handledResponse.request().postDataJSON()).toEqual({ id: jobId });
  expect((await handledResponse.json()) as ApiEnvelope<null>).toEqual({
    code: 200,
    data: null,
    message: 'success',
  });

  const records = waitForSuccessfulRecords(page, expectedTotal);
  await row.getByRole('button', { name: 'Records', exact: true }).click();
  return records;
}

test('uses one exact Script Library entry in a cron job [H,V,F,R,X,K,A]', async ({
  mutationRegistry,
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  test.info().annotations.push({
    type: 'bug-report',
    description:
      'docs/bugs/2026-10-07/verified-ui-bugs-10-07-2026.md#34-a-script-library-entry-can-be-deleted-while-a-cron-job-still-references-it',
  });
  const scriptName = uniqueResourceName('library-source');
  const jobName = uniqueResourceName('library-cron');
  const firstMarker = `${scriptName}-v1`;
  const secondMarker = `${scriptName}-v2`;
  const script = await createScriptThroughUi(
    page,
    mutationRegistry,
    scriptName,
    { script: `/bin/echo ${firstMarker}` },
  );

  await page.goto('/cronjobs/cronjob');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill(jobName);
  const item = scriptFormItem(page);
  await item.getByText('Script Library', { exact: true }).click();

  let createRequests = 0;
  const countCreates = (request: { method(): string; url(): string }) => {
    if (
      request.method() === 'POST' &&
      new URL(request.url()).pathname === CREATE_PATH
    ) {
      createRequests += 1;
    }
  };
  page.on('request', countCreates);
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  expect(createRequests).toBe(0);
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue(jobName);
  await expect(
    page.getByText('Select an item in the list', { exact: true }),
  ).toBeVisible();
  await expect(scriptLibrarySelect(page)).toHaveValue('');

  await selectLibraryScript(page, scriptName);
  await mutationRegistry.prepare('cron-job', jobName);
  await page.route(`**${CREATE_PATH}`, async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      json: {
        code: 500,
        data: null,
        message: 'kneo-e2e library cron creation unavailable',
      },
      status: 200,
    });
  });
  const rejected = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === CREATE_PATH,
  );
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  const rejectedResponse = await rejected;
  expect((await rejectedResponse.json()) as ApiEnvelope<null>).toEqual({
    code: 500,
    data: null,
    message: 'kneo-e2e library cron creation unavailable',
  });
  await expect(
    page.getByText('kneo-e2e library cron creation unavailable'),
  ).toBeVisible();

  await page.unroute(`**${CREATE_PATH}`);
  const created = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === CREATE_PATH,
  );
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  const createdResponse = await created;
  expect(createdResponse.ok()).toBe(true);
  const createBody = createdResponse.request().postDataJSON() as Record<
    string,
    unknown
  >;
  expect(createBody.name).toBe(jobName);
  expect(containsExactValue(createBody, script.id)).toBe(true);
  const job = await mutationRegistry.capture('cron-job', jobName);
  page.off('request', countCreates);

  let row = cronRow(page, jobName);
  await expect(row).toBeVisible();
  await page.reload();
  row = cronRow(page, jobName);
  await row.getByRole('button', { name: 'More', exact: true }).last().click();
  await page.getByRole('menuitem', { name: 'Edit', exact: true }).click();
  await expect(scriptLibraryControl(page)).toContainText(scriptName);
  await page.getByRole('button', { name: 'Back', exact: true }).last().click();

  row = cronRow(page, jobName);
  let records = await runAndOpenRecords(page, row, job.id, 1);
  expect(records.total).toBe(1);
  await expect(page.getByText(firstMarker, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Back/ }).click();

  await openScriptLibrary(page);
  let scriptRow = page.getByRole('row').filter({ hasText: scriptName });
  await scriptRow.getByRole('button', { name: 'Edit', exact: true }).click();
  let drawer = visibleDrawer(page);
  await drawer
    .getByLabel('Script', { exact: true })
    .getByRole('textbox')
    .fill(`/bin/echo ${secondMarker}`);
  const updated = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/api/v2/core/script/update',
  );
  await drawer.getByRole('button', { name: 'Confirm', exact: true }).click();
  expect((await updated).ok()).toBe(true);

  await page.getByText('Cron Job', { exact: true }).click();
  row = cronRow(page, jobName);
  records = await runAndOpenRecords(page, row, job.id, 2);
  expect(records.total).toBe(2);
  await expect(page.getByText(secondMarker, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Back/ }).click();

  await openScriptLibrary(page);
  scriptRow = page.getByRole('row').filter({ hasText: scriptName });
  const assignedScriptDeletion = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === DELETE_SCRIPT_PATH,
  );
  await scriptRow.getByRole('button', { name: 'Delete', exact: true }).click();
  let confirm = page.getByRole('button', { name: 'Confirm', exact: true });
  await confirm.click();
  const assignedDeletionEnvelope = (await (
    await assignedScriptDeletion
  ).json()) as ApiEnvelope<null>;
  const deletedWhileAssigned = assignedDeletionEnvelope.code === 200;
  let postDeleteHandleCode: number | null = null;
  let postDeleteRecordStatuses: string[] = [];
  if (deletedWhileAssigned) {
    await mutationRegistry.confirmDeleted(script);
    await expect(scriptRow).toHaveCount(0);
  } else {
    expect(assignedDeletionEnvelope.message).not.toBe('');
    await expect(scriptRow).toBeVisible();
  }

  await page.getByText('Cron Job', { exact: true }).click();
  row = cronRow(page, jobName);
  if (deletedWhileAssigned) {
    const handled = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === HANDLE_PATH,
    );
    await row.getByRole('button', { name: 'Run', exact: true }).click();
    const handledEnvelope = (await (await handled).json()) as ApiEnvelope<null>;
    postDeleteHandleCode = handledEnvelope.code;
    if (handledEnvelope.code === 200) {
      const thirdRecords = waitForRecordTotal(page, 3);
      await row.getByRole('button', { name: 'Records', exact: true }).click();
      const recordsAfterDeletion = await thirdRecords;
      postDeleteRecordStatuses = recordsAfterDeletion.items.map(
        ({ status }) => status,
      );
      expect(
        recordsAfterDeletion.items.some(({ status }) => status !== 'Success'),
      ).toBe(true);
      await page.getByRole('button', { name: /Back/ }).click();
      row = cronRow(page, jobName);
    } else {
      expect(handledEnvelope.message).not.toBe('');
      await expect(page.getByText(handledEnvelope.message).first()).toBeVisible();
    }
  }

  const jobDeleted = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === DELETE_JOB_PATH,
  );
  await row.getByRole('button', { name: 'More', exact: true }).last().click();
  await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  expect((await jobDeleted).ok()).toBe(true);
  await mutationRegistry.confirmDeleted(job);

  if (!deletedWhileAssigned) {
    await openScriptLibrary(page);
    scriptRow = page.getByRole('row').filter({ hasText: scriptName });
    const scriptDeleted = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === DELETE_SCRIPT_PATH,
    );
    await scriptRow.getByRole('button', { name: 'Delete', exact: true }).click();
    confirm = page.getByRole('button', { name: 'Confirm', exact: true });
    await confirm.click();
    expect((await scriptDeleted).ok()).toBe(true);
    await mutationRegistry.confirmDeleted(script);
    await expect(scriptRow).toHaveCount(0);
  }

  await testInfo.attach('script-dependency-outcome.json', {
    body: Buffer.from(
      JSON.stringify(
        {
          assignedDeletionCode: assignedDeletionEnvelope.code,
          deletedWhileAssigned,
          postDeleteHandleCode,
          postDeleteRecordStatuses,
        },
        null,
        2,
      ),
    ),
    contentType: 'application/json',
  });

  test.fail(
    deletedWhileAssigned,
    'Known defect: a Script Library entry can be deleted while an exact cron job still references it.',
  );
  expect(deletedWhileAssigned).toBe(false);
});
