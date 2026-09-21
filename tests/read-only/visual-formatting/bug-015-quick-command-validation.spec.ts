import { test, expect } from '../../fixtures/read-only-test';

test('shows the complete invalid quick-command group message', async ({ page }) => {
  test.info().annotations.push({
    type: 'bug-report',
    description: 'docs/bugs/verified-ui-bugs-9-15-2026.md#15',
  });
  test.fail(
    true,
    'Known defect: the invalid group-name message is clipped by the next form row.',
  );

  await page.goto('/terminal');
  await page.getByText('Quick commands', { exact: true }).click();
  await page.getByRole('button', { name: 'Group', exact: true }).click();

  const drawer = page.locator('.el-drawer:visible');
  await drawer.getByRole('button', { name: 'Create group', exact: true }).click();
  await drawer.getByRole('textbox').fill('test group');
  await drawer.getByRole('textbox').press('Tab');

  const validation = drawer.locator('.el-form-item__error:visible');
  await expect(validation).toContainText('This field must start');
  const dimensions = await validation.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));
  expect(dimensions.clientHeight).toBeGreaterThanOrEqual(dimensions.scrollHeight);
});
