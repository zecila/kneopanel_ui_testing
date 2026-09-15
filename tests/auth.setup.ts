import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { expect, test as setup } from '@playwright/test';

import {
  AUTH_STATE_PATH,
  requireSecret,
  SECURITY_ENTRANCE,
} from './helpers/environment';

setup('authenticate as the test administrator', async ({ page }) => {
  const username = requireSecret('KNEO_ADMIN_USERNAME');
  const password = requireSecret('KNEO_ADMIN_PASSWORD');

  await page.goto(SECURITY_ENTRANCE);

  const usernameInput = page
    .locator('input:not([type="password"]):not([type="hidden"]):visible')
    .first();
  const passwordInput = page.locator('input[type="password"]:visible').first();
  const submitButton = page
    .locator('button[type="submit"]:visible')
    .or(page.getByRole('button', { name: /log[ -]?in|sign[ -]?in/i }))
    .first();

  await expect(usernameInput, 'The username input should be visible').toBeVisible();
  await expect(passwordInput, 'The password input should be visible').toBeVisible();
  await usernameInput.fill(username);
  await passwordInput.fill(password);
  await expect(submitButton, 'The login button should be visible').toBeVisible();
  await submitButton.click();

  await expect(
    passwordInput,
    'Login should finish and remove the password form',
  ).toBeHidden({ timeout: 20_000 });

  await mkdir(path.dirname(AUTH_STATE_PATH), { recursive: true });
  await page.context().storageState({ path: AUTH_STATE_PATH });
});
