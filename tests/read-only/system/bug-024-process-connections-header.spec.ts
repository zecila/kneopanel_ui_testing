import { test, expect } from '../../fixtures/read-only-test';

test('fits the Connections label and active sort indicator', async ({ page }) => {
  test.info().annotations.push({
    type: 'bug-report',
    description:
      'docs/bugs/2026-09-16/verified-ui-bugs-9-16-2026.md#24-processes-connections-header-clips-its-label-and-sort-indicator',
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/hosts/process/process');
  const header = page.getByRole('columnheader', {
    name: 'Connections',
    exact: true,
  });
  await expect(header).toBeVisible();
  await header.click();

  const dimensions = await header.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  const contentFits = dimensions.clientWidth >= dimensions.scrollWidth;
  test.fail(
    !contentFits,
    'Known defect: the Connections label and sort indicator are clipped.',
  );
  expect(contentFits).toBe(true);
});
