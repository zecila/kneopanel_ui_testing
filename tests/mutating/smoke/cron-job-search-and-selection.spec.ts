import { test, expect } from '../../fixtures/mutating-test';
import { createShellCronJobThroughUi } from '../../helpers/cron-ui';
import { uniqueResourceName } from '../../helpers/mutation-safety';

test('searches different jobs and enables bulk actions only after selection', async ({
  mutationRegistry,
  page,
}) => {
  const firstName = uniqueResourceName('cron-search-a');
  const secondName = uniqueResourceName('cron-search-b');
  await createShellCronJobThroughUi(page, mutationRegistry, firstName);
  await createShellCronJobThroughUi(page, mutationRegistry, secondName);

  const search = page.getByPlaceholder('Search');
  const searchFor = async (name: string) => {
    const response = page.waitForResponse(
      (candidate) =>
        candidate.request().method() === 'POST' &&
        new URL(candidate.url()).pathname === '/api/v2/cronjobs/search',
    );
    await search.fill(name);
    await search.press('Enter');
    expect((await response).ok()).toBe(true);
  };

  await searchFor(firstName);
  await expect(page.getByRole('row').filter({ hasText: firstName })).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: secondName })).toHaveCount(
    0,
  );

  await searchFor(secondName);
  await expect(page.getByRole('row').filter({ hasText: secondName })).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: firstName })).toHaveCount(
    0,
  );

  await searchFor('');
  const firstRow = page.getByRole('row').filter({ hasText: firstName });
  const secondRow = page.getByRole('row').filter({ hasText: secondName });
  await expect(firstRow).toBeVisible();
  await expect(secondRow).toBeVisible();

  await expect(
    page.getByRole('button', { name: 'Delete', exact: true }),
  ).toBeDisabled();
  const firstCheckbox = firstRow.getByRole('checkbox');
  await firstRow.locator('.el-checkbox').click();
  await expect(firstCheckbox).toBeChecked();
  await expect(
    page.getByRole('button', { name: 'Delete', exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole('button', { name: 'Enable', exact: true }),
  ).toBeEnabled();

  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(firstRow).toBeVisible();
  await expect(secondRow).toBeVisible();

  await firstRow.locator('.el-checkbox').click();
  await expect(firstCheckbox).not.toBeChecked();
  await expect(
    page.getByRole('button', { name: 'Delete', exact: true }),
  ).toBeDisabled();
});
