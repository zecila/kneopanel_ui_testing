import { test, expect } from '../../fixtures/mutating-test';
import {
  createGroupThroughUi,
  createShellCronJobThroughUi,
} from '../../helpers/cron-ui';
import { uniqueResourceName } from '../../helpers/mutation-safety';

test('creates, edits, assigns, and deletes a shell cron job', async ({
  mutationRegistry,
  page,
}) => {
  const groupName = uniqueResourceName('cron-group');
  const jobName = uniqueResourceName('cron-job');

  await createGroupThroughUi(
    page,
    mutationRegistry,
    'cron-group',
    groupName,
  );

  const job = await createShellCronJobThroughUi(
    page,
    mutationRegistry,
    jobName,
  );

  let row = page.getByRole('row').filter({ hasText: jobName });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'More', exact: true }).last().click();
  await page.getByRole('menuitem', { name: 'Edit', exact: true }).click();

  await page.getByLabel('Group', { exact: true }).click();
  await page.getByRole('option', { name: groupName, exact: true }).click();
  await page
    .locator('[contenteditable="true"]')
    .fill(`/bin/true\n# edited ${jobName}`);

  const updated = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/api/v2/cronjobs/update',
  );
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  expect((await updated).ok()).toBe(true);

  row = page.getByRole('row').filter({ hasText: jobName });
  await expect(row).toContainText(groupName);

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
