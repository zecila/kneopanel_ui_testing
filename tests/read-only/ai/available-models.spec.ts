import type { Locator, Page, Response } from '@playwright/test';

import { test, expect } from '../../fixtures/read-only-test';

interface ApiEnvelope<T> {
  code: number;
  data: T;
  message: string;
}

interface AvailableModel {
  gateway?: string;
  modelName: string;
  readinessStatus: string;
  registryName?: string;
  version: string;
  versions: string[];
}

interface AvailableModelList {
  items: AvailableModel[];
  total?: number;
}

const AVAILABLE_PATH = '/api/v2/core/settings/kis/models/available';
const DELETE_PATH = '/api/v2/core/settings/kis/model/delete';

function availableModelsCard(page: Page): Locator {
  return page
    .locator('.el-card')
    .filter({ has: page.getByText('Available Models', { exact: true }) })
    .last();
}

async function readAvailableModels(response: Response): Promise<AvailableModelList> {
  expect(response.ok()).toBe(true);
  const envelope = (await response.json()) as ApiEnvelope<AvailableModelList>;
  expect(envelope.code, envelope.message).toBe(200);
  expect(Array.isArray(envelope.data.items)).toBe(true);
  return envelope.data;
}

async function openAvailableModels(
  page: Page,
): Promise<{ card: Locator; models: AvailableModelList }> {
  const availableResponse = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === AVAILABLE_PATH,
  );
  await page.goto('/ai/kis-models/overview');
  const card = availableModelsCard(page);
  await expect(card).toBeVisible({ timeout: 15_000 });
  return {
    card,
    models: await readAvailableModels(await availableResponse),
  };
}

async function expectAvailableRows(
  card: Locator,
  models: AvailableModelList,
): Promise<void> {
  const rows = card.locator('.el-table__row');
  await expect(rows).toHaveCount(models.items.length);
  if (models.total !== undefined) {
    expect(models.total).toBe(models.items.length);
  }

  for (const model of models.items) {
    expect(model.modelName.trim()).not.toBe('');
    expect(model.version.trim()).not.toBe('');
    expect(model.readinessStatus.trim()).not.toBe('');
    expect(model.versions).toContain(model.version);

    const matches: Locator[] = [];
    for (let index = 0; index < (await rows.count()); index += 1) {
      const row = rows.nth(index);
      const cells = row.locator('td');
      if (
        (await cells.nth(0).innerText()).trim() === model.modelName &&
        (await cells.nth(1).innerText()).trim() === model.version
      ) {
        matches.push(row);
      }
    }
    expect(
      matches,
      `Expected one row for ${model.modelName} (${model.version})`,
    ).toHaveLength(1);

    const row = matches[0];
    const cells = row.locator('td');
    const displayedVersions = await cells.nth(2).innerText();
    for (const version of model.versions) {
      expect(displayedVersions).toContain(version);
    }
    expect((await cells.nth(4).innerText()).trim().toLowerCase()).toBe(
      model.readinessStatus.trim().toLowerCase(),
    );
    await expect(
      row.getByRole('button', { name: 'Add Version', exact: true }),
    ).toBeVisible();
    await expect(
      row.getByRole('button', { name: 'Delete', exact: true }),
    ).toBeVisible();
  }
}

