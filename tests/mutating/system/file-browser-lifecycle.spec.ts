import type { Response } from '@playwright/test';

import { test, expect } from '../../fixtures/file-mutating-test';
import {
  createFolderThroughUi,
  fileRow,
  openDirectory,
  openFileAction,
  openTmpDirectory,
  visibleFilePanel,
} from '../../helpers/file-browser-ui';
import { uniqueResourceName } from '../../helpers/mutation-safety';

interface ApiEnvelope<T> {
  code: number;
  data: T;
  message: string;
}

interface FileListing {
  itemTotal: number;
  items: unknown[] | null;
  path: string;
}

async function readListing(response: Response): Promise<FileListing> {
  expect(response.ok()).toBe(true);
  const envelope = (await response.json()) as ApiEnvelope<FileListing>;
  expect(envelope.code).toBe(200);
  expect(envelope.message).toBe('');
  return envelope.data;
}

test.describe('System > File Browser > Folder lifecycle [H,V,R,K,A]', () => {
  test('creates and opens an exact empty folder with matching API state', async ({
    fileRegistry,
    page,
  }) => {
    const name = uniqueResourceName('empty-folder');
    const exactPath = `/tmp/${name}`;
    await openTmpDirectory(page);

    await createFolderThroughUi(page, fileRegistry, '/tmp', name);
    const row = fileRow(page, name);
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('0777');
    await expect(
      row.getByRole('button', { name: 'Open', exact: true }),
    ).toBeVisible();

    const listingResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === '/api/v2/files/search' &&
        response.request().postDataJSON()?.path === exactPath,
    );
    await openDirectory(page, name, exactPath);
    const listing = await readListing(await listingResponse);
    expect(listing).toEqual(
      expect.objectContaining({
        itemTotal: 0,
        items: null,
        path: exactPath,
      }),
    );
    await expect(visibleFilePanel(page).getByText('Total 0')).toBeVisible();
  });

  test('cancels, persists, and permanently deletes an exact folder rename', async ({
    fileRegistry,
    page,
  }) => {
    test.setTimeout(45_000);
    const name = uniqueResourceName('folder-lifecycle');
    const exactPath = `/tmp/${name}`;
    const cancelledName = uniqueResourceName('cancelled-folder');
    const renamedName = uniqueResourceName('renamed-folder');
    const renamedPath = `/tmp/${renamedName}`;
    await openTmpDirectory(page);

    const originalFolder = await createFolderThroughUi(
      page,
      fileRegistry,
      '/tmp',
      name,
    );
    let dialog = await openFileAction(page, name, 'Rename');
    await dialog.getByLabel('Name', { exact: true }).fill(cancelledName);
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(fileRow(page, name)).toHaveCount(1);
    await expect(fileRow(page, cancelledName)).toHaveCount(0);

    await fileRegistry.prepare(renamedPath, true);
    dialog = await openFileAction(page, name, 'Rename');
    await dialog.getByLabel('Name', { exact: true }).fill(renamedName);
    const renamed = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === '/api/v2/files/rename',
    );
    await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
    const renameResponse = await renamed;
    expect(renameResponse.ok()).toBe(true);
    expect(((await renameResponse.json()) as ApiEnvelope<unknown>).code).toBe(200);
    expect(renameResponse.request().postDataJSON()).toEqual({
      newName: renamedPath,
      oldName: exactPath,
      path: '/tmp',
    });
    const renamedFolder = await fileRegistry.capture(renamedPath);
    await fileRegistry.confirmDeleted(originalFolder);
    await expect(fileRow(page, name)).toHaveCount(0);
    await expect(fileRow(page, renamedName)).toHaveCount(1);

    const persisted = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === '/api/v2/files/search' &&
        response.request().postDataJSON()?.path === '/tmp',
    );
    await page.reload();
    await readListing(await persisted);
    const filtered = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === '/api/v2/files/search' &&
        response.request().postDataJSON()?.path === '/tmp' &&
        response.request().postDataJSON()?.search === renamedName,
    );
    const search = visibleFilePanel(page).getByPlaceholder('Search');
    await search.fill(renamedName);
    await search.press('Enter');
    await readListing(await filtered);
    await expect(fileRow(page, renamedName)).toHaveCount(1);

    dialog = await openFileAction(page, renamedName, 'Delete');
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(fileRow(page, renamedName)).toHaveCount(1);
    await fileRegistry.assertExists(renamedPath, true);

    dialog = await openFileAction(page, renamedName, 'Delete');
    await dialog
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
    await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
    const deleteResponse = await deleted;
    expect(deleteResponse.ok()).toBe(true);
    expect(deleteResponse.request().postDataJSON()).toEqual({
      forceDelete: true,
      isDir: true,
      path: renamedPath,
    });
    const deleteEnvelope =
      (await deleteResponse.json()) as ApiEnvelope<unknown>;
    const folderStillExists = await fileRegistry.exists(renamedPath, true);
    if (!folderStillExists) {
      await fileRegistry.confirmDeleted(renamedFolder);
    }
    expect(deleteEnvelope.code, deleteEnvelope.message).toBe(200);
    expect(folderStillExists).toBe(false);
    await expect(fileRow(page, renamedName)).toHaveCount(0);
  });
});
