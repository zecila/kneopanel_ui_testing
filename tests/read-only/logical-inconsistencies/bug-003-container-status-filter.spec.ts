import { test, expect } from '../../fixtures/read-only-test';

test('applies a new container status on the first click after typing search', async ({
  page,
}) => {
  test.info().annotations.push({
    type: 'bug-report',
    description: 'docs/bugs/verified-ui-bugs-9-14-2026.md#3',
  });

  await page.goto('/containers/dashboard');
  const setupRequired = await page
    .getByRole('button', { name: 'Go to Settings', exact: true })
    .waitFor({ state: 'visible', timeout: 5_000 })
    .then(() => true)
    .catch(() => false);
  test.skip(
    setupRequired,
    'The configured test environment does not currently have a container runtime.',
  );

  await page.goto('/containers/container');
  await page.getByText('Running', { exact: true }).click();
  const search = page.getByPlaceholder('Search');
  await search.fill('kneo-e2e-no-container');
  await page.getByText('All', { exact: true }).click();

  await expect(page.getByRole('radio', { name: 'All', exact: true })).toBeChecked();
});
