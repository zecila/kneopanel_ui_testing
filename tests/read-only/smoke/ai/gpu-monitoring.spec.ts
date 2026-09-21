import { test, expect } from '../../../fixtures/read-only-test';

test.describe('GPU Monitoring', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/ai/gpu/current');
  });

  test('displays GPU status columns', async ({ page }) => {
    for (const column of [
      'Driver Version',
      'CUDA Version',
      'GPU Utilization',
      'Temperature',
      'Memory Utilization',
    ]) {
      await expect(
        page.getByRole('columnheader', { name: column, exact: true }),
      ).toBeVisible();
    }
  });

  test('selects an automatic refresh interval and returns to no refresh', async ({
    page,
  }) => {
    const refreshControl = page.locator('.el-dropdown').filter({
      has: page.getByRole('button', { name: 'No refresh', exact: true }),
    });
    const openMenu = refreshControl.getByRole('button').last();

    await expect(
      page.getByRole('button', { name: 'No refresh', exact: true }),
    ).toBeVisible();
    await openMenu.click();

    const menu = page.locator('.el-dropdown-menu:visible');
    const items = menu.locator('.el-dropdown-menu__item');
    await expect(items.first()).toBeVisible();
    expect(await items.count()).toBeGreaterThan(1);

    const automaticInterval = (await items.nth(1).innerText()).trim();
    await items.nth(1).click();
    await expect(
      page.getByRole('button', {
        name: automaticInterval,
        exact: true,
      }),
    ).toBeVisible();

    const automaticRefreshControl = page.locator('.el-dropdown').filter({
      has: page.getByRole('button', {
        name: automaticInterval,
        exact: true,
      }),
    });
    await automaticRefreshControl.getByRole('button').last().click();
    await page
      .locator('.el-dropdown-menu:visible .el-dropdown-menu__item')
      .filter({ hasText: /^No refresh$/ })
      .click();
    await expect(
      page.getByRole('button', { name: 'No refresh', exact: true }),
    ).toBeVisible();
  });
});