test.describe('AI > KIS Models > Available Models [H,V,F,R,C,A]', () => {
  test('maps every live API model to one complete row and refreshes it', async ({
    page,
  }) => {
    const { card, models } = await openAvailableModels(page);

    for (const column of [
      'Model',
      'Version',
      'All Versions',
      'Serving image',
      'Load Readiness',
      'Operation',
    ]) {
      await expect(
        card.getByRole('columnheader', { name: column, exact: true }),
      ).toBeVisible();
    }
    await expectAvailableRows(card, models);

    const refreshedResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === AVAILABLE_PATH,
    );
    await card.getByRole('button', { name: 'Refresh', exact: true }).click();
    const refreshed = await readAvailableModels(await refreshedResponse);
    await expectAvailableRows(card, refreshed);
  });

  test('shows an explicit empty inventory', async ({ page }) => {
    await page.route(`**${AVAILABLE_PATH}`, async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        json: { code: 200, data: { items: [], total: 0 }, message: '' },
        status: 200,
      });
    });

    const { card, models } = await openAvailableModels(page);
    expect(models).toEqual({ items: [], total: 0 });
    await expectAvailableRows(card, models);
    await expect(card.getByText('No Data', { exact: true })).toBeVisible();
  });

  test('shows a failed inventory request and recovers to multiple rows', async ({
    page,
  }) => {
    const recoveredModels: AvailableModel[] = [
      {
        modelName: 'kneo-e2e-read-only-alpha',
        readinessStatus: 'ready',
        registryName: 'kneo-e2e-read-only-alpha',
        version: 'v1',
        versions: ['v1', 'v2'],
      },
      {
        modelName: 'kneo-e2e-read-only-beta',
        readinessStatus: 'ready',
        registryName: 'kneo-e2e-read-only-beta',
        version: 'v3',
        versions: ['v3'],
      },
    ];
    let attempts = 0;
    await page.route(`**${AVAILABLE_PATH}`, async (route) => {
      attempts += 1;
      await route.fulfill({
        contentType: 'application/json',
        json:
          attempts === 1
            ? {
                code: 500,
                data: null,
                message: 'kneo-e2e model inventory unavailable',
              }
            : {
                code: 200,
                data: { items: recoveredModels, total: recoveredModels.length },
                message: '',
              },
        status: 200,
      });
    });

    const firstResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === AVAILABLE_PATH,
    );
    await page.goto('/ai/kis-models/overview');
    const firstEnvelope = (await (await firstResponse).json()) as ApiEnvelope<null>;
    expect(firstEnvelope).toEqual({
      code: 500,
      data: null,
      message: 'kneo-e2e model inventory unavailable',
    });
    await expect(
      page.getByText('kneo-e2e model inventory unavailable'),
    ).toBeVisible();

    const card = availableModelsCard(page);
    await expect(card.locator('.el-table__row')).toHaveCount(0);
    const retriedResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === AVAILABLE_PATH,
    );
    await card.getByRole('button', { name: 'Refresh', exact: true }).click();
    const retried = await readAvailableModels(await retriedResponse);
    expect(attempts).toBe(2);
    await expectAvailableRows(card, retried);
  });

  test('cancels deletion with the exact model warning and no delete request', async ({
    page,
  }) => {
    const model: AvailableModel = {
      gateway: 'local',
      modelName: 'kneo-e2e-delete-cancel-target',
      readinessStatus: 'ready',
      registryName: 'kneo-e2e-delete-cancel-target',
      version: 'v-cancel',
      versions: ['v-cancel'],
    };
    await page.route(`**${AVAILABLE_PATH}`, async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        json: {
          code: 200,
          data: { items: [model], total: 1 },
          message: '',
        },
        status: 200,
      });
    });
    const { card } = await openAvailableModels(page);
    let deleteRequests = 0;
    page.on('request', (request) => {
      if (
        request.method() === 'POST' &&
        new URL(request.url()).pathname === DELETE_PATH
      ) {
        deleteRequests += 1;
      }
    });

    const rows = card.locator('.el-table__row');
    let row: Locator | undefined;
    for (let index = 0; index < (await rows.count()); index += 1) {
      const candidate = rows.nth(index);
      const cells = candidate.locator('td');
      if (
        (await cells.nth(0).innerText()).trim() === model.modelName &&
        (await cells.nth(1).innerText()).trim() === model.version
      ) {
        row = candidate;
        break;
      }
    }
    expect(row).toBeDefined();
    await row!
      .getByRole('button', { name: 'Delete', exact: true })
      .click();
    const dialog = page.getByRole('dialog', { name: 'Confirm removal' });
    await expect(dialog).toContainText(`Remove ${model.modelName} from local?`);
    await expect(dialog).toContainText(
      'This deletes registry data, preserves shared weights, and is blocked while instances are still running.',
    );
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(dialog).toBeHidden();
    expect(deleteRequests).toBe(0);
    await expect(row!).toBeVisible();
  });

  test('removes one synthetic model with the exact asynchronous delete contract', async ({
    page,
  }) => {
    const model: AvailableModel = {
      gateway: 'local',
      modelName: 'kneo-e2e-delete-target',
      readinessStatus: 'ready',
      registryName: 'kneo-e2e-delete-target',
      version: 'v-delete',
      versions: ['v-delete'],
    };
    let items = [model];
    let deleteBody: unknown;
    await page.route(`**${AVAILABLE_PATH}`, async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        json: { code: 200, data: { items, total: items.length }, message: '' },
        status: 200,
      });
    });
    await page.route(`**${DELETE_PATH}`, async (route) => {
      deleteBody = route.request().postDataJSON();
      items = [];
      await route.fulfill({
        contentType: 'application/json',
        json: { code: 200, data: {}, message: '' },
        status: 200,
      });
    });

    const { card } = await openAvailableModels(page);
    const row = card.locator('.el-table__row').filter({ hasText: model.modelName });
    await row.getByRole('button', { name: 'Delete', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'Confirm removal' })
      .getByRole('button', { name: 'OK', exact: true })
      .click();

    expect(deleteBody).toEqual({
      async: true,
      modelName: model.modelName,
      version: model.version,
    });
    await expect(card.locator('.el-table__row')).toHaveCount(0);
    await page.reload();
    await expect(availableModelsCard(page).locator('.el-table__row')).toHaveCount(0);
  });
});
