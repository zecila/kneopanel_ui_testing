import { test, expect } from '../../fixtures/mutating-test';
import {
  createGroupThroughUi,
  openScriptLibrary,
  visibleDrawer,
} from '../../helpers/cron-ui';
import { uniqueResourceName } from '../../helpers/mutation-safety';

test('creates, edits, assigns, and deletes a script-library entry', async ({
  mutationRegistry,
  page,
}) => {
  const groupName = uniqueResourceName('script-group');
  const scriptName = uniqueResourceName('script');
  const editedDescription = `Edited by Playwright: ${scriptName}`;

  await createGroupThroughUi(
    page,
    mutationRegistry,
    'script-group',
    groupName,
  );

  await openScriptLibrary(page);
  await page.getByRole('button', { name: 'Create', exact: true }).click();

  let drawer = visibleDrawer(page);
  await drawer.getByLabel('Name', { exact: true }).fill(scriptName);
  await drawer
    .getByLabel('Script', { exact: true })
    .getByRole('textbox')
    .fill('/bin/true');
  await drawer
    .getByLabel('Description', { exact: true })
    .fill(`Created by Playwright: ${scriptName}`);

  await mutationRegistry.prepare('script', scriptName);
  const created = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/api/v2/core/script',
  );
  await drawer.getByRole('button', { name: 'Confirm', exact: true }).click();
  expect((await created).ok()).toBe(true);
  const script = await mutationRegistry.capture('script', scriptName);

  let row = page.getByRole('row').filter({ hasText: scriptName });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Edit', exact: true }).click();

  drawer = visibleDrawer(page);
  await drawer
    .getByLabel('Description', { exact: true })
    .fill(editedDescription);
  await drawer.getByLabel('Group', { exact: true }).click();
  await page.getByRole('option', { name: groupName, exact: true }).click();

  const updated = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/api/v2/core/script/update',
  );
  await drawer.getByRole('button', { name: 'Confirm', exact: true }).click();
  expect((await updated).ok()).toBe(true);

  row = page.getByRole('row').filter({ hasText: scriptName });
  await expect(row).toContainText(groupName);
  await expect(row).toContainText(editedDescription);

  const deleted = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/api/v2/core/script/del',
  );
  await row.getByRole('button', { name: 'Delete', exact: true }).click();
  const confirm = page.getByRole('button', { name: 'Confirm', exact: true });
  if (await confirm.isVisible({ timeout: 1_000 }).catch(() => false)) {
    await confirm.click();
  }
  expect((await deleted).ok()).toBe(true);

  await mutationRegistry.confirmDeleted(script);
  await expect(row).toHaveCount(0);
});
