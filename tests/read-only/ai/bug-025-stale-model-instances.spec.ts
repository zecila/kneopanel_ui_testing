import type { APIResponse, Locator, Response } from '@playwright/test';

import { test, expect } from '../../fixtures/read-only-test';

interface ApiEnvelope<T> {
  code: number;
  data: T;
  message: string;
}

interface BackgroundJob {
  action: string;
  error?: string;
  id: unknown;
  modelName: string;
  provider?: string;
  status: string;
  version: string;
}

interface BackgroundJobs {
  items: BackgroundJob[];
  runtimeJobs?: BackgroundJob[];
}

interface ItemList<T> {
  items: T[];
}

interface KisNode {
  advertiseHost?: string;
  ip: string;
}

interface ModelInstance {
  id?: unknown;
  instanceId?: unknown;
}

interface OrphanRow {
  details: Locator;
  modelName: string;
  operation: Locator;
  provider: string;
  row: Locator;
  version: string;
}

const API_ROOT = '/api/v2/core/settings/kis';

async function readEnvelope<T>(
  response: APIResponse | Response,
): Promise<T> {
  expect(response.ok()).toBe(true);
  const envelope = (await response.json()) as ApiEnvelope<T>;
  expect(envelope.code, envelope.message).toBe(200);
  return envelope.data;
}

test('does not display historical failed load jobs as inoperable model instances', async ({
  context,
  page,
}) => {
  test.info().annotations.push({
    type: 'bug-report',
    description:
      'docs/bugs/2026-10-01/verified-ui-bugs-10-01-2026.md#25-historical-failed-load-jobs-appear-as-inoperable-model-instances-after-upgrade',
  });

  const instancesResponse = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === `${API_ROOT}/instances`,
  );
  const jobsResponse = page.waitForResponse((response) => {
    if (
      response.request().method() !== 'POST' ||
      new URL(response.url()).pathname !== `${API_ROOT}/model/background/jobs`
    ) {
      return false;
    }
    const body = response.request().postDataJSON() as
      | { includeRuntimeJobs?: boolean }
      | null;
    return body?.includeRuntimeJobs === true;
  });

  await page.goto('/ai/kis-models/overview');
  const [instances, jobs, nodes] = await Promise.all([
    readEnvelope<ItemList<ModelInstance>>(await instancesResponse),
    readEnvelope<BackgroundJobs>(await jobsResponse),
    readEnvelope<ItemList<KisNode>>(
      await context.request.get(`${API_ROOT}/nodes`),
    ),
  ]);
  const currentInstanceIds = new Set(
    instances.items
      .map((instance) => instance.instanceId ?? instance.id)
      .filter((id) => id !== undefined && id !== null)
      .map(String),
  );
  const configuredProviders = new Set(
    nodes.items.flatMap((node) =>
      [node.ip, node.advertiseHost].filter(
        (value): value is string => Boolean(value?.trim()),
      ),
    ),
  );
  const allJobs = [...(jobs.runtimeJobs ?? []), ...jobs.items];

  const card = page
    .locator('.el-card')
    .filter({
      has: page.getByText('Model Instance Status', { exact: true }),
    })
    .last();
  await expect(card).toBeVisible();

  const orphanRows: OrphanRow[] = [];
  const rows = card.locator('.el-table__row');
  for (let index = 0; index < (await rows.count()); index += 1) {
    const row = rows.nth(index);
    const cells = row.getByRole('cell');
    await expect(cells).toHaveCount(6);
    const instanceId = (await cells.nth(4).innerText()).trim();
    if (instanceId && instanceId !== '-' && currentInstanceIds.has(instanceId)) {
      continue;
    }

    orphanRows.push({
      details: row.getByText('View failure details', { exact: true }),
      modelName: (await cells.nth(0).innerText()).trim(),
      operation: cells.nth(5),
      provider: (await cells.nth(2).innerText()).trim(),
      row,
      version: (await cells.nth(1).innerText()).trim(),
    });
  }

  for (const orphan of orphanRows) {
    const failedLoad = allJobs.find(
      (job) =>
        job.action === 'load' &&
        job.status.toLowerCase() === 'failed' &&
        job.modelName === orphan.modelName &&
        job.version === orphan.version &&
        job.provider === orphan.provider,
    );
    expect(
      failedLoad,
      `${orphan.modelName} should map to a historical failed load job`,
    ).toBeDefined();
    expect(configuredProviders.has(orphan.provider)).toBe(false);
    await expect(orphan.details).toBeVisible();
    await orphan.details.click();
    await expect(orphan.row).toContainText(failedLoad?.error ?? 'Failed');
    await expect(orphan.operation.getByRole('button')).toHaveCount(0);
    await expect(orphan.operation).toHaveText('');
  }

  test.fail(
    orphanRows.length > 0,
    'Known defect: historical failed load jobs are rendered as current instances without an ID or operation.',
  );
  expect(
    orphanRows,
    'Only records returned by the current instance API should appear in the instance table.',
  ).toHaveLength(0);
});
