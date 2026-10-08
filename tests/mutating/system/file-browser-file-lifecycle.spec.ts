import type { Response } from '@playwright/test';

import { test, expect } from '../../fixtures/file-mutating-test';
import {
  createFolderThroughUi,
  fileRow,
  openDirectory,
  openFileAction,
  openTmpDirectory,
  openUploadDialog,
  uploadFileThroughUi,
  visibleFilePanel,
} from '../../helpers/file-browser-ui';
import { uniqueResourceName } from '../../helpers/mutation-safety';

interface ApiEnvelope<T> {
  code: number;
  data: T;
  message: string;
}

const RENAME_PATH = '/api/v2/files/rename';
const DELETE_PATH = '/api/v2/files/del';
const PAYLOAD = Buffer.from('kneo-e2e upload payload\n');

async function expectSuccess(response: Response): Promise<void> {
  expect(response.ok()).toBe(true);
  const envelope = (await response.json()) as ApiEnvelope<unknown>;
  expect(envelope.code).toBe(200);
}

async function downloadContents(
  page: Parameters<typeof fileRow>[0],
  name: string,
): Promise<{ bytes: Buffer; suggestedFilename: string }> {
  const downloadEvent = page.waitForEvent('download');
  await fileRow(page, name)
    .getByRole('button', { name: 'Download', exact: true })
    .click();
  const download = await downloadEvent;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return {
    bytes: Buffer.concat(chunks),
    suggestedFilename: download.suggestedFilename(),
  };
}

