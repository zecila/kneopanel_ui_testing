import { test, expect } from '../../../fixtures/read-only-test';

const visibleDrawer = (page: import('@playwright/test').Page) =>
  page.locator('.el-drawer:visible');

test.describe('Cron Jobs controls', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/cronjobs/cronjob');
    await expect(
      page.getByRole('button', { name: 'Create', exact: true }),
    ).toBeVisible();
  });

  test('keeps bulk actions disabled until a job is selected', async ({ page }) => {
    for (const action of ['Enable', 'Disable', 'Delete', 'Export']) {
      await expect(
        page.getByRole('button', { name: action, exact: true }),
      ).toBeDisabled();
    }

    await expect(
      page.getByRole('button', { name: 'Create', exact: true }),
    ).toBeEnabled();
    await expect(
      page.getByRole('button', { name: 'Group', exact: true }),
    ).toBeEnabled();
  });

  test('opens and backs out of cron creation without submitting', async ({
    page,
  }) => {
    await page.getByRole('button', { name: 'Create', exact: true }).click();

    await expect(page.getByLabel('Name', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Group', { exact: true })).toBeVisible();
    await expect(page.getByText('Trigger cycle', { exact: true })).toBeVisible();
    await expect(
      page.locator('[contenteditable="true"]'),
    ).toBeVisible();

    await page.getByLabel('Name', { exact: true }).fill('not-submitted');
    await page.locator('[contenteditable="true"]').fill('/bin/true');
    await page.getByRole('button', { name: 'Back', exact: true }).last().click();

    await expect(page).toHaveURL(/\/cronjobs\/cronjob(?:[/?#]|$)/);
    await expect(page.getByLabel('Name', { exact: true })).toBeHidden();
  });

  test('opens, starts, and cancels group creation', async ({ page }) => {
    await page.getByRole('button', { name: 'Group', exact: true }).click();
    const drawer = visibleDrawer(page);

    await expect(
      drawer.getByRole('button', { name: 'Create group', exact: true }),
    ).toBeVisible();
    await drawer
      .getByRole('button', { name: 'Create group', exact: true })
      .click();
    await drawer.getByRole('textbox').fill('not-submitted');
    await drawer.getByRole('button', { name: 'Cancel', exact: true }).click();

    await expect(drawer.getByRole('textbox')).toBeHidden();
    await page.locator('.el-drawer__close-btn:visible').click();
    await expect(drawer).toBeHidden();
  });

  test('switches to Script Library and cancels script creation', async ({
    page,
  }) => {
    await page.getByText('Script Library', { exact: true }).click();
    await expect(page).toHaveURL(/\/cronjobs\/library(?:[/?#]|$)/);

    await expect(
      page.getByRole('button', { name: 'Sync', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Delete', exact: true }).first(),
    ).toBeDisabled();

    await page.getByRole('button', { name: 'Create', exact: true }).click();
    const drawer = visibleDrawer(page);
    await drawer.getByLabel('Name', { exact: true }).fill('not-submitted');
    await drawer
      .getByLabel('Script', { exact: true })
      .getByRole('textbox')
      .fill('/bin/true');
    await drawer
      .getByLabel('Description', { exact: true })
      .fill('This form is intentionally canceled.');
    await drawer.getByRole('button', { name: 'Cancel', exact: true }).click();

    await expect(drawer).toBeHidden();
    await page.getByText('Cron Job', { exact: true }).click();
    await expect(page).toHaveURL(/\/cronjobs\/cronjob(?:[/?#]|$)/);
  });
});
