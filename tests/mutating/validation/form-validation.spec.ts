import { test, expect } from '../../fixtures/mutating-test';
import { openScriptLibrary, visibleDrawer } from '../../helpers/cron-ui';

test('rejects incomplete cron creation without sending a create request', async ({
  page,
}) => {
  const createRequests: string[] = [];
  page.on('request', (request) => {
    if (
      request.method() === 'POST' &&
      new URL(request.url()).pathname === '/api/v2/cronjobs'
    ) {
      createRequests.push(request.url());
    }
  });

  await page.goto('/cronjobs/cronjob');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();

  await expect(page.locator('.el-form-item__error:visible').first()).toBeVisible();
  expect(createRequests).toHaveLength(0);

  await page.getByLabel('Name', { exact: true }).fill('not-submitted');
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.locator('.el-form-item__error:visible').first()).toBeVisible();
  expect(createRequests).toHaveLength(0);
  await page.getByRole('button', { name: 'Back', exact: true }).last().click();
});

test('rejects incomplete script creation without sending a create request', async ({
  page,
}) => {
  const createRequests: string[] = [];
  page.on('request', (request) => {
    if (
      request.method() === 'POST' &&
      new URL(request.url()).pathname === '/api/v2/core/script'
    ) {
      createRequests.push(request.url());
    }
  });

  await openScriptLibrary(page);
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  const drawer = visibleDrawer(page);
  await drawer.getByRole('button', { name: 'Confirm', exact: true }).click();

  await expect(drawer.locator('.el-form-item__error:visible').first()).toBeVisible();
  expect(createRequests).toHaveLength(0);

  await drawer.getByLabel('Name', { exact: true }).fill('not-submitted');
  await drawer.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(drawer.locator('.el-form-item__error:visible').first()).toBeVisible();
  expect(createRequests).toHaveLength(0);
  await drawer.getByRole('button', { name: 'Cancel', exact: true }).click();
});
