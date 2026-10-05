import { test, expect } from '../../fixtures/mutating-test';
import {
  createGroupThroughUi,
  createShellCronJobThroughUi,
  visibleDrawer,
} from '../../helpers/cron-ui';
import { uniqueResourceName } from '../../helpers/mutation-safety';

test('preserves a valid job assignment when deleting an in-use group', async ({
  mutationRegistry,
  page,
}) => {
  test.info().annotations.push({
    type: 'bug-report',
    description:
      'docs/bugs/2026-09-16/verified-ui-bugs-9-16-2026.md#20-deleting-an-in-use-cron-group-leaves-its-jobs-unassigned',
  });

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
  const confirmation = page.getByRole('dialog', { name: 'Delete' });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole('button', { name: 'Confirm', exact: true }).click();
  const deletionResponse = await deletionAttempt;
  expect(deletionResponse.ok()).toBe(true);

  await page.goto('/cronjobs/cronjob');
  jobRow = page.getByRole('row').filter({ hasText: jobName });
  await expect(jobRow).toBeVisible();
  const jobText = await jobRow.innerText();

  await page.getByRole('button', { name: 'Group', exact: true }).click();
  const refreshedGroupRow = visibleDrawer(page)
    .getByRole('row')
    .filter({ hasText: groupName });
  const groupStillExists = await refreshedGroupRow.isVisible().catch(() => false);
  const deletionWasBlocked = groupStillExists && jobText.includes(groupName);
  const jobWasReassigned = !groupStillExists && jobText.includes('Default');
  const resultIsConsistent = deletionWasBlocked || jobWasReassigned;

  test.fail(
    !resultIsConsistent,
    'Known defect: deleting an in-use cron group leaves its jobs unassigned.',
  );
  expect(resultIsConsistent).toBe(true);
});
