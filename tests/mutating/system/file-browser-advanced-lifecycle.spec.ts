import type { Page, Response } from '@playwright/test';

import {
  test,
  expect,
  type FileMutationRegistry,
} from '../../fixtures/file-mutating-test';
import {
  createFileThroughUi,
  createFolderThroughUi,
  fileRow,
  openDirectory,
  openTmpDirectory,
  pasteSingleFileThroughUi,
  selectFileClipboardAction,
  uploadFileThroughUi,
  visibleFilePanel,
} from '../../helpers/file-browser-ui';
import { uniqueResourceName } from '../../helpers/mutation-safety';

interface ApiEnvelope<T> {
  code: number;
  data: T;
  message: string;
}

interface CollisionScenario {
  destinationBytes: Buffer;
  destinationPath: string;
  fileName: string;
  sourceBytes: Buffer;
  sourcePath: string;
}

async function prepareCollisionScenario(
  page: Page,
  fileRegistry: FileMutationRegistry,
): Promise<CollisionScenario> {
  const rootName = uniqueResourceName('collision');
  const rootPath = `/tmp/${rootName}`;
  const destinationName = uniqueResourceName('destination');
  const destinationPath = `${rootPath}/${destinationName}`;
  const fileName = `${uniqueResourceName('same-name')}.txt`;
  const sourcePath = `${rootPath}/${fileName}`;
  const sourceBytes = Buffer.from('source collision bytes\n');
  const destinationBytes = Buffer.from('destination collision bytes\n');

  await openTmpDirectory(page);
  await createFolderThroughUi(page, fileRegistry, '/tmp', rootName);
  await openDirectory(page, rootName, rootPath);
  await createFolderThroughUi(page, fileRegistry, rootPath, destinationName);
  await uploadFileThroughUi(page, fileRegistry, rootPath, {
    buffer: sourceBytes,
    mimeType: 'text/plain',
    name: fileName,
  });
  await selectFileClipboardAction(page, fileName, 'Copy');
  await openDirectory(page, destinationName, destinationPath);
  await uploadFileThroughUi(page, fileRegistry, destinationPath, {
    buffer: destinationBytes,
    mimeType: 'text/plain',
    name: fileName,
  });

  return {
    destinationBytes,
    destinationPath,
    fileName,
    sourceBytes,
    sourcePath,
  };
}

async function readSuccess(response: Response): Promise<void> {
  expect(response.ok()).toBe(true);
  expect((await response.json()) as ApiEnvelope<null>).toEqual({
    code: 200,
    data: null,
    message: 'success',
  });
}

async function downloadBytes(page: Page, name: string): Promise<Buffer> {
  const downloadEvent = page.waitForEvent('download');
  await fileRow(page, name)
    .getByRole('button', { name: 'Download', exact: true })
    .click();
  const stream = await (await downloadEvent).createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function openCollisionDialog(page: Page, destinationFile: string) {
  const collisionCheck = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/api/v2/files/check',
  );
  await page.getByRole('button', { name: 'Paste(1)', exact: true }).click();
  const checkResponse = await collisionCheck;
  const envelope = (await checkResponse.json()) as ApiEnvelope<boolean>;
  expect(envelope.code).toBe(200);
  expect(envelope.data).toBe(true);
  expect(checkResponse.request().postDataJSON()).toEqual({
    path: destinationFile,
    withInit: false,
  });
  return page.getByRole('dialog');
}

