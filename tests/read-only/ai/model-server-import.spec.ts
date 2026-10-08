import type { Locator, Page, Request } from '@playwright/test';

import { test, expect } from '../../fixtures/read-only-test';

const IMPORT_PATH = '/api/v2/core/settings/kis/model/import/local';
const JOBS_PATH = '/api/v2/core/settings/kis/model/background/jobs';

function postBody(request: Request): Record<string, unknown> {
  return request.postDataJSON() as Record<string, unknown>;
}

async function openImport(page: Page): Promise<Locator> {
  await page.goto('/ai/kis-models/overview');
  await page.getByRole('button', { name: 'Import from Server', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Import Local Model' });
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe('AI > KIS Models > Import from Server [H,V,F,R,X,A]', () => {
  test('validates server paths before submission', async ({ page }) => {
    let requests = 0;
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === IMPORT_PATH) requests += 1;
    });
    const dialog = await openImport(page);
    const submit = dialog.getByRole('button', { name: 'Import', exact: true });

    await expect(submit).toBeDisabled();
    await dialog
      .getByRole('textbox', { name: 'Registry Path', exact: true })
      .fill('relative/registry');
    await expect(submit).toBeDisabled();
    await dialog
      .getByRole('textbox', { name: 'Registry Path', exact: true })
      .fill('/srv/kneo-e2e/registry');
    await expect(submit).toBeEnabled();
    expect(requests).toBe(0);
  });

  test('reports an import failure and retries with the exact directory payload', async ({
    page,
  }) => {
    let attempts = 0;
    let submitted: Record<string, unknown> | undefined;
    await page.route(`**${IMPORT_PATH}`, async (route) => {
      attempts += 1;
      submitted = postBody(route.request());
      await route.fulfill({
        contentType: 'application/json',
        json:
          attempts === 1
            ? { code: 500, data: null, message: 'kneo-e2e import unavailable' }
            : { code: 200, data: { jobId: 'kneo-e2e-import-job' }, message: '' },
        status: 200,
      });
    });
    await page.route(`**${JOBS_PATH}`, async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        json: { code: 200, data: { items: [], total: 0 }, message: '' },
        status: 200,
      });
    });

    const dialog = await openImport(page);
    await dialog
      .getByRole('textbox', { name: 'Registry Path', exact: true })
      .fill('/srv/kneo-e2e/registry');
    await dialog
      .getByRole('textbox', { name: 'Weights Path', exact: true })
      .fill('/srv/kneo-e2e/weights');

    await dialog.getByRole('button', { name: 'Import', exact: true }).click();
    await expect(dialog.getByText('kneo-e2e import unavailable')).toBeVisible();
    await dialog.getByRole('button', { name: 'Import', exact: true }).click();

    expect(attempts).toBe(2);
    expect(submitted).toEqual({
      registryPath: '/srv/kneo-e2e/registry',
      weightsPath: '/srv/kneo-e2e/weights',
    });
    await expect(dialog.getByText('kneo-e2e-import-job')).toBeVisible();
  });
});
