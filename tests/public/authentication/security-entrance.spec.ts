import { SECURITY_ENTRANCE } from '../../helpers/environment';
import { test, expect } from '../../fixtures/read-only-test';

test(
  'security entrance displays the login form',
  { tag: '@smoke' },
  async ({ page }) => {
    await page.goto(SECURITY_ENTRANCE);

    await expect(page.locator('input[type="password"]:visible')).toBeVisible();
  },
);

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
  const settingsResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/v2/core/auth/setting',
  );
  let loginRequests = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/v2/core/auth/login') {
      loginRequests += 1;
    }
  });
  await page.goto(SECURITY_ENTRANCE);
  expect((await (await settingsResponse).json()) as { code: number }).toMatchObject({
    code: 200,
  });

  const username = page
    .locator('input:not([type="password"]):not([type="hidden"]):visible')
    .first();
  const password = page.locator('input[type="password"]:visible').first();
  const submit = page.getByRole('button', { name: 'Sign in', exact: true });
  const validationErrors = page.locator('.el-form-item__error:visible');

  await expect(submit).toBeEnabled();
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
  expect(loginRequests).toBe(0);
});

test('shows invalid-credential feedback and keeps the form available for retry', async ({
  page,
}) => {
  await page.route('**/api/v2/core/auth/setting', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      json: {
        code: 200,
        data: {
          isDemo: false,
          isFxplay: false,
          isOffLine: false,
          language: 'en',
          menuTabs: 'Disable',
          needCaptcha: false,
          panelName: 'KneoPanel',
          passkeySetting: false,
          theme: 'light',
        },
        message: '',
      },
      status: 200,
    });
  });
  let attempts = 0;
  await page.route('**/api/v2/core/auth/login', async (route) => {
    attempts += 1;
    await route.fulfill({
      contentType: 'application/json',
      json: { code: 401, data: null, message: 'ErrAuth' },
      status: 200,
    });
  });

  await page.goto(SECURITY_ENTRANCE);
  const username = page.getByRole('textbox', { name: 'Username', exact: true });
  const password = page.getByRole('textbox', { name: 'Password', exact: true });
  await username.fill('kneo-e2e-invalid-user');
  await password.fill('kneo-e2e-invalid-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();

  await expect(
    page.getByText('Incorrect username or password, try again.', { exact: true }),
  ).toBeVisible();
  await expect(password).toHaveValue('kneo-e2e-invalid-password');
  await password.fill('kneo-e2e-invalid-password-retry');
  await expect(password).toHaveValue('kneo-e2e-invalid-password-retry');
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled();
  expect(attempts).toBe(1);
});
