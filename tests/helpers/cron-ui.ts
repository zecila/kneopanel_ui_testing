import type { Page } from '@playwright/test';

import type {
  MutationRegistry,
  MutationResource,
  MutationResourceKind,
} from '../fixtures/mutating-test';

const GROUP_CREATE_PATH = '/api/v2/core/groups';

export function visibleDrawer(page: Page) {
  return page.locator('.el-drawer:visible');
}

export async function openScriptLibrary(page: Page): Promise<void> {
  await page.goto('/cronjobs/cronjob');
  await page.getByText('Script Library', { exact: true }).click();
  await page.waitForURL(/\/cronjobs\/library(?:[/?#]|$)/);
}

export async function createGroupThroughUi(
  page: Page,
  registry: MutationRegistry,
  kind: Extract<MutationResourceKind, 'cron-group' | 'script-group'>,
  name: string,
): Promise<MutationResource> {
  if (kind === 'cron-group') {
    await page.goto('/cronjobs/cronjob');
  } else {
    await openScriptLibrary(page);
  }
  await page.getByRole('button', { name: 'Group', exact: true }).click();

  const drawer = visibleDrawer(page);
  await drawer.getByRole('button', { name: 'Create group', exact: true }).click();
  await drawer.getByRole('textbox').fill(name);
  await registry.prepare(kind, name);

  const created = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === GROUP_CREATE_PATH,
  );
  await drawer.getByRole('button', { name: 'Save', exact: true }).click();
  const response = await created;
  if (!response.ok()) {
    throw new Error(`Creating group failed with HTTP ${response.status()}.`);
  }

  return registry.capture(kind, name);
}

export async function createShellCronJobThroughUi(
  page: Page,
  registry: MutationRegistry,
  name: string,
  groupName?: string,
  script = '/bin/true',
): Promise<MutationResource> {
  await page.goto('/cronjobs/cronjob');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.locator('[contenteditable="true"]').fill(script);

  if (groupName) {
    await page.getByLabel('Group', { exact: true }).click();
    await page.getByRole('option', { name: groupName, exact: true }).click();
  }

  await registry.prepare('cron-job', name);

  const created = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/api/v2/cronjobs',
  );
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  const response = await created;
  if (!response.ok()) {
    throw new Error(`Creating cron job failed with HTTP ${response.status()}.`);
  }

  return registry.capture('cron-job', name);
}

export async function createScriptThroughUi(
  page: Page,
  registry: MutationRegistry,
  name: string,
  options: {
    description?: string;
    groupName?: string;
    script?: string;
  } = {},
): Promise<MutationResource> {
  await openScriptLibrary(page);
  await page.getByRole('button', { name: 'Create', exact: true }).click();

  const drawer = visibleDrawer(page);
  await drawer.getByLabel('Name', { exact: true }).fill(name);
  await drawer
    .getByLabel('Script', { exact: true })
    .getByRole('textbox')
    .fill(options.script ?? '/bin/true');

  if (options.description) {
    await drawer
      .getByLabel('Description', { exact: true })
      .fill(options.description);
  }

  if (options.groupName) {
    await drawer.getByLabel('Group', { exact: true }).click();
    await page
      .getByRole('option', { name: options.groupName, exact: true })
      .click();
  }

  await registry.prepare('script', name);
  const created = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/api/v2/core/script',
  );
  await drawer.getByRole('button', { name: 'Confirm', exact: true }).click();
  const response = await created;
  if (!response.ok()) {
    throw new Error(`Creating script failed with HTTP ${response.status()}.`);
  }

  return registry.capture('script', name);
}
