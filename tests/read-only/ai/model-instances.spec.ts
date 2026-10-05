import type { Locator, Page } from '@playwright/test';

import { test, expect } from '../../fixtures/read-only-test';

interface ApiEnvelope<T> {
  code: number;
  data: T;
  message: string;
}

interface InstanceList {
  items: ModelInstance[];
  total?: number;
}

interface ModelInstance {
  id?: unknown;
  instanceId?: unknown;
  modelName: string;
  provider: string;
  runtimeProvider?: string;
  status: string;
  version: string;
}

const INSTANCES_PATH = '/api/v2/core/settings/kis/instances';

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function modelInstanceCard(page: Page): Locator {
  return page
    .locator('.el-card')
    .filter({
      has: page.getByText('Model Instance Status', { exact: true }),
    })
    .last();
}

function instanceIdentity(instance: ModelInstance): string {
  const value = instance.instanceId ?? instance.id;
  expect(value, 'Every model instance should have an ID').toBeDefined();
  const id = String(value).trim();
  expect(id).not.toBe('');
  return id;
}

function instanceRow(card: Locator, instance: ModelInstance): Locator {
  const id = instanceIdentity(instance);
  return card.locator('.el-table__row').filter({
    hasText: new RegExp(`(?:^|\\s)${escapeRegex(id)}(?:\\s|$)`),
  });
}

async function readInstances(response: {
  json(): Promise<unknown>;
  ok(): boolean;
}): Promise<InstanceList> {
  expect(response.ok()).toBe(true);
  const envelope = (await response.json()) as ApiEnvelope<InstanceList>;
  expect(envelope.code, envelope.message).toBe(200);
  expect(Array.isArray(envelope.data.items)).toBe(true);
  return envelope.data;
}

async function openModelInstances(
  page: Page,
): Promise<{ card: Locator; instances: InstanceList }> {
  const instancesResponse = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === INSTANCES_PATH,
  );
  await page.goto('/ai/kis-models/overview');

  const card = modelInstanceCard(page);
  await expect(card).toBeVisible();
  return {
    card,
    instances: await readInstances(await instancesResponse),
  };
}

async function expectInstanceRows(
  card: Locator,
  instances: InstanceList,
): Promise<void> {
  const rows = card.locator('.el-table__row');
  expect(await rows.count()).toBeGreaterThanOrEqual(instances.items.length);
  if (instances.total !== undefined) {
    expect(instances.total).toBe(instances.items.length);
  }

  if (instances.items.length === 0) {
    return;
  }

  const instanceIds = instances.items.map(instanceIdentity);
  expect(new Set(instanceIds).size).toBe(instanceIds.length);

  for (const [index, instance] of instances.items.entries()) {
    const id = instanceIds[index];
    const row = instanceRow(card, instance);
    await expect(row, `Expected one UI row for instance ${id}`).toHaveCount(1);

    const rowText = (await row.innerText()).toLowerCase();
    for (const [field, value] of [
      ['model', instance.modelName],
      ['version', instance.version],
      ['provider', instance.runtimeProvider?.trim() || instance.provider],
      ['status', instance.status],
    ] as const) {
      expect(value?.trim(), `Instance ${id} should report ${field}`).toBeTruthy();
      expect(rowText, `Instance ${id} should display ${field}`).toContain(
        value.trim().toLowerCase(),
      );
    }

    await expect(
      row.getByRole('button', { name: 'Unload', exact: true }),
    ).toBeVisible();
  }
}

test.describe('AI > KIS Models > Model instances > Status and refresh', () => {
  test('API/UI mapping: displays each current instance record in one complete status row', async ({
    page,
  }) => {
    const { card, instances } = await openModelInstances(page);

    for (const column of [
      'Model',
      'Version',
      'Provider',
      'Status',
      'Instance ID',
      'Operation',
    ]) {
      await expect(
        card.getByRole('columnheader', { name: column, exact: true }),
      ).toBeVisible();
    }

    await expectInstanceRows(card, instances);
  });

  test('Refresh: reloads the instance table from the API without mutation', async ({
    page,
  }) => {
    const { card } = await openModelInstances(page);
    const refreshedResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === INSTANCES_PATH,
    );

    await card.getByRole('button', { name: 'Refresh', exact: true }).click();
    const refreshed = await readInstances(await refreshedResponse);
    await expectInstanceRows(card, refreshed);

    await expect(
      card.getByRole('button', { name: 'Load', exact: true }),
    ).toBeEnabled();
  });

  test('Failed-state recovery: exposes failure details and an enabled unload action', async ({
    page,
  }) => {
    const { card, instances } = await openModelInstances(page);
    const failedInstances = instances.items.filter((instance) =>
      ['error', 'failed'].includes(instance.status.trim().toLowerCase()),
    );
    test.skip(
      failedInstances.length === 0,
      'KIS did not report a failed model instance to inspect.',
    );

    for (const instance of failedInstances) {
      const id = instanceIdentity(instance);
      const row = instanceRow(card, instance);
      await expect(
        row,
        `Expected one UI row for failed instance ${id}`,
      ).toHaveCount(1);
      await expect(
        row.getByText(/view failure details/i),
        `Failed instance ${id} should expose its failure details`,
      ).toBeVisible();
      await expect(
        row.getByRole('button', { name: 'Unload', exact: true }),
        `Failed instance ${id} should provide a cleanup operation`,
      ).toBeEnabled();
    }
  });
});
