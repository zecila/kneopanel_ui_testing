import { test, expect } from '../../fixtures/read-only-test';

test('offers every displayed script group in the Group filter', async ({ page }) => {
  test.info().annotations.push({
    type: 'bug-report',
    description: 'docs/bugs/verified-ui-bugs-9-16-2026.md#21',
  });
  test.fail(
    true,
    'Known defect: the Script Library Group filter omits the built-in System group.',
  );

  await page.goto('/cronjobs/cronjob');
  await page.getByText('Script Library', { exact: true }).click();
  await expect(page.getByRole('row').filter({ hasText: 'System' }).first()).toBeVisible();

  await page.locator('.el-select').first().click();
  await expect(
    page.getByRole('option', { name: 'System', exact: true }),
  ).toBeVisible();
});
