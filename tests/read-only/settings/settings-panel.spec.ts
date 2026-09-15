import { test, expect } from '../../fixtures/read-only-test';

test('opens the Change panel user dialog', async ({ page }) => {
  await page.goto('/settings/panel');

  await page.getByRole('button', {
    name: 'Change panel user',
  }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByText('Change panel user', { exact: true }),
  ).toBeVisible();

  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
});