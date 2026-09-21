import { test, expect } from '../../../fixtures/read-only-test';

test.describe('KIS', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/ai/kis/nodes');
  });

  test('displays the provider node table', async ({ page }) => {
    for (const column of [
      'Node',
      'Last Provider Heartbeat',
      'Service Status',
      'Operation',
    ]) {
      await expect(
        page.getByRole('columnheader', { name: column, exact: true }),
      ).toBeVisible();
    }
  });

  test('displays node filtering controls', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Apply' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Refresh' })).toBeVisible();
  });
});
