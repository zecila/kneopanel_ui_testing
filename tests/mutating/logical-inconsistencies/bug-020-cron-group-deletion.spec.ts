import { test, expect } from '../../fixtures/mutating-test';
import {
  createGroupThroughUi,
  createShellCronJobThroughUi,
  visibleDrawer,
} from '../../helpers/cron-ui';
import { uniqueResourceName } from '../../helpers/mutation-safety';

test('prevents deletion of a cron group assigned to a job', async ({
  mutationRegistry,
  page,
}) => {
  test.info().annotations.push({
    type: 'bug-report',
    description: 'docs/bugs/verified-ui-bugs-9-16-2026.md#20',
  });
  test.fail(
    true,
    'Known defect: KneoPanel currently deletes cron groups that are still in use.',
  );

  const groupName = uniqueResourceName('bug-020-group');
  const jobName = uniqueResourceName('bug-020-job');

  await createGroupThroughUi(
    page,
    mutationRegistry,
    'cron-group',
    groupName,
  );
  await createShellCronJobThroughUi(
    page,
    mutationRegistry,
    jobName,
    groupName,
  );

  let jobRow = page.getByRole('row').filter({ hasText: jobName });
  await expect(jobRow).toContainText(groupName);

  await page.getByRole('button', { name: 'Group', exact: true }).click();
  const drawer = visibleDrawer(page);
  const groupRow = drawer.getByRole('row').filter({ hasText: groupName });
  const deletionAttempt = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/api/v2/core/groups/del',
  );
  await groupRow
    .getByRole('button', { name: 'Delete', exact: true })
    .click();
  await deletionAttempt;

  await expect(groupRow).toBeVisible();

  await page.goto('/cronjobs/cronjob');
  jobRow = page.getByRole('row').filter({ hasText: jobName });
  await expect(jobRow).toContainText(groupName);
});
