import { test, expect } from '../../fixtures/read-only-test';

test('uses grammatically correct SSH port copy', async ({ page }) => {
  test.info().annotations.push({
    type: 'bug-report',
    description: 'docs/bugs/verified-ui-bugs-9-15-2026.md#18',
  });
  test.fail(true, 'Known defect: the SSH port explanation starts with Specific.');

  await page.goto('/hosts/ssh/ssh');
  const row = page.locator('.el-form-item').filter({
    has: page.getByText('Port', { exact: true }),
  });
  await row.getByRole('button', { name: 'Settings', exact: true }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(
    'Specify the port that SSH service listens on.',
  );
});
