import { test, expect } from '../../fixtures/file-mutating-test';
import {
  createFolderThroughUi,
  openDirectory,
  openTmpDirectory,
} from '../../helpers/file-browser-ui';
import { uniqueResourceName } from '../../helpers/mutation-safety';

test('shows required feedback without requesting a blank file creation', async ({
  fileRegistry,
  page,
}) => {
  const folderName = uniqueResourceName('blank-file-name');
  const folderPath = `/tmp/${folderName}`;
  await openTmpDirectory(page);
  await createFolderThroughUi(page, fileRegistry, '/tmp', folderName);
  await openDirectory(page, folderName, folderPath);

  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await page
    .locator('.el-dropdown-menu:visible')
    .last()
    .getByText('File Browser', { exact: true })
    .click();

  let blankCreateRequests = 0;
  await page.route('**/api/v2/files', async (route) => {
    const request = route.request();
    if (
      request.method() === 'POST' &&
      new URL(request.url()).pathname === '/api/v2/files'
    ) {
      blankCreateRequests += 1;
      await route.abort();
      return;
    }
    await route.continue();
  });

  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(
    dialog.getByText('This field is required.', { exact: true }),
  ).toBeVisible();
  expect(blankCreateRequests).toBe(0);
  await page.unroute('**/api/v2/files');
});
