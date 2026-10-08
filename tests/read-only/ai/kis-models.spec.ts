import type { Page } from '@playwright/test';

import { test, expect } from '../../fixtures/read-only-test';

async function openKisModelSettings(page: Page): Promise<void> {
  await page.goto('/ai/kis-models/overview');
  await page
    .locator('.el-radio-button')
    .filter({ hasText: /^Settings$/ })
    .click();
  await expect(page).toHaveURL(/\/ai\/kis-models\/settings(?:[/?#]|$)/);
}

async function expectOneClickReachable(
  page: Page,
  configuredAddress: string,
): Promise<void> {
  await expect(
    page.getByText(
      'Cannot connect to the One-Click API. One-Click is unavailable, but regular KIS models can still be loaded and used. Check the One-Click service and its connection settings.',
      { exact: true },
    ),
    'One-Click is a core workflow, so an unavailable service must fail the report.',
  ).toHaveCount(0);
  await expect(
    page.getByText(`Cannot reach One-Click at ${configuredAddress}`, { exact: true }),
    `One-Click must answer at its configured address: ${configuredAddress}`,
  ).toHaveCount(0);
  await expect(
    page.getByText(/^One-Click answered at https?:\/\//),
    `One-Click must answer at its configured address: ${configuredAddress}`,
  ).toBeVisible();
}

test.describe('KIS Models', () => {
  test('shows a valid, reachable One-Click service configuration without changing it', async ({
    page,
  }) => {
    await openKisModelSettings(page);

    const service = page.locator('.el-form-item').filter({
      has: page.getByText('One-Click address', { exact: true }),
    });
    const address = service.locator('input[type="text"]');

    await expect(page.getByText('One-Click service', { exact: true })).toBeVisible();
    await expect(address).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Save', exact: true }).first(),
    ).toBeVisible();

    const configuredAddress = await address.inputValue();
    expect(() => new URL(configuredAddress)).not.toThrow();
    expect(new URL(configuredAddress).protocol).toMatch(/^https?:$/);
    await expectOneClickReachable(page, configuredAddress);
  });

  test('reports every One-Click pipeline stage as healthy', async ({
    page,
  }) => {
    await openKisModelSettings(page);

    const service = page.locator('.el-form-item').filter({
      has: page.getByText('One-Click address', { exact: true }),
    });
    const address = service.locator('input[type="text"]');
    await expect(address).not.toHaveValue('');
    const configuredAddress = await address.inputValue();
    await expectOneClickReachable(page, configuredAddress);

    for (const stage of [
      'Product shell',
      'Discovery',
      'Solver',
      'Verification',
      'Report',
      'Gate',
    ]) {
      const row = page.getByRole('row').filter({
        has: page.getByText(stage, { exact: true }),
      });
      await expect(row).toHaveCount(1);
      await expect(row).toContainText('OK');
    }
    await expect(page.getByText('OK', { exact: true })).toHaveCount(6);
  });

  test('shows model, provider, and GPU requirements before loading', async ({
    page,
  }) => {
    await page.goto('/ai/kis-models/overview');
    await page.getByRole('button', { name: 'Load', exact: true }).click();

    const dialog = page.getByRole('dialog', { name: 'Load Model' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Model', { exact: true })).toBeVisible();
    await expect(dialog.getByText('Provider', { exact: true })).toBeVisible();
    await expect(dialog.getByText('GPU Requirement', { exact: true })).toBeVisible();
    await expect(
      dialog.getByText('Select a model and Provider to check GPU capacity.'),
    ).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Load', exact: true })).toBeDisabled();

    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(dialog).toBeHidden();
  });
});
