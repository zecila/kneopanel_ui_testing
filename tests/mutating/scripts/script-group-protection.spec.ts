import { test, expect } from '../../fixtures/mutating-test';
import {
  createGroupThroughUi,
  createScriptThroughUi,
  openScriptLibrary,
  visibleDrawer,
} from '../../helpers/cron-ui';
import { uniqueResourceName } from '../../helpers/mutation-safety';

test('blocks deletion of an assigned script group until its script is removed', async ({
  mutationRegistry,
  page,
}) => {
  const groupName = uniqueResourceName('protected-script-group');
  const scriptName = uniqueResourceName('protected-script');
  const group = await createGroupThroughUi(
    page,
    mutationRegistry,
    'script-group',
    groupName,
  );
  const script = await createScriptThroughUi(
    page,
    mutationRegistry,
    scriptName,
    { groupName },
  );

  await page.getByRole('button', { name: 'Group', exact: true }).click();
  let drawer = visibleDrawer(page);
  let groupRow = drawer.getByRole('row').filter({ hasText: groupName });
  const rejectedDeletion = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/api/v2/core/groups/del',
  );
  await groupRow.getByRole('button', { name: 'Delete', exact: true }).click();
  const rejectedResponse = await rejectedDeletion;
  expect(rejectedResponse.ok()).toBe(true);
  await expect(groupRow).toBeVisible();
  await page.locator('.el-drawer__close-btn:visible').click();

  let scriptRow = page.getByRole('row').filter({ hasText: scriptName });
  const scriptDeleted = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/api/v2/core/script/del',
  );
  await scriptRow.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  expect((await scriptDeleted).ok()).toBe(true);
  await mutationRegistry.confirmDeleted(script);
  await expect(scriptRow).toHaveCount(0);

  await openScriptLibrary(page);
  await page.getByRole('button', { name: 'Group', exact: true }).click();
  drawer = visibleDrawer(page);
  groupRow = drawer.getByRole('row').filter({ hasText: groupName });
  const groupDeleted = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/api/v2/core/groups/del',
  );
  await groupRow.getByRole('button', { name: 'Delete', exact: true }).click();
  expect((await groupDeleted).ok()).toBe(true);
  await mutationRegistry.confirmDeleted(group);
  await expect(groupRow).toHaveCount(0);
});
