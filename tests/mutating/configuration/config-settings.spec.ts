import type { Locator, Page } from '@playwright/test';

import { test, expect } from '../../fixtures/mutating-test';

interface ApiEnvelope {
  code: number;
  message: string;
}

const ONE_CLICK_CONFIG_PATH = '/api/v2/core/settings/one-click/config';
const SETTINGS_UPDATE_PATH = '/api/v2/core/settings/update';

async function readEnvelope(response: {
  json(): Promise<unknown>;
  ok(): boolean;
}): Promise<ApiEnvelope> {
  expect(response.ok()).toBe(true);
  return (await response.json()) as ApiEnvelope;
}

async function openOneClickSettings(page: Page): Promise<Locator> {
  await page.goto('/ai/kis-models/settings');
  const item = page.locator('.el-form-item').filter({
    has: page.getByText('One-Click address', { exact: true }),
  });
  await expect(item).toBeVisible();
  return item.locator('input[type="text"]');
}

function panelAliasRow(page: Page): Locator {
  return page
    .locator('.el-form-item')
    .filter({
      has: page.locator('label').filter({ hasText: /^Panel alias$/ }),
    })
    .first();
}

async function openPanelAlias(page: Page): Promise<Locator> {
  await page.goto('/settings/panel');
  const row = panelAliasRow(page);
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Settings', exact: true }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('input[type="text"]')).toBeVisible();
  return dialog;
}

async function savePanelAlias(page: Page, value: string): Promise<void> {
  const dialog = await openPanelAlias(page);
  await dialog.locator('input[type="text"]').fill(value);
  const updateResponse = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === SETTINGS_UPDATE_PATH,
  );
  await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
  const envelope = await readEnvelope(await updateResponse);
  expect(envelope.code).toBe(200);
  await expect(dialog).toBeHidden();
}

async function expectPanelAlias(page: Page, value: string): Promise<void> {
  const dialog = await openPanelAlias(page);
  await expect(dialog.locator('input[type="text"]')).toHaveValue(value);
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toBeHidden();
}

test('validates and persists the discovered One-Click address', async ({ page }) => {
  const address = await openOneClickSettings(page);
  const originalAddress = await address.inputValue();
  expect(new URL(originalAddress).protocol).toMatch(/^https?:$/);

  await address.fill('not-a-url');
  const invalidResponse = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === ONE_CLICK_CONFIG_PATH,
  );
  await page.getByRole('button', { name: 'Save', exact: true }).first().click();
  const invalidEnvelope = (await (await invalidResponse).json()) as ApiEnvelope;
  expect(invalidEnvelope.code).not.toBe(200);
  await expect(page.getByText(/invalid One-Click address/i)).toBeVisible();

  const unchangedAddress = await openOneClickSettings(page);
  await expect(unchangedAddress).toHaveValue(originalAddress);

  const saveResponse = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === ONE_CLICK_CONFIG_PATH,
  );
  await page.getByRole('button', { name: 'Save', exact: true }).first().click();
  const savedEnvelope = await readEnvelope(await saveResponse);
  expect(savedEnvelope.code).toBe(200);

  const persistedAddress = await openOneClickSettings(page);
  await expect(persistedAddress).toHaveValue(originalAddress);
  await expect(page.getByText(/^One-Click answered at https?:\/\//)).toBeVisible();
});

test('updates the Panel alias and restores its original value', async ({
  mutationRegistry,
  page,
}) => {
  const dialog = await openPanelAlias(page);
  const originalAlias = await dialog.locator('input[type="text"]').inputValue();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();

  const temporaryAlias = `kneo-e2e-${Date.now().toString(36)}`;
  mutationRegistry.trackSettingRestoration('PanelName', originalAlias);

  try {
    await savePanelAlias(page, temporaryAlias);
    await expectPanelAlias(page, temporaryAlias);
  } finally {
    await savePanelAlias(page, originalAlias);
    await expectPanelAlias(page, originalAlias);
    mutationRegistry.confirmSettingRestored('PanelName');
  }
});
