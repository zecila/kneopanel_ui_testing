import type { Locator, Page } from '@playwright/test';

import { test, expect } from '../../fixtures/read-only-test';

interface PreflightEnvelope {
  code: number;
  data: {
    canLoad: boolean;
    freeGpuCount: number;
    memoryCapacity?: {
      code?: string;
      reason?: string;
    };
    requiredGpuCount: number;
    totalGpuCount: number;
  };
  message: string;
}

async function selectFirstEnabledOption(
  page: Page,
  timeout = 30_000,
): Promise<'selected' | 'empty'> {
  const result = await page.waitForFunction(
    () => {
      const dropdown = [...document.querySelectorAll<HTMLElement>(
        '.el-select-dropdown',
      )].find((candidate) => candidate.offsetParent !== null);
      if (!dropdown) return false;
      const option = dropdown.querySelector<HTMLElement>(
        '[role="option"]:not(.is-disabled)',
      );
      if (option) {
        option.click();
        return 'selected';
      }
      return dropdown.textContent?.includes('No data') ? 'empty' : false;
    },
    undefined,
    { timeout },
  );
  return (await result.jsonValue()) as 'selected' | 'empty';
}

async function openDialogAndSelectModel(page: Page): Promise<Locator | null> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page.getByRole('button', { name: 'Load', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Load Model' });
    await expect(dialog).toBeVisible();
    const comboboxes = dialog.getByRole('combobox');
    await expect(comboboxes).toHaveCount(2);
    await comboboxes.nth(0).click();
    try {
      const selection = await selectFirstEnabledOption(page, 20_000);
      if (selection === 'empty') return null;
      return dialog;
    } catch (error) {
      if (attempt === 1) throw error;
      if (await dialog.isVisible()) throw error;
    }
  }
  throw new Error('Could not open a stable Load Model dialog.');
}

test('calculates GPU requirements for a Ready model without a weight-header error', async ({
  page,
}, testInfo) => {
  testInfo.setTimeout(120_000);
  testInfo.annotations.push({
    type: 'bug-report',
    description:
      'docs/bugs/2026-10-01/verified-ui-bugs-10-01-2026.md#26-ready-models-cannot-complete-gpu-memory-preflight',
  });

  await page.goto('/ai/kis-models/overview');
  await expect(
    page.getByRole('button', { name: 'Refresh', exact: true }).first(),
  ).toBeEnabled({ timeout: 45_000 });
  const dialog = await openDialogAndSelectModel(page);
  if (!dialog) {
    test.skip(
      true,
      'No model is selectable while the current Provider is serving another model.',
    );
    return;
  }
  const comboboxes = dialog.getByRole('combobox');

  const preflightResponse = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname.endsWith('/model/load/preflight'),
    { timeout: 60_000 },
  );
  await comboboxes.nth(1).click();
  const providerSelection = await selectFirstEnabledOption(page);
  expect(providerSelection).toBe('selected');

  const response = await preflightResponse;
  expect(response.ok()).toBe(true);
  const envelope = (await response.json()) as PreflightEnvelope;
  expect(envelope.code).toBe(200);
  await testInfo.attach('model-load-preflight.json', {
    body: Buffer.from(JSON.stringify(envelope, null, 2)),
    contentType: 'application/json',
  });

  const memoryUnverified =
    envelope.data.memoryCapacity?.code === 'GPU_MEMORY_UNVERIFIED';
  if (memoryUnverified) {
    await expect(
      dialog.getByText(
        'GPU memory capacity could not be verified. You can try loading, but it may fail due to insufficient GPU memory. See the details.',
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      dialog.getByText(
        `Required GPUs: ${envelope.data.requiredGpuCount}; Provider GPUs: ${envelope.data.totalGpuCount}.`,
        { exact: true },
      ),
    ).toBeVisible();
    expect(envelope.data.canLoad).toBe(true);
    await expect(
      dialog.getByRole('button', { name: 'Load', exact: true }),
    ).toBeEnabled();
  }

  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toBeHidden();
});
