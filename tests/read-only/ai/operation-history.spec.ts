import type { Locator, Page, Response } from '@playwright/test';

import { test, expect } from '../../fixtures/read-only-test';

interface ApiEnvelope<T> {
  code: number;
  data: T;
  message: string;
}

interface ModelOperation {
  action: string;
  archiveStatus: string;
  createdAt: string;
  error?: string;
  fileStatus?: string;
  id: string;
  modelName: string;
  progress: number;
  readinessStatus?: string;
  registrationStatus?: string;
  status: string;
  storageMode: string;
  version: string;
}

interface OperationList {
  items: ModelOperation[];
  total: number;
}

const API_ROOT = '/api/v2/core/settings/kis';
const HISTORY_PATH = `${API_ROOT}/model/background/jobs`;

const SAFE_OPERATIONS: ModelOperation[] = [
  {
    action: 'load',
    archiveStatus: 'success',
    createdAt: '2026-10-06T19:00:00Z',
    id: 'kneo-e2e-history-success',
    modelName: 'kneo-e2e-model-alpha',
    progress: 100,
    status: 'success',
    storageMode: 'legacy_local',
    version: 'v1',
  },
  {
    action: 'upload',
    archiveStatus: 'failed',
    createdAt: '2026-10-06T18:00:00Z',
    error: 'kneo-e2e safe expected failure',
    fileStatus: 'failed',
    id: 'kneo-e2e-history-failed',
    modelName: 'kneo-e2e-model-beta',
    progress: 25,
    readinessStatus: 'failed',
    registrationStatus: 'failed',
    status: 'failed',
    storageMode: 'legacy_local',
    version: 'v2',
  },
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function historyCard(page: Page): Locator {
  return page
    .locator('.el-card')
    .filter({ has: page.getByText('Model Operation Records', { exact: true }) })
    .last();
}

async function ensureExpanded(card: Locator): Promise<void> {
  const expand = card.getByRole('button', { name: 'Expand', exact: true });
  if (await expand.isVisible().catch(() => false)) {
    await expand.click();
  }
  await expect(
    card.getByRole('button', { name: 'Collapse', exact: true }),
  ).toBeVisible();
}

async function routeAncillaryPanels(page: Page): Promise<void> {
  await page.route('**/api/v2/files/read', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      json: { code: 200, data: '', message: '' },
      status: 200,
    });
  });
  await page.route(`**${API_ROOT}/nodes`, async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      json: { code: 200, data: { items: [] }, message: '' },
      status: 200,
    });
  });
}

async function readHistory(response: Response): Promise<OperationList> {
  expect(response.ok()).toBe(true);
  const envelope = (await response.json()) as ApiEnvelope<OperationList>;
  expect(envelope.code, envelope.message).toBe(200);
  expect(Array.isArray(envelope.data.items)).toBe(true);
  return envelope.data;
}

async function openHistory(
  page: Page,
): Promise<{ card: Locator; history: OperationList }> {
  const response = page.waitForResponse(
    (candidate) =>
      candidate.request().method() === 'POST' &&
      new URL(candidate.url()).pathname === HISTORY_PATH,
  );
  await page.goto('/ai/kis/logs');
  const history = await readHistory(await response);
  const card = historyCard(page);
  await expect(card).toBeVisible();
  await ensureExpanded(card);
  return { card, history };
}

async function expectHistoryRows(
  card: Locator,
  history: OperationList,
): Promise<void> {
  await ensureExpanded(card);
  const rows = card.locator('.el-table__row');
  await expect(rows).toHaveCount(history.items.length);
  expect(history.total).toBeGreaterThanOrEqual(history.items.length);

  const renderedRows = await rows.evaluateAll((elements) =>
    elements.map((row) =>
      Array.from(row.querySelectorAll('td'), (cell) =>
        (cell.textContent ?? '').trim(),
      ),
    ),
  );
  for (const [index, operation] of history.items.entries()) {
    const cells = renderedRows[index];
    expect(cells).toHaveLength(8);
    expect(cells[0]).toBe(operation.modelName);
    expect(cells[1]).toBe(operation.version);
    expect(cells[3]).toMatch(
      new RegExp(`^${escapeRegExp(operation.action)}$`, 'i'),
    );
    expect(cells[4]).toMatch(
      new RegExp(`^${escapeRegExp(operation.status)}$`, 'i'),
    );
    if (operation.error) {
      expect(cells[5]).toContain(operation.error);
    }
  }
}

test.describe('AI > KIS > Model operation history [H,F,R,C,A]', () => {
  test('maps the live API page and refreshes without mutation', async ({ page }) => {
    await page.route('**/api/v2/files/read', async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        json: { code: 200, data: '', message: '' },
        status: 200,
      });
    });
    const { card, history } = await openHistory(page);
    expect(history.items.length).toBeLessThanOrEqual(30);
    await expectHistoryRows(card, history);

    const refreshedResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === HISTORY_PATH,
    );
    await card.getByRole('button', { name: 'Refresh', exact: true }).click();
    const refreshed = await readHistory(await refreshedResponse);
    expect((await refreshedResponse).request().postDataJSON()).toEqual({
      page: 1,
      pageSize: 30,
    });
    await expectHistoryRows(card, refreshed);
  });

  test('renders an explicit empty operation history', async ({ page }) => {
    await routeAncillaryPanels(page);
    await page.route(`**${HISTORY_PATH}`, async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        json: { code: 200, data: { items: [], total: 0 }, message: '' },
        status: 200,
      });
    });
    const { card, history } = await openHistory(page);
    expect(history).toEqual({ items: [], total: 0 });
    await expectHistoryRows(card, history);
    await expect(card.getByText('No Data', { exact: true })).toBeVisible();
  });

  test('recovers from failure and exposes successful and failed details', async ({
    page,
  }) => {
    let attempts = 0;
    await routeAncillaryPanels(page);
    await page.route(`**${HISTORY_PATH}`, async (route) => {
      attempts += 1;
      await route.fulfill({
        contentType: 'application/json',
        json:
          attempts === 1
            ? {
                code: 500,
                data: null,
                message: 'kneo-e2e operation history unavailable',
              }
            : {
                code: 200,
                data: { items: SAFE_OPERATIONS, total: SAFE_OPERATIONS.length },
                message: '',
              },
        status: 200,
      });
    });

    const rejected = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === HISTORY_PATH,
    );
    await page.goto('/ai/kis/logs');
    expect((await (await rejected).json()) as ApiEnvelope<null>).toEqual({
      code: 500,
      data: null,
      message: 'kneo-e2e operation history unavailable',
    });
    await expect(
      page.getByText('kneo-e2e operation history unavailable').first(),
    ).toBeVisible();
    const card = historyCard(page);
    await expect(card.locator('.el-table__row')).toHaveCount(0);

    const retriedResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === HISTORY_PATH,
    );
    await card.getByRole('button', { name: 'Refresh', exact: true }).click();
    const retried = await readHistory(await retriedResponse);
    await expectHistoryRows(card, retried);
    expect(attempts).toBeGreaterThanOrEqual(2);
    await expect(
      card.getByText('kneo-e2e safe expected failure', { exact: true }),
    ).toBeVisible();
  });
});
