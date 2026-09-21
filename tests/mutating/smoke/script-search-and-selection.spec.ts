import { test, expect } from '../../fixtures/mutating-test';
import { createScriptThroughUi, openScriptLibrary } from '../../helpers/cron-ui';
import { uniqueResourceName } from '../../helpers/mutation-safety';

test('searches different scripts and enables bulk deletion after selection', async ({
  mutationRegistry,
  page,
}) => {
  const firstName = uniqueResourceName('script-search-a');
  const secondName = uniqueResourceName('script-search-b');
  await createScriptThroughUi(page, mutationRegistry, firstName);
  await createScriptThroughUi(page, mutationRegistry, secondName);
  await openScriptLibrary(page);

  const search = page.getByPlaceholder('Search');
  const searchFor = async (name: string) => {
    const response = page.waitForResponse(
      (candidate) =>
        candidate.request().method() === 'POST' &&
        new URL(candidate.url()).pathname === '/api/v2/core/script/search',
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

  const firstCheckbox = firstRow.getByRole('checkbox');
  await expect(
    page.getByRole('button', { name: 'Delete', exact: true }).first(),
  ).toBeDisabled();
  await firstRow.locator('.el-checkbox').click();
  await expect(firstCheckbox).toBeChecked();
  await expect(
    page.getByRole('button', { name: 'Delete', exact: true }).first(),
  ).toBeEnabled();

  await page.getByRole('button', { name: 'Delete', exact: true }).first().click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(firstRow).toBeVisible();
  await expect(secondRow).toBeVisible();
});
