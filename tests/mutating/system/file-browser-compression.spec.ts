import type { Locator, Page, Response } from '@playwright/test';

import { test, expect } from '../../fixtures/file-mutating-test';
import {
  createFileThroughUi,
  createFolderThroughUi,
  fileRow,
  openDirectory,
  openFileAction,
  openTmpDirectory,
} from '../../helpers/file-browser-ui';
import { uniqueResourceName } from '../../helpers/mutation-safety';

interface ApiEnvelope<T> {
  code: number;
  data: T;
  message: string;
}

async function readSuccess(response: Response): Promise<ApiEnvelope<unknown>> {
  expect(response.ok()).toBe(true);
  const envelope = (await response.json()) as ApiEnvelope<unknown>;
  expect(envelope.code, envelope.message).toBe(200);
  return envelope;
}

async function openArchiveAction(
  page: Page,
  fileName: string,
  action: 'Compress' | 'Decompress',
): Promise<Locator> {
  await fileRow(page, fileName)
    .locator('.fu-table-operations__dropdown-trigger')
    .click();
  await page
    .locator('.el-dropdown-menu:visible')
    .last()
    .getByText(action, { exact: true })
    .click();

  const drawer = page.getByRole('dialog').filter({ hasText: action }).last();
  await expect(drawer).toBeVisible();
  return drawer;
}

test('compresses a dummy file to ZIP and restores it by decompressing', async ({
  fileRegistry,
  page,
}) => {
  test.setTimeout(90_000);

  const directoryName = uniqueResourceName('compression');
  const directoryPath = `/tmp/${directoryName}`;
  const fileName = `${uniqueResourceName('dummy')}.txt`;
  const filePath = `${directoryPath}/${fileName}`;
  const archiveBaseName = uniqueResourceName('archive');
  const archiveName = `${archiveBaseName}.zip`;
  const archivePath = `${directoryPath}/${archiveName}`;

  await openTmpDirectory(page);
  await createFolderThroughUi(page, fileRegistry, '/tmp', directoryName);
  await openDirectory(page, directoryName, directoryPath);
  const originalFile = await createFileThroughUi(
    page,
    fileRegistry,
    directoryPath,
    fileName,
  );

  await fileRegistry.prepare(archivePath, false);
  let drawer = await openArchiveAction(page, fileName, 'Compress');
  await drawer.locator('.el-select').click();
  await page
    .locator('.el-select-dropdown:visible')
    .getByText('zip', { exact: true })
    .click();
  await drawer.getByLabel('Name', { exact: true }).fill(archiveBaseName);

  const compressed = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/api/v2/files/compress',
  );
  await drawer.getByRole('button', { name: 'Confirm', exact: true }).click();
  const compressResponse = await compressed;
  await readSuccess(compressResponse);
  expect(compressResponse.request().postDataJSON()).toEqual({
    dst: directoryPath,
    files: [filePath],
    name: archiveName,
    replace: false,
    secret: '',
    taskID: expect.any(String),
    type: 'zip',
  });

  await expect(fileRow(page, archiveName)).toHaveCount(1, { timeout: 30_000 });
  await fileRegistry.capture(archivePath);

  const deleteDialog = await openFileAction(page, fileName, 'Delete');
  await deleteDialog
    .getByText(
      'Permanently delete the file (without entering the recycle bin, delete it directly)',
      { exact: true },
    )
    .click();
  const deleted = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/api/v2/files/del',
  );
  await deleteDialog
    .getByRole('button', { name: 'Confirm', exact: true })
    .click();
  await readSuccess(await deleted);
  await fileRegistry.confirmDeleted(originalFile);
  await expect(fileRow(page, fileName)).toHaveCount(0);

  await fileRegistry.prepare(filePath, false);
  drawer = await openArchiveAction(page, archiveName, 'Decompress');
  const destination = drawer.locator('input:not([disabled])').first();
  await expect(destination).toHaveValue(directoryPath);

  const decompressed = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/api/v2/files/decompress',
  );
  await drawer.getByRole('button', { name: 'Confirm', exact: true }).click();
  const decompressResponse = await decompressed;
  await readSuccess(decompressResponse);
  expect(decompressResponse.request().postDataJSON()).toEqual({
    dst: directoryPath,
    path: archivePath,
    secret: '',
    taskID: expect.any(String),
    type: 'zip',
  });

  await expect(fileRow(page, fileName)).toHaveCount(1, { timeout: 30_000 });
  await fileRegistry.capture(filePath);
});