test.describe('System > File Browser > Advanced lifecycle [H,V,F,R,C,X,K,A]', () => {
  test('creates, copies, retries, detects collisions, and moves an exact file', async ({
    fileRegistry,
    page,
  }) => {
    test.setTimeout(60_000);
    const rootName = uniqueResourceName('advanced-files');
    const rootPath = `/tmp/${rootName}`;
    const destinationName = uniqueResourceName('copy-target');
    const destinationPath = `${rootPath}/${destinationName}`;
    const nestedName = uniqueResourceName('move-target');
    const nestedPath = `${destinationPath}/${nestedName}`;
    const fileName = `${uniqueResourceName('created')}.txt`;
    const sourcePath = `${rootPath}/${fileName}`;
    const copiedPath = `${destinationPath}/${fileName}`;
    const movedPath = `${nestedPath}/${fileName}`;
    const cancelledName = `${uniqueResourceName('cancelled')}.txt`;
    const cancelledPath = `${rootPath}/${cancelledName}`;

    await openTmpDirectory(page);
    await createFolderThroughUi(page, fileRegistry, '/tmp', rootName);
    await openDirectory(page, rootName, rootPath);
    await expect(visibleFilePanel(page).getByText('Total 0')).toBeVisible();

    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await page
      .locator('.el-dropdown-menu:visible')
      .last()
      .getByText('File Browser', { exact: true })
      .click();
    let dialog = page.getByRole('dialog');
    await dialog.getByLabel('Name', { exact: true }).fill(cancelledName);
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await fileRegistry.assertAbsent(cancelledPath);

    await createFolderThroughUi(page, fileRegistry, rootPath, destinationName);
    await createFileThroughUi(page, fileRegistry, rootPath, fileName);
    await expect(fileRow(page, destinationName)).toHaveCount(1);
    await expect(fileRow(page, fileName)).toHaveCount(1);
    await expect(visibleFilePanel(page).getByText('Total 2')).toBeVisible();

    await selectFileClipboardAction(page, fileName, 'Copy');
    await fileRegistry.prepare(copiedPath, false);
    await openDirectory(page, destinationName, destinationPath);
    await expect(visibleFilePanel(page).getByText('Total 0')).toBeVisible();

    await page.route('**/api/v2/files/move', async (route) => {
      await route.fulfill({
        body: JSON.stringify({
          code: 500,
          data: null,
          message: 'kneo-e2e copy unavailable',
        }),
        contentType: 'application/json',
        status: 200,
      });
    });
    const failedCopy = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === '/api/v2/files/move',
    );
    await page.getByRole('button', { name: 'Paste(1)', exact: true }).click();
    const failedCopyEnvelope = (await (await failedCopy).json()) as ApiEnvelope<null>;
    expect(failedCopyEnvelope).toEqual({
      code: 500,
      data: null,
      message: 'kneo-e2e copy unavailable',
    });
    await expect(page.getByText('kneo-e2e copy unavailable')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Paste(1)', exact: true }),
    ).toBeVisible();
    await fileRegistry.assertExists(sourcePath, false);
    await fileRegistry.assertAbsent(copiedPath);

    await page.unroute('**/api/v2/files/move');
    await pasteSingleFileThroughUi(page, sourcePath, destinationPath, 'copy');
    const copiedFile = await fileRegistry.capture(copiedPath);
    await expect(fileRow(page, fileName)).toHaveCount(1);
    await fileRegistry.assertExists(sourcePath, false);

    await selectFileClipboardAction(page, fileName, 'Copy');
    const collisionCheck = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === '/api/v2/files/check' &&
        response.request().postDataJSON()?.path === copiedPath,
    );
    await page.getByRole('button', { name: 'Paste(1)', exact: true }).click();
    const collisionResult = await collisionCheck;
    const collisionEnvelope =
      (await collisionResult.json()) as ApiEnvelope<boolean>;
    expect(collisionEnvelope.code).toBe(200);
    expect(collisionEnvelope.data).toBe(true);
    expect(collisionResult.request().postDataJSON()).toEqual({
      path: copiedPath,
      withInit: false,
    });
    dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Overwrite existing files');
    await expect(dialog).toContainText('Rename');
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(fileRow(page, fileName)).toHaveCount(1);
    await fileRegistry.assertExists(copiedPath, false);

    await createFolderThroughUi(page, fileRegistry, destinationPath, nestedName);
    await expect(visibleFilePanel(page).getByText('Total 2')).toBeVisible();
    await selectFileClipboardAction(page, fileName, 'Move');
    await fileRegistry.prepare(movedPath, false);
    await openDirectory(page, nestedName, nestedPath);
    await expect(visibleFilePanel(page).getByText('Total 0')).toBeVisible();
    await pasteSingleFileThroughUi(page, copiedPath, nestedPath, 'cut');
    await fileRegistry.capture(movedPath);
    await fileRegistry.confirmDeleted(copiedFile);
    await expect(fileRow(page, fileName)).toHaveCount(1);
    await fileRegistry.assertExists(sourcePath, false);
    await fileRegistry.assertAbsent(copiedPath);

    const persisted = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === '/api/v2/files/search' &&
        response.request().postDataJSON()?.path === nestedPath,
    );
    await page.reload();
    const persistedEnvelope = (await (await persisted).json()) as ApiEnvelope<{
      items: Array<{ path: string }>;
    }>;
    expect(persistedEnvelope.code).toBe(200);
    expect(persistedEnvelope.data.items.map(({ path }) => path)).toContain(
      movedPath,
    );
    await expect(fileRow(page, fileName)).toHaveCount(1);
  });

  test('confirms an overwrite collision and replaces the destination bytes', async ({
    fileRegistry,
    page,
  }) => {
    const scenario = await prepareCollisionScenario(page, fileRegistry);
    const destinationFile = `${scenario.destinationPath}/${scenario.fileName}`;
    const dialog = await openCollisionDialog(page, destinationFile);
    await expect(dialog).toContainText('Overwrite existing files');
    await dialog
      .getByText('Overwrite existing files', { exact: true })
      .click();

    const copied = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === '/api/v2/files/move',
    );
    await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
    const copyResponse = await copied;
    await readSuccess(copyResponse);
    expect(copyResponse.request().postDataJSON()).toEqual({
      allNames: [],
      cover: true,
      coverPaths: [],
      isDir: false,
      name: scenario.fileName,
      newPath: scenario.destinationPath,
      oldPaths: [scenario.sourcePath],
      type: 'copy',
    });

    await expect(fileRow(page, scenario.fileName)).toHaveCount(1);
    expect(
      (await downloadBytes(page, scenario.fileName)).equals(
        scenario.sourceBytes,
      ),
    ).toBe(true);
    await fileRegistry.assertExists(scenario.sourcePath, false);
    await fileRegistry.assertExists(destinationFile, false);

    await page.reload();
    await expect(fileRow(page, scenario.fileName)).toHaveCount(1);
    expect(
      (await downloadBytes(page, scenario.fileName)).equals(
        scenario.sourceBytes,
      ),
    ).toBe(true);
  });

  test('resolves a copy collision by creating an exact renamed file', async ({
    fileRegistry,
    page,
  }) => {
    const scenario = await prepareCollisionScenario(page, fileRegistry);
    const destinationFile = `${scenario.destinationPath}/${scenario.fileName}`;
    const renamedName = `${uniqueResourceName('collision-renamed')}.txt`;
    const renamedPath = `${scenario.destinationPath}/${renamedName}`;
    await fileRegistry.prepare(renamedPath, false);

    const dialog = await openCollisionDialog(page, destinationFile);
    await dialog.getByText('Rename', { exact: true }).click();
    await dialog.getByLabel('Name', { exact: true }).fill(renamedName);
    const copied = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === '/api/v2/files/move',
    );
    await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
    const copyResponse = await copied;
    await readSuccess(copyResponse);
    expect(copyResponse.request().postDataJSON()).toEqual({
      allNames: [],
      cover: false,
      coverPaths: [],
      isDir: false,
      name: renamedName,
      newPath: scenario.destinationPath,
      oldPaths: [scenario.sourcePath],
      type: 'copy',
    });
    await fileRegistry.capture(renamedPath);

    await expect(fileRow(page, scenario.fileName)).toHaveCount(1);
    await expect(fileRow(page, renamedName)).toHaveCount(1);
    expect(
      (await downloadBytes(page, scenario.fileName)).equals(
        scenario.destinationBytes,
      ),
    ).toBe(true);
    expect(
      (await downloadBytes(page, renamedName)).equals(scenario.sourceBytes),
    ).toBe(true);
    await fileRegistry.assertExists(scenario.sourcePath, false);
    await fileRegistry.assertExists(destinationFile, false);
    await fileRegistry.assertExists(renamedPath, false);

    await page.reload();
    await expect(fileRow(page, scenario.fileName)).toHaveCount(1);
    await expect(fileRow(page, renamedName)).toHaveCount(1);
  });
});
