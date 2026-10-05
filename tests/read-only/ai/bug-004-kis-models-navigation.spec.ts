import { test, expect } from '../../fixtures/read-only-test';

test('opens KIS Models without an error notification blocking navigation', async ({
  page,
}) => {
  test.info().annotations.push({
    type: 'bug-report',
    description:
      'docs/bugs/2026-09-14/verified-ui-bugs-9-14-2026.md#4-kis-error-notification-obstructs-the-kis-models-tabs',
  });

  await page.goto('/');
  const aiMenu = page.getByRole('menuitem', { name: 'AI', exact: true });
  await expect(aiMenu).toBeVisible();
  await aiMenu.click();

  const kisModels = page.getByRole('menuitem', {
    name: 'KIS Models',
    exact: true,
  });
  await expect(kisModels).toBeVisible();
  await kisModels.click({ timeout: 5_000 }).catch(() => {});

  const navigated = await expect
    .poll(
      async () =>
        new URL(page.url()).pathname.includes('/ai/kis-models/') &&
        (await page
          .getByText('From Hugging Face', { exact: true })
          .isVisible()
          .catch(() => false)),
      { timeout: 10_000 },
    )
    .toBe(true)
    .then(() => true)
    .catch(() => false);
  test.fail(
    !navigated,
    'Known defect: the KIS error notification currently intercepts KIS Models navigation.',
  );

  expect(navigated).toBe(true);
});
