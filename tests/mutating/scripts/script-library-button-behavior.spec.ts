import { test, expect } from '../../fixtures/mutating-test';
import {
  createScriptThroughUi,
  openScriptLibrary,
  visibleDrawer,
} from '../../helpers/cron-ui';
import { uniqueResourceName } from '../../helpers/mutation-safety';

test('cancels script edits and deletion before confirming deletion', async ({
  mutationRegistry,
  page,
}) => {
  const scriptName = uniqueResourceName('script-buttons');
  const originalDescription = `Original description: ${scriptName}`;
  const script = await createScriptThroughUi(
    page,
    mutationRegistry,
    scriptName,
    { description: originalDescription },
  );

  let row = page.getByRole('row').filter({ hasText: scriptName });
  await expect(row).toContainText(originalDescription);
  await row.getByRole('button', { name: 'Edit', exact: true }).click();

  let drawer = visibleDrawer(page);
  await drawer
    .getByLabel('Description', { exact: true })
    .fill(`Canceled description: ${scriptName}`);
  await drawer.getByRole('button', { name: 'Cancel', exact: true }).click();

  row = page.getByRole('row').filter({ hasText: scriptName });
  await expect(row).toContainText(originalDescription);
  await row.getByRole('button', { name: 'Edit', exact: true }).click();
  drawer = visibleDrawer(page);
  await expect(
    drawer.getByLabel('Description', { exact: true }),
  ).toHaveValue(originalDescription);
  await drawer.getByRole('button', { name: 'Cancel', exact: true }).click();

  row = page.getByRole('row').filter({ hasText: scriptName });
  await row.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(row).toBeVisible();

  const deleted = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/api/v2/core/script/del',
  );
  await row.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  expect((await deleted).ok()).toBe(true);

  await mutationRegistry.confirmDeleted(script);
  await expect(row).toHaveCount(0);

  await openScriptLibrary(page);
  await expect(page.getByRole('row').filter({ hasText: scriptName })).toHaveCount(
    0,
  );
});
