import { test, expect } from '../../../fixtures/read-only-test';

test('displays mounted disk information', async ({ page }) => {
  await page.goto('/hosts/disk');

  for (const column of [
    'PartitionName',
    'Size',
    'Used',
    'Available',
    'Utilization',
    'Mount Directory',
    'Filesystem',
  ]) {
    await expect(
      page.getByRole('columnheader', { name: column, exact: true }),
    ).toBeVisible();
  }
});
