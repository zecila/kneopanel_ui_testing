import type { Locator, Page, Request } from '@playwright/test';

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
  deploymentId?: string;
  id?: unknown;
  instanceId?: unknown;
  modelName: string;
  provider: string;
  runtimeProvider?: string;
  status: string;
  version: string;
}

const INSTANCES_PATH = '/api/v2/core/settings/kis/instances';
const UNLOAD_PATH = '/api/v2/core/settings/kis/model/unload';

function envelope(data: unknown, code = 200, message = ''): object {
  return { code, data, message };
}

function postBody(request: Request): Record<string, unknown> {
  return request.postDataJSON() as Record<string, unknown>;
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

async function instanceRow(
  card: Locator,
  instance: ModelInstance,
): Promise<Locator> {
  const id = instanceIdentity(instance);
  const rows = card.locator('.el-table__row');
  for (let index = 0; index < (await rows.count()); index += 1) {
    const row = rows.nth(index);
    if ((await row.locator('td').nth(4).innerText()).trim() === id) {
      return row;
    }
  }
  throw new Error(`Expected one UI row for instance ${id}.`);
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
  await expect(rows).toHaveCount(instances.items.length);
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
    const row = await instanceRow(card, instance);

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

    const status = instance.status.trim().toLowerCase();
    const expectedOperation = ['error', 'failed'].includes(status)
      ? 'Unload'
      : 'Stop';
    await expect(
      row.getByRole('button', { name: expectedOperation, exact: true }),
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
      const row = await instanceRow(card, instance);
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

  test('stops one exact intercepted instance, supports cancellation, and persists removal', async ({
    page,
  }) => {
    const instance: ModelInstance = {
      deploymentId: '',
      id: 900001,
      instanceId: 900001,
      modelName: 'kneo-e2e-stop-target',
      provider: 'kneo-e2e-provider',
      runtimeProvider: 'kneo-e2e-provider',
      status: 'running',
      version: 'v-stop',
    };
    let items = [instance];
    await page.route('**/one-click/proxy/api/gate/deployments/observe', async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        json: { deployments: [] },
        status: 200,
      });
    });
    await page.route(`**${INSTANCES_PATH}`, async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        json: envelope({ items, total: items.length }),
        status: 200,
      });
    });
    const { card } = await openModelInstances(page);
    const id = instanceIdentity(instance);
    const provider = instance.runtimeProvider?.trim() || instance.provider;
    let unloadRequests = 0;
    let unloadBody: Record<string, unknown> | undefined;
    await page.route(`**${UNLOAD_PATH}`, async (route) => {
      unloadRequests += 1;
      unloadBody = postBody(route.request());
      items = [];
      await route.fulfill({
        contentType: 'application/json',
        json: envelope({}),
        status: 200,
      });
    });

    const row = await instanceRow(card, instance);
    await row.getByRole('button', { name: 'Stop', exact: true }).click();
    const cancellation = page.getByRole('dialog', { name: 'Confirm stop' });
    await expect(cancellation).toContainText(
      `Stop instance ${id} of ${instance.modelName} on ${provider}?`,
    );
    await cancellation.getByRole('button', { name: 'Cancel', exact: true }).click();
    expect(unloadRequests).toBe(0);
    await expect(row).toBeVisible();

    await row.getByRole('button', { name: 'Stop', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'Confirm stop' })
      .getByRole('button', { name: 'OK', exact: true })
      .click();
    await expect(card.getByRole('cell', { name: id, exact: true })).toHaveCount(0);
    expect(unloadRequests).toBe(1);
    expect(unloadBody).toEqual({
      instanceIds: [Number(id)],
      modelName: instance.modelName,
      provider,
      version: instance.version,
    });

    await page.reload();
    await expect(
      modelInstanceCard(page).getByRole('cell', { name: id, exact: true }),
    ).toHaveCount(0);
  });
});
