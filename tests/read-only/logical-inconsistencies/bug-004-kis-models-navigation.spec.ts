import { test, expect } from '../../fixtures/read-only-test';

test('opens KIS Models without an error notification blocking navigation', async ({
  page,
}) => {
  test.info().annotations.push({
    type: 'bug-report',
    description: 'docs/bugs/verified-ui-bugs-9-14-2026.md#4',
  });
  test.fail(
    true,
    'Known defect: the KIS error notification currently intercepts KIS Models navigation.',
  );

  await page.goto('/');
  await page.getByRole('menuitem', { name: 'AI', exact: true }).click();
  await page.getByRole('menuitem', { name: 'KIS Models', exact: true }).click();

  await expect(page).toHaveURL(/\/ai\/.+/);
  await expect(page.getByText('From Hugging Face', { exact: true })).toBeVisible();
});