test.describe('System > File Browser > File lifecycle [H,V,F,R,C,K,A]', () => {
  test('uploads, downloads, retries rename, persists, and permanently deletes an exact file', async ({
    fileRegistry,
    page,
  }) => {
    const folderName = uniqueResourceName('file-lifecycle');
    const folderPath = `/tmp/${folderName}`;
    const originalName = `${uniqueResourceName('upload')}.txt`;
    const originalPath = `${folderPath}/${originalName}`;
    const cancelledName = `${uniqueResourceName('cancelled')}.txt`;
    const renamedName = `${uniqueResourceName('renamed')}.txt`;
    const renamedPath = `${folderPath}/${renamedName}`;

    await openTmpDirectory(page);
    await createFolderThroughUi(page, fileRegistry, '/tmp', folderName);
    await openDirectory(page, folderName, folderPath);

    const uploadDialog = await openUploadDialog(page);
    await expect(
      uploadDialog.getByRole('button', { name: 'Confirm', exact: true }),
    ).toBeDisabled();
    await uploadDialog.locator('input[type="file"]').setInputFiles({
      buffer: PAYLOAD,
      mimeType: 'text/plain',
      name: originalName,
    });
    await uploadDialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(fileRow(page, originalName)).toHaveCount(0);
    await fileRegistry.assertAbsent(originalPath);

    const originalFile = await uploadFileThroughUi(page, fileRegistry, folderPath, {
      buffer: PAYLOAD,
      mimeType: 'text/plain',
      name: originalName,
    });
    await expect(fileRow(page, originalName)).toHaveCount(1);
    await expect(fileRow(page, originalName)).toContainText('24 B');

    const download = await downloadContents(page, originalName);
    expect(download.suggestedFilename).toBe(originalName);
    expect(download.bytes.equals(PAYLOAD)).toBe(true);

    let dialog = await openFileAction(page, originalName, 'Rename');
    await dialog.getByLabel('Name', { exact: true }).fill(cancelledName);
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(fileRow(page, originalName)).toHaveCount(1);
    await expect(fileRow(page, cancelledName)).toHaveCount(0);

    await fileRegistry.prepare(renamedPath, false);
    dialog = await openFileAction(page, originalName, 'Rename');
    await dialog.getByLabel('Name', { exact: true }).fill(renamedName);
    await page.route(`**${RENAME_PATH}`, async (route) => {
      await route.fulfill({
        body: JSON.stringify({
          code: 500,
          data: null,
          message: 'kneo-e2e rename unavailable',
        }),
        contentType: 'application/json',
        status: 200,
      });
    });
    await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(page.getByText('kneo-e2e rename unavailable')).toBeVisible();
    await expect(dialog).toBeVisible();
    await fileRegistry.assertExists(originalPath, false);
    await fileRegistry.assertAbsent(renamedPath);

    await page.unroute(`**${RENAME_PATH}`);
    const renamedResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === RENAME_PATH,
    );
    await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
    const renameResult = await renamedResponse;
    await expectSuccess(renameResult);
    expect(renameResult.request().postDataJSON()).toEqual({
      newName: renamedPath,
      oldName: originalPath,
      path: folderPath,
    });
    const renamedFile = await fileRegistry.capture(renamedPath);
    await fileRegistry.confirmDeleted(originalFile);
    await expect(fileRow(page, originalName)).toHaveCount(0);
    await expect(fileRow(page, renamedName)).toHaveCount(1);

    const persistedListing = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === '/api/v2/files/search' &&
        response.request().postDataJSON()?.path === folderPath,
    );
    await page.reload();
    await expectSuccess(await persistedListing);
    await expect(fileRow(page, renamedName)).toHaveCount(1);

    dialog = await openFileAction(page, renamedName, 'Delete');
    await expect(dialog).toContainText(renamedName);
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(fileRow(page, renamedName)).toHaveCount(1);
    await fileRegistry.assertExists(renamedPath, false);

    dialog = await openFileAction(page, renamedName, 'Delete');
    await dialog
      .getByText(
        'Permanently delete the file (without entering the recycle bin, delete it directly)',
        { exact: true },
      )
      .click();
    const deletedResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === DELETE_PATH,
    );
    await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
    const deleteResult = await deletedResponse;
    await expectSuccess(deleteResult);
    expect(deleteResult.request().postDataJSON()).toEqual({
      forceDelete: true,
      isDir: false,
      path: renamedPath,
    });
    await fileRegistry.confirmDeleted(renamedFile);
    await expect(fileRow(page, renamedName)).toHaveCount(0);
  });

  test('retries a failed multi-file upload and persists both exact files [C]', async ({
    fileRegistry,
    page,
  }) => {
    test.setTimeout(45_000);
    const folderName = uniqueResourceName('multi-upload');
    const folderPath = `/tmp/${folderName}`;
    const firstName = `${uniqueResourceName('first')}.txt`;
    const secondName = `${uniqueResourceName('second')}.txt`;
    const firstPath = `${folderPath}/${firstName}`;
    const secondPath = `${folderPath}/${secondName}`;
    const firstBytes = Buffer.from('first upload\n');
    const secondBytes = Buffer.from('second upload\n');

    await openTmpDirectory(page);
    await createFolderThroughUi(page, fileRegistry, '/tmp', folderName);
    await openDirectory(page, folderName, folderPath);
    await fileRegistry.prepare(firstPath, false);
    await fileRegistry.prepare(secondPath, false);

    let dialog = await openUploadDialog(page);
    let input = dialog.locator('input[type="file"]');
    await expect(input).toHaveAttribute('multiple', '');
    await input.setInputFiles([
      { buffer: firstBytes, mimeType: 'text/plain', name: firstName },
      { buffer: secondBytes, mimeType: 'text/plain', name: secondName },
    ]);

    await page.route('**/api/v2/files/upload', async (route) => {
      await route.fulfill({
        body: JSON.stringify({
          code: 500,
          data: null,
          message: 'kneo-e2e upload unavailable',
        }),
        contentType: 'application/json',
        status: 200,
      });
    });
    const failedPreflight = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === '/api/v2/files/batch/check',
    );
    const failedFirstUpload = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === '/api/v2/files/upload' &&
        response.request().postData()?.includes(firstName) === true,
    );
    await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
    const failedPreflightEnvelope =
      (await (await failedPreflight).json()) as ApiEnvelope<unknown[]>;
    expect(failedPreflightEnvelope.code).toBe(200);
    expect(failedPreflightEnvelope.data).toEqual([]);
    const failedUploadEnvelope =
      (await (await failedFirstUpload).json()) as ApiEnvelope<null>;
    expect(failedUploadEnvelope).toEqual({
      code: 500,
      data: null,
      message: 'kneo-e2e upload unavailable',
    });
    await expect(page.getByText('kneo-e2e upload unavailable')).toBeVisible();
    await expect(dialog).toBeVisible();
    await fileRegistry.assertAbsent(firstPath);
    await fileRegistry.assertAbsent(secondPath);

    await page.unroute('**/api/v2/files/upload');
    await dialog
      .getByRole('button', { name: 'Close this dialog', exact: true })
      .click();
    const cancelUpload = page.getByRole('dialog', { name: 'Cancel Upload' });
    await expect(cancelUpload).toContainText(
      'Whether to cancel the upload, after cancellation the upload list will be cleared.',
    );
    await cancelUpload
      .getByRole('button', { name: 'Confirm', exact: true })
      .click();
    await expect(cancelUpload).toBeHidden();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const recoveredListing = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === '/api/v2/files/search' &&
        response.request().postDataJSON()?.path === folderPath,
    );
    await page.reload();
    expect(((await (await recoveredListing).json()) as ApiEnvelope<unknown>).code)
      .toBe(200);
    dialog = await openUploadDialog(page);
    input = dialog.locator('input[type="file"]');
    await input.setInputFiles([
      { buffer: firstBytes, mimeType: 'text/plain', name: firstName },
      { buffer: secondBytes, mimeType: 'text/plain', name: secondName },
    ]);
    await expect(dialog).toContainText(firstName);
    await expect(dialog).toContainText(secondName);
    const retriedPreflight = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === '/api/v2/files/batch/check',
    );
    const retriedUploads = new Promise<Response[]>((resolve) => {
      const responses: Response[] = [];
      const collectUpload = (response: Response) => {
        if (
          response.request().method() !== 'POST' ||
          new URL(response.url()).pathname !== '/api/v2/files/upload'
        ) {
          return;
        }
        responses.push(response);
        if (responses.length === 2) {
          page.off('response', collectUpload);
          resolve(responses);
        }
      };
      page.on('response', collectUpload);
    });
    await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
    expect(((await (await retriedPreflight).json()) as ApiEnvelope<unknown[]>).code)
      .toBe(200);
    const uploadResponses = await retriedUploads;
    const uploadEnvelopes = await Promise.all(
      uploadResponses.map(async (response) =>
        (await response.json()) as ApiEnvelope<null>,
      ),
    );
    for (const uploadEnvelope of uploadEnvelopes) {
      expect(uploadEnvelope.code).toBe(200);
      expect(uploadEnvelope.message).toBe('1 files upload success');
    }
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();

    await fileRegistry.capture(firstPath);
    await fileRegistry.capture(secondPath);
    await expect(fileRow(page, firstName)).toHaveCount(1);
    await expect(fileRow(page, secondName)).toHaveCount(1);
    await expect(
      page.locator('[role="tabpanel"]:visible').last().getByText('Total 2'),
    ).toBeVisible();

    const firstDownload = await downloadContents(page, firstName);
    expect(firstDownload.suggestedFilename).toBe(firstName);
    expect(firstDownload.bytes.equals(firstBytes)).toBe(true);
    const secondDownload = await downloadContents(page, secondName);
    expect(secondDownload.suggestedFilename).toBe(secondName);
    expect(secondDownload.bytes.equals(secondBytes)).toBe(true);

    const persisted = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === '/api/v2/files/search' &&
        response.request().postDataJSON()?.path === folderPath,
    );
    await page.reload();
    const persistedEnvelope = (await (await persisted).json()) as ApiEnvelope<{
      itemTotal: number;
      items: Array<{ path: string }>;
    }>;
    expect(persistedEnvelope.code).toBe(200);
    expect(persistedEnvelope.data.itemTotal).toBe(2);
    expect(persistedEnvelope.data.items.map(({ path }) => path).sort()).toEqual(
      [firstPath, secondPath].sort(),
    );
    await expect(fileRow(page, firstName)).toHaveCount(1);
    await expect(fileRow(page, secondName)).toHaveCount(1);
  });

  test('recovers only the missing file after a partial batch upload', async ({
    fileRegistry,
    page,
  }) => {
    test.setTimeout(60_000);
    const folderName = uniqueResourceName('partial-upload');
    const folderPath = `/tmp/${folderName}`;
    const firstName = `${uniqueResourceName('committed')}.txt`;
    const secondName = `${uniqueResourceName('rejected')}.txt`;
    const firstPath = `${folderPath}/${firstName}`;
    const secondPath = `${folderPath}/${secondName}`;
    const firstBytes = Buffer.from('committed batch file\n');
    const secondBytes = Buffer.from('retried batch file\n');

    await openTmpDirectory(page);
    await createFolderThroughUi(page, fileRegistry, '/tmp', folderName);
    await openDirectory(page, folderName, folderPath);
    await fileRegistry.prepare(firstPath, false);
    await fileRegistry.prepare(secondPath, false);

    let dialog = await openUploadDialog(page);
    await dialog.locator('input[type="file"]').setInputFiles([
      { buffer: firstBytes, mimeType: 'text/plain', name: firstName },
      { buffer: secondBytes, mimeType: 'text/plain', name: secondName },
    ]);
    await page.route('**/api/v2/files/upload', async (route) => {
      if (route.request().postData()?.includes(secondName)) {
        await route.fulfill({
          contentType: 'application/json',
          json: {
            code: 500,
            data: null,
            message: 'kneo-e2e second upload unavailable',
          },
          status: 200,
        });
        return;
      }
      await route.continue();
    });

    const preflight = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === '/api/v2/files/batch/check',
    );
    const firstUploaded = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === '/api/v2/files/upload' &&
        response.request().postData()?.includes(firstName) === true,
    );
    const secondRejected = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === '/api/v2/files/upload' &&
        response.request().postData()?.includes(secondName) === true,
    );
    await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expectSuccess(await preflight);
    const firstResponse = await firstUploaded;
    await expectSuccess(firstResponse);
    expect((await firstResponse.json()) as ApiEnvelope<null>).toEqual({
      code: 200,
      data: null,
      message: '1 files upload success',
    });
    expect((await (await secondRejected).json()) as ApiEnvelope<null>).toEqual({
      code: 500,
      data: null,
      message: 'kneo-e2e second upload unavailable',
    });
    await expect(
      page.getByText('kneo-e2e second upload unavailable'),
    ).toBeVisible();
    await page.unroute('**/api/v2/files/upload');

    await dialog
      .getByRole('button', { name: 'Close this dialog', exact: true })
      .click();
    const cancelDialog = page.getByRole('dialog', { name: 'Cancel Upload' });
    await cancelDialog
      .getByRole('button', { name: 'Confirm', exact: true })
      .click();
    await fileRegistry.capture(firstPath);
    await fileRegistry.assertAbsent(secondPath);

    await page.reload();
    await fileRegistry.assertExists(firstPath, false);
    await fileRegistry.assertAbsent(secondPath);
    await expect(
      visibleFilePanel(page).getByText('Total 1', { exact: true }),
    ).toBeVisible();
    await expect(fileRow(page, firstName)).toHaveCount(1);
    await expect(fileRow(page, secondName)).toHaveCount(0);

    dialog = await openUploadDialog(page);
    await dialog.locator('input[type="file"]').setInputFiles({
      buffer: secondBytes,
      mimeType: 'text/plain',
      name: secondName,
    });
    const retryPreflight = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === '/api/v2/files/batch/check',
    );
    const retryUpload = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === '/api/v2/files/upload',
    );
    await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expectSuccess(await retryPreflight);
    await expectSuccess(await retryUpload);
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await fileRegistry.capture(secondPath);

    await page.reload();
    await fileRegistry.assertExists(firstPath, false);
    await fileRegistry.assertExists(secondPath, false);
    await expect(
      visibleFilePanel(page).getByText('Total 2', { exact: true }),
    ).toBeVisible();
    await expect(fileRow(page, firstName)).toHaveCount(1);
    await expect(fileRow(page, secondName)).toHaveCount(1);
    expect(
      (await downloadContents(page, firstName)).bytes.equals(firstBytes),
    ).toBe(true);
    expect(
      (await downloadContents(page, secondName)).bytes.equals(secondBytes),
    ).toBe(true);
  });

  test('cancels an in-progress binary upload, then retries it byte-for-byte', async ({
    fileRegistry,
    page,
  }) => {
    test.setTimeout(60_000);
    const folderName = uniqueResourceName('upload-progress');
    const folderPath = `/tmp/${folderName}`;
    const fileName = `${uniqueResourceName('binary')}.bin`;
    const filePath = `${folderPath}/${fileName}`;
    const bytes = Buffer.alloc(1024 * 1024, 0x5a);

    await openTmpDirectory(page);
    await createFolderThroughUi(page, fileRegistry, '/tmp', folderName);
    await openDirectory(page, folderName, folderPath);
    await fileRegistry.prepare(filePath, false);

    let dialog = await openUploadDialog(page);
    await dialog.locator('input[type="file"]').setInputFiles({
      buffer: bytes,
      mimeType: 'application/octet-stream',
      name: fileName,
    });

    let releaseUpload!: () => void;
    const uploadGate = new Promise<void>((resolve) => {
      releaseUpload = resolve;
    });
    let observeUpload!: () => void;
    const uploadObserved = new Promise<void>((resolve) => {
      observeUpload = resolve;
    });
    let finishRoute!: () => void;
    const routeFinished = new Promise<void>((resolve) => {
      finishRoute = resolve;
    });
    let uploadResponseCount = 0;
    page.on('response', (response) => {
      if (new URL(response.url()).pathname === '/api/v2/files/upload') {
        uploadResponseCount += 1;
      }
    });
    await page.route('**/api/v2/files/upload', async (route) => {
      observeUpload();
      await uploadGate;
      try {
        await route.continue();
      } catch {
        // The confirmed UI cancellation intentionally aborts this request.
      } finally {
        finishRoute();
      }
    });

    const confirmClick = dialog
      .getByRole('button', { name: 'Confirm', exact: true })
      .click();
    await uploadObserved;
    await expect(dialog).toContainText(`Uploading [${fileName}]...`);
    await expect(dialog.getByText('0%', { exact: true })).toBeVisible();
    await expect(
      dialog.getByRole('button', { name: 'Cancel', exact: true }),
    ).toBeDisabled();
    await expect(
      dialog.getByRole('button', { name: 'Confirm', exact: true }),
    ).toBeDisabled();

    await dialog
      .getByRole('button', { name: 'Close this dialog', exact: true })
      .click();
    const cancelDialog = page.getByRole('dialog', { name: 'Cancel Upload' });
    await expect(cancelDialog).toContainText(
      'Whether to cancel the upload, after cancellation the upload list will be cleared.',
    );
    await cancelDialog
      .getByRole('button', { name: 'Confirm', exact: true })
      .click();
    releaseUpload();
    await routeFinished;
    await confirmClick.catch(() => undefined);
    await page.unroute('**/api/v2/files/upload');
    expect(uploadResponseCount).toBe(0);

    const cancelledListing = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === '/api/v2/files/search' &&
        response.request().postDataJSON()?.path === folderPath,
    );
    await page.reload();
    await expectSuccess(await cancelledListing);
    await expect(fileRow(page, fileName)).toHaveCount(0);
    await fileRegistry.assertAbsent(filePath);

    dialog = await openUploadDialog(page);
    await dialog.locator('input[type="file"]').setInputFiles({
      buffer: bytes,
      mimeType: 'application/octet-stream',
      name: fileName,
    });
    const preflight = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === '/api/v2/files/batch/check',
    );
    const uploaded = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === '/api/v2/files/upload',
    );
    await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expectSuccess(await preflight);
    const uploadResponse = await uploaded;
    await expectSuccess(uploadResponse);
    expect((await uploadResponse.json()) as ApiEnvelope<null>).toEqual({
      code: 200,
      data: null,
      message: '1 files upload success',
    });
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await fileRegistry.capture(filePath);

    await expect(fileRow(page, fileName)).toHaveCount(1);
    const download = await downloadContents(page, fileName);
    expect(download.suggestedFilename).toBe(fileName);
    expect(download.bytes.equals(bytes)).toBe(true);

    const persistedListing = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === '/api/v2/files/search' &&
        response.request().postDataJSON()?.path === folderPath,
    );
    await page.reload();
    await expectSuccess(await persistedListing);
    await expect(fileRow(page, fileName)).toHaveCount(1);
  });
});
