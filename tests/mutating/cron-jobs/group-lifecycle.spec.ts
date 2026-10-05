import { test, expect } from '../../fixtures/mutating-test';
import { createGroupThroughUi, visibleDrawer } from '../../helpers/cron-ui';
import { uniqueResourceName } from '../../helpers/mutation-safety';

test('creates, renames, and deletes a cron group', async ({
  mutationRegistry,
  page,
}) => {
  const originalName = uniqueResourceName('cron-group');
  const updatedName = uniqueResourceName('cron-group-edited');
  const group = await createGroupThroughUi(
    page,
    mutationRegistry,
    'cron-group',
    originalName,
  );
  const drawer = visibleDrawer(page);

  await expect(drawer.getByText(originalName, { exact: true })).toBeVisible();

  await drawer
    .getByRole('row')
    .filter({ hasText: originalName })
    .getByRole('button', { name: 'Edit', exact: true })
    .click();
  await drawer.getByRole('textbox').fill(updatedName);

  const updated = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/api/v2/core/groups/update',
  );
  await drawer.getByRole('button', { name: 'Save', exact: true }).click();
  expect((await updated).ok()).toBe(true);
  mutationRegistry.rename(group, updatedName);

  const updatedRow = drawer.getByRole('row').filter({ hasText: updatedName });
  await expect(updatedRow).toBeVisible();

  const deleted = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/api/v2/core/groups/del',
  );
  await updatedRow
    .getByRole('button', { name: 'Delete', exact: true })
    .click();
  const confirmation = page.getByRole('dialog', { name: 'Delete' });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole('button', { name: 'Confirm', exact: true }).click();
  expect((await deleted).ok()).toBe(true);

  await mutationRegistry.confirmDeleted(group);
  await expect(updatedRow).toHaveCount(0);
});
