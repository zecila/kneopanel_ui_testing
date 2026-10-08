import type { Locator, Page, Response } from '@playwright/test';

import { test, expect } from '../../fixtures/file-mutating-test';
import {
  createFileThroughUi,
  createFolderThroughUi,
  fileRow,
  openDirectory,
  openTmpDirectory,
  selectFileClipboardAction,
} from '../../helpers/file-browser-ui';
import { uniqueResourceName } from '../../helpers/mutation-safety';

interface ApiEnvelope<T> {
  code: number;
  data: T;
  message: string;
}

interface OperationLog {
  message: string;
  status: string;
}

async function openSamePathCollision(
  page: Page,
  exactPath: string,
): Promise<Locator> {
  const checked = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/api/v2/files/check' &&
      response.request().postDataJSON()?.path === exactPath,
  );
  await page.getByRole('button', { name: 'Paste(1)', exact: true }).click();
  const checkResponse = await checked;
  expect(checkResponse.ok()).toBe(true);
  expect((await checkResponse.json()) as ApiEnvelope<boolean>).toEqual({
    code: 200,
    data: true,
    message: '',
  });
  expect(checkResponse.request().postDataJSON()).toEqual({
    path: exactPath,
    withInit: false,
  });

  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Overwrite existing files');
  await expect(dialog).toContainText('Rename');
  return dialog;
}

async function submitCopy(page: Page, dialog: Locator): Promise<Response> {
  const copied = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/api/v2/files/move',
  );
  await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
  return copied;
}

test('handles same-path copy collisions without backend or log failures', async ({
  fileRegistry,
  page,
}) => {
  test.setTimeout(60_000);
  test.info().annotations.push({
    type: 'bug-report',
    description:
      'docs/bugs/2026-10-06/verified-ui-bugs-10-06-2026.md#33-same-directory-copy-exposes-backend-errors-and-records-failed-operations',
  });

  const directoryName = uniqueResourceName('same-path-copy');
  const directoryPath = `/tmp/${directoryName}`;
  const fileName = `${uniqueResourceName('source')}.txt`;
  const filePath = `${directoryPath}/${fileName}`;

  await openTmpDirectory(page);
  await createFolderThroughUi(page, fileRegistry, '/tmp', directoryName);
  await openDirectory(page, directoryName, directoryPath);
  await createFileThroughUi(page, fileRegistry, directoryPath, fileName);

  await selectFileClipboardAction(page, fileName, 'Copy');
  let dialog = await openSamePathCollision(page, filePath);
  await dialog.getByText('Rename', { exact: true }).click();
  await dialog.getByLabel('Name', { exact: true }).fill(fileName);
  const renameResponse = await submitCopy(page, dialog);
  const renameEnvelope =
    (await renameResponse.json()) as ApiEnvelope<unknown>;
  const renameError = renameEnvelope.code !== 200;
  if (renameError) {
    await expect(
      page.getByText(renameEnvelope.message, { exact: true }),
    ).toBeVisible();
  }
  expect(renameResponse.request().postDataJSON()).toEqual({
    allNames: [],
    cover: false,
    coverPaths: [],
    isDir: false,
    name: fileName,
    newPath: directoryPath,
    oldPaths: [filePath],
    type: 'copy',
  });
  await fileRegistry.assertExists(filePath, false);
  await expect(fileRow(page, fileName)).toHaveCount(1);
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();

  await selectFileClipboardAction(page, fileName, 'Copy');
  dialog = await openSamePathCollision(page, filePath);
  await dialog
    .getByText('Overwrite existing files', { exact: true })
    .click();
  const overwriteResponse = await submitCopy(page, dialog);
  const overwriteEnvelope =
    (await overwriteResponse.json()) as ApiEnvelope<unknown>;
  const overwriteError = overwriteEnvelope.code !== 200;
  if (overwriteError) {
    await expect(
      page.getByText(overwriteEnvelope.message, { exact: true }),
    ).toBeVisible();
  }
  expect(overwriteResponse.request().postDataJSON()).toEqual({
    allNames: [],
    cover: true,
    coverPaths: [],
    isDir: false,
    name: fileName,
    newPath: directoryPath,
    oldPaths: [filePath],
    type: 'copy',
  });
  await fileRegistry.assertExists(filePath, false);
  await expect(fileRow(page, fileName)).toHaveCount(1);
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();

  const operationLogs = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/api/v2/core/logs/operation',
  );
  await page.goto('/logs/operation');
  const operationEnvelope =
    (await (await operationLogs).json()) as ApiEnvelope<{
      items: OperationLog[];
    }>;
  expect(operationEnvelope.code, operationEnvelope.message).toBe(200);
  const failedCopyLogs = operationEnvelope.data.items.filter(
    (item) =>
      item.status === 'Failed' &&
      JSON.stringify(item).includes(filePath),
  );
  expect(failedCopyLogs).toHaveLength(
    Number(renameError) + Number(overwriteError),
  );

  const samePathCopyFailedInternally =
    renameError || overwriteError || failedCopyLogs.length > 0;
  test.fail(
    samePathCopyFailedInternally,
    'Known defect: same-path copy choices expose backend errors and create failed operation logs.',
  );
  expect(renameError).toBe(false);
  expect(overwriteError).toBe(false);
  expect(failedCopyLogs).toHaveLength(0);
});
