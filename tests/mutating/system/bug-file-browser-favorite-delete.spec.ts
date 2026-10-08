import type { Locator, Page } from '@playwright/test';

import { test, expect } from '../../fixtures/file-mutating-test';
import {
  createFileThroughUi,
  fileRow,
  openFileAction,
  openTmpDirectory,
} from '../../helpers/file-browser-ui';
import { uniqueResourceName } from '../../helpers/mutation-safety';

async function openFavorites(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: 'Favorites', exact: true }).click();
  const favorites = page.getByRole('dialog').filter({ hasText: 'Favorites' });
  await expect(favorites).toBeVisible();
  return favorites;
}

function favoriteRow(favorites: Locator, fileName: string): Locator {
  return favorites.getByRole('row').filter({ hasText: fileName });
}

async function removeFavorite(page: Page, row: Locator): Promise<void> {
  await row.getByRole('button', { name: 'Delete', exact: true }).click();
  const confirmation = page
    .getByRole('dialog')
    .filter({ hasText: 'Remove from favorites?' });
  const removed = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/api/v2/files/favorite/del',
  );
  await confirmation
    .getByRole('button', { name: 'Confirm', exact: true })
    .click();
  const response = await removed;
  expect(response.ok()).toBe(true);
  expect(((await response.json()) as { code: number }).code).toBe(200);
  await expect(confirmation).toBeHidden();
  await expect(row).toHaveCount(0);
}

test('removes a favorite when its exact file is deleted', async ({
  fileRegistry,
  page,
}) => {
  test.setTimeout(60_000);
  test.info().annotations.push({
    type: 'bug-report',
    description:
      'docs/bugs/2026-10-06/verified-ui-bugs-10-06-2026.md#31-deleting-a-favorited-file-leaves-a-stale-favorite-path',
  });

  const fileName = uniqueResourceName('favorite-delete');
  await openTmpDirectory(page);
  const trackedFile = await createFileThroughUi(
    page,
    fileRegistry,
    '/tmp',
    fileName,
  );

  const row = fileRow(page, fileName);
  await row.locator('.fu-table-operations__dropdown-trigger').click();
  const favorited = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/api/v2/files/favorite',
  );
  await page
    .locator('.el-dropdown-menu:visible')
    .last()
    .getByText('Add to Favorites', { exact: true })
    .click();
  const favoriteResponse = await favorited;
  expect(favoriteResponse.ok()).toBe(true);
  expect(favoriteResponse.request().postDataJSON()).toEqual({
    path: trackedFile.path,
  });

  let favorites = await openFavorites(page);
  await expect(favoriteRow(favorites, fileName)).toHaveCount(1);
  await favorites.locator('.el-drawer__close-btn').click();

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
  const deleteResponse = await deleted;
  expect(deleteResponse.ok()).toBe(true);
  expect(((await deleteResponse.json()) as { code: number }).code).toBe(200);
  await fileRegistry.confirmDeleted(trackedFile);

  favorites = await openFavorites(page);
  const staleRow = favoriteRow(favorites, fileName);
  const favoriteRemained = (await staleRow.count()) === 1;
  try {
    if (favoriteRemained) {
      await staleRow.getByText(fileName, { exact: true }).click();
      await expect(
        page.getByText('Internal server error: The target path does not exist!', {
          exact: true,
        }),
      ).toBeVisible();

      favorites = await openFavorites(page);
      await favoriteRow(favorites, fileName)
        .getByRole('button', { name: 'Open', exact: true })
        .click();
      await expect(
        page.getByText('Resource does not exist', { exact: true }),
      ).toBeVisible();
    }
  } finally {
    if (
      !(await page
        .getByRole('dialog')
        .filter({ hasText: 'Favorites' })
        .isVisible())
    ) {
      favorites = await openFavorites(page);
    }
    const cleanupRow = favoriteRow(favorites, fileName);
    if ((await cleanupRow.count()) === 1) {
      await removeFavorite(page, cleanupRow);
    }
  }

  test.fail(
    favoriteRemained,
    'Known defect: deleting a file leaves its path in Favorites.',
  );
  expect(favoriteRemained).toBe(false);
});
