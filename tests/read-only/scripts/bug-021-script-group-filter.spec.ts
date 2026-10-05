import { test, expect } from '../../fixtures/read-only-test';

test('offers the built-in System group in the Group filter', async ({ page }) => {
  test.info().annotations.push({
    type: 'bug-report',
    description:
      'docs/bugs/2026-09-16/verified-ui-bugs-9-16-2026.md#21-script-library-group-filtering-omits-system-and-unassigned-scripts',
  });

  await page.goto('/cronjobs/cronjob');
  await page.getByText('Script Library', { exact: true }).click();
  await expect(page.getByRole('row').filter({ hasText: 'System' }).first()).toBeVisible();

  await page.locator('.el-select').first().click();
  await expect(
    page.getByRole('option', { name: 'System', exact: true }),
  ).toBeVisible();
});
