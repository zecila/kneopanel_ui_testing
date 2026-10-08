import type { Locator, Page } from '@playwright/test';

import { test, expect } from '../../fixtures/read-only-test';

const SECURITY_WRITES = [
  '/api/v2/core/settings/port/update',
  '/api/v2/core/settings/bind/update',
  '/api/v2/core/settings/update',
  '/api/v2/core/settings/ssl/update',
  '/api/v2/core/settings/mfa',
  '/api/v2/core/settings/mfa/bind',
];

function settingRow(page: Page, label: string): Locator {
  return page.locator('.el-form-item').filter({
    has: page.getByText(label, { exact: true }),
  });
}

async function openSetting(page: Page, label: string): Promise<Locator> {
  await settingRow(page, label)
    .getByRole('button', { name: 'Settings', exact: true })
    .click();
  const dialog = page.getByRole('dialog').last();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(label, { exact: true }).first()).toBeVisible();
  return dialog;
}

test.describe('Settings > Security guide workflows [H,V,C,X,A]', () => {
  test('exposes every guide-critical access and authentication control', async ({
    page,
  }) => {
    await page.goto('/settings/safe');
    for (const label of [
      'Panel port',
      'Bind info',
      'Entrance',
      'Unauthorized setting',
      'Authorized IP',
      'Bind domain',
      'Panel SSL',
      'Expiration Date',
      'Complexity validation',
      'Two-Factor Auth',
      'Passkey',
    ]) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    }
    await expect(settingRow(page, 'Panel SSL').locator('.el-switch')).toBeVisible();
    await expect(
      settingRow(page, 'Complexity validation').locator('.el-switch'),
    ).toBeVisible();
    await expect(settingRow(page, 'Two-Factor Auth').locator('.el-switch')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Manage' })).toBeVisible();
  });

  test('opens and cancels every editable network restriction without writing', async ({
    page,
  }) => {
    let writes = 0;
    page.on('request', (request) => {
      if (SECURITY_WRITES.includes(new URL(request.url()).pathname)) writes += 1;
    });
    await page.goto('/settings/safe');
    for (const label of [
      'Panel port',
      'Bind info',
      'Entrance',
      'Unauthorized setting',
      'Authorized IP',
      'Bind domain',
      'Expiration Date',
    ]) {
      const dialog = await openSetting(page, label);
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
      await expect(dialog).toBeHidden();
    }
    expect(writes).toBe(0);
  });

  test('rejects invalid port, IP allowlist, and domain values before submission', async ({
    page,
  }) => {
    let writes = 0;
    for (const path of SECURITY_WRITES) {
      await page.route(`**${path}`, async (route) => {
        writes += 1;
        await route.fulfill({
          contentType: 'application/json',
          json: { code: 500, data: null, message: 'unexpected security write' },
          status: 200,
        });
      });
    }
    await page.goto('/settings/safe');

    const port = await openSetting(page, 'Panel port');
    await port.getByRole('textbox', { name: 'Panel port' }).fill('70000');
    await port.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(port.locator('.el-form-item__error')).toBeVisible();
    await port.getByRole('button', { name: 'Cancel', exact: true }).click();

    const ip = await openSetting(page, 'Authorized IP');
    await ip.getByRole('textbox', { name: 'Authorized IP' }).fill('not-an-ip');
    await ip.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(ip.locator('.el-form-item__error')).toBeVisible();
    await ip.getByRole('button', { name: 'Cancel', exact: true }).click();

    const domain = await openSetting(page, 'Bind domain');
    await domain.getByRole('textbox', { name: 'Bind domain' }).fill('http://bad host');
    await domain.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(domain.locator('.el-form-item__error')).toBeVisible();
    await domain.getByRole('button', { name: 'Cancel', exact: true }).click();

    expect(writes).toBe(0);
  });

  test('reviews and cancels the HTTPS certificate workflow without changing SSL', async ({
    page,
  }) => {
    let sslWrites = 0;
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === '/api/v2/core/settings/ssl/update') {
        sslWrites += 1;
      }
    });
    await page.goto('/settings/safe');
    const row = settingRow(page, 'Panel SSL');
    const toggle = row.getByRole('switch', { name: 'Panel SSL' });
    const initialState = await toggle.getAttribute('aria-checked');

    await row.locator('.el-switch').click();
    const prompt = page.getByRole('dialog').last();
    await expect(prompt).toBeVisible();
    await expect(prompt).toContainText(/Panel SSL|https service/i);
    await prompt.getByRole('button', { name: 'Cancel', exact: true }).click();

    await expect(toggle).toHaveAttribute('aria-checked', initialState ?? 'false');
    expect(sslWrites).toBe(0);
  });
});
