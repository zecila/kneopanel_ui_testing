import { SECURITY_ENTRANCE } from '../helpers/environment';
import { test, expect } from '../fixtures/read-only-test';

test('security entrance displays the login form', async ({ page }) => {
  await page.goto(SECURITY_ENTRANCE);

  await expect(page.locator('input[type="password"]:visible')).toBeVisible();
});
