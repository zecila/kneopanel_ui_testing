import { test, expect } from '../../fixtures/read-only-test';

const PASSWORD_PATH = '/api/v2/core/settings/password/update';

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

test('validates password confirmation and reports a failed intercepted update', async ({
  page,
}) => {
  test.info().annotations.push({
    type: 'bug-report',
    description:
      'docs/bugs/2026-10-07/verified-ui-bugs-10-07-2026.md#37-the-change-password-dialog-intermittently-omits-the-new-password-field',
  });

  let updateRequests = 0;
  await page.route(`**${PASSWORD_PATH}`, async (route) => {
    updateRequests += 1;
    await route.fulfill({
      contentType: 'application/json',
      json: { code: 500, data: null, message: 'kneo-e2e password update rejected' },
      status: 200,
    });
  });
  await page.goto('/settings/panel');
  await page
    .locator('.el-form-item')
    .filter({ has: page.getByText('Panel password', { exact: true }) })
    .getByRole('button', { name: 'Settings', exact: true })
    .click();

  const dialog = page.getByRole('dialog').last();
  await expect(dialog.getByText('Change Password', { exact: true })).toBeVisible();
  const original = dialog.getByRole('textbox', {
    name: /Original password/,
  });
  const password = dialog.getByRole('textbox', {
    name: /New password/,
  });
  const confirmation = dialog.getByRole('textbox', {
    name: /Confirm password/,
  });
  const newPasswordFieldMissing = (await password.count()) === 0;
  test.fail(
    newPasswordFieldMissing,
    'Known defect: the Change Password dialog intermittently omits the New password field.',
  );
  expect(
    newPasswordFieldMissing,
    'Change Password must render a New password field.',
  ).toBe(false);

  await original.fill('KneoE2EOld!@123');
  await password.fill('KneoE2ENew!@123');
  await confirmation.fill('KneoE2EDifferent!@123');
  await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(
    dialog.getByText('Confirm password is inconsistent with the password.'),
  ).toBeVisible();
  expect(updateRequests).toBe(0);

  await confirmation.fill('KneoE2ENew!@123');
  await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByText('kneo-e2e password update rejected').last()).toBeVisible();
  expect(updateRequests).toBe(1);
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
});
