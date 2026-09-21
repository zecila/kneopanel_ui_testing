import { test, expect } from '../../../fixtures/read-only-test';

test('loads the embedded KIS monitoring dashboard', async ({ page }) => {
  await page.goto('/ai/kis-monitoring');

  const dashboard = page.locator('iframe');
  await expect(dashboard).toBeVisible();
  await expect(dashboard).toHaveAttribute('src', /\S+/);
});
