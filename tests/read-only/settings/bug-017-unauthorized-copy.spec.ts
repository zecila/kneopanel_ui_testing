import { test, expect } from '../../fixtures/read-only-test';

test('uses grammatically correct Unauthorized setting copy', async ({ page }) => {
  test.info().annotations.push({
    type: 'bug-report',
    description:
      'docs/bugs/2026-09-15/verified-ui-bugs-9-15-2026.md#17-unauthorized-setting-explanation-contains-a-typo',
  });
  await page.goto('/settings/safe');
  const row = page.locator('.el-form-item').filter({
    has: page.getByText('Unauthorized setting', { exact: true }),
  });
  await row.getByRole('button', { name: 'Settings', exact: true }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(
    'this response can hide panel characteristics',
  );
});
