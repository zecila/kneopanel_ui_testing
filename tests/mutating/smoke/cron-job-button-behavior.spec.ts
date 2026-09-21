import { test, expect } from '../../fixtures/mutating-test';
import { createShellCronJobThroughUi } from '../../helpers/cron-ui';
import { uniqueResourceName } from '../../helpers/mutation-safety';

test('cancels cron edits and deletion before confirming deletion', async ({
  mutationRegistry,
  page,
}) => {
  const jobName = uniqueResourceName('cron-buttons');
  const job = await createShellCronJobThroughUi(
    page,
    mutationRegistry,
    jobName,
  );

  let row = page.getByRole('row').filter({ hasText: jobName });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'More', exact: true }).last().click();
  await page.getByRole('menuitem', { name: 'Edit', exact: true }).click();

  const editor = page.locator('[contenteditable="true"]');
  await expect(editor).toContainText('/bin/true');
  await editor.fill(`/bin/true\n# should be canceled ${jobName}`);
  await page.getByRole('button', { name: 'Back', exact: true }).last().click();

  row = page.getByRole('row').filter({ hasText: jobName });
  await row.getByRole('button', { name: 'More', exact: true }).last().click();
  await page.getByRole('menuitem', { name: 'Edit', exact: true }).click();
  await expect(page.locator('[contenteditable="true"]')).toHaveText('/bin/true');
  await page.getByRole('button', { name: 'Back', exact: true }).last().click();

  row = page.getByRole('row').filter({ hasText: jobName });
  await row.getByRole('button', { name: 'More', exact: true }).last().click();
  await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(row).toBeVisible();

  const deleted = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/api/v2/cronjobs/del',
  );
  await row.getByRole('button', { name: 'More', exact: true }).last().click();
  await page.getByRole('menuitem', { name: 'Delete', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  expect((await deleted).ok()).toBe(true);

  await mutationRegistry.confirmDeleted(job);
  await expect(row).toHaveCount(0);
});
