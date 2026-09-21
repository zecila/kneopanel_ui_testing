import { test, expect } from '../../fixtures/read-only-test';

test('fits the Connections label and active sort indicator', async ({ page }) => {
  test.info().annotations.push({
    type: 'bug-report',
    description: 'docs/bugs/verified-ui-bugs-9-16-2026.md#24',
  });
  test.fail(
    true,
    'Known defect: the Connections label and sort indicator are clipped.',
  );

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
  expect(dimensions.clientWidth).toBeGreaterThanOrEqual(dimensions.scrollWidth);
});
