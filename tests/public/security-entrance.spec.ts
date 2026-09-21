import { SECURITY_ENTRANCE } from '../helpers/environment';
import { test, expect } from '../fixtures/read-only-test';

test('security entrance displays the login form', async ({ page }) => {
  await page.goto(SECURITY_ENTRANCE);

  await expect(page.locator('input[type="password"]:visible')).toBeVisible();
});

test('blocks an unauthenticated protected route without exposing login', async ({
  page,
}) => {
  await page.goto('/settings/panel');

  await expect(page).toHaveURL(/\/settings\/panel(?:[/?#]|$)/);
  await expect(
    page.getByRole('heading', { name: 'Access Temporarily Unavailable' }),
  ).toBeVisible();
  await expect(page.locator('input[type="password"]:visible')).toHaveCount(0);
});

test('validates empty username and password combinations without submitting', async ({
  page,
}) => {
  await page.goto(SECURITY_ENTRANCE);

  const username = page
    .locator('input:not([type="password"]):not([type="hidden"]):visible')
    .first();
  const password = page.locator('input[type="password"]:visible').first();
  const submit = page
    .locator('button[type="submit"]:visible')
    .or(page.getByRole('button', { name: /sign[ -]?in|log[ -]?in/i }))
    .first();
  const validationErrors = page.locator('.el-form-item__error:visible');

  await submit.click();
  await expect(validationErrors).toHaveCount(2);

  await username.fill('not-submitted');
  await submit.click();
  await expect(validationErrors).toHaveCount(1);

  await username.clear();
  await password.fill('not-submitted');
  await submit.click();
  await expect(validationErrors).toHaveCount(1);
  await expect(password).toBeVisible();
});
