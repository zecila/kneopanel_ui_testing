import { test, expect } from '../../../fixtures/read-only-test';

test('opens the Panel user settings dialog', async ({ page }) => {
  await page.goto('/settings/panel');

  await page
    .getByRole('button', { name: 'Settings', exact: true })
    .first()
    .click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Panel user', { exact: true }).first()).toBeVisible();

  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
});
