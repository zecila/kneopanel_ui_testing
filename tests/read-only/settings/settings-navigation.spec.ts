import { test, expect } from '../../fixtures/read-only-test';

// open Settings sidebar
test.describe('Settings', () => {
  test('opens the Panel settings page from the sidebar', async ({ page }) => {
    // Arrange: begin on the authenticated Overview page.
    await page.goto('/');

    // Act: navigate the same way a user does.
    const settingsMenuItem = page.getByRole('menuitem', {
      name: 'Settings',
      exact: true,
    });
    await expect(settingsMenuItem).toBeVisible();
    await settingsMenuItem.click();

    // Assert: verify both the destination and content unique to Panel settings.
    await expect(page).toHaveURL(/\/settings\/panel(?:[/?#]|$)/);
    await expect(page.getByText('Panel user', { exact: true })).toBeVisible();
  });
});

// open Settings -> Security
test.describe('Security', () => {
  test('opens the Security settings from the Settings page', async ({ page }) => {
    await page.goto('/');

    const settingsMenuItem = page.getByRole('menuitem', {
      name: 'Settings',
      exact: true,
    });
    await expect(settingsMenuItem).toBeVisible();
    await settingsMenuItem.click();

    const securityRadioButton = page.getByRole('radio', {
      name: 'Security',
      exact: true,
    });
    await expect(securityRadioButton).toBeVisible();
    await securityRadioButton.click();

    await expect(page).toHaveURL(/\/settings\/safe(?:[/?#]|$)/);
    await expect(page.getByText('Panel port', { exact: true })).toBeVisible();
  });
});

// open Settings -> Alert Notification
test.describe('Alert Notification', () => {
  test('opens the Alert Notification settings from the Settings page', async ({ page }) => {
    await page.goto('/');

    const settingsMenuItem = page.getByRole('menuitem', {
      name: 'Settings',
      exact: true,
    });
    await expect(settingsMenuItem).toBeVisible();
    await settingsMenuItem.click();

    const alertNotificationRadioButton = page.getByRole('radio', {
      name: 'Alert Notification',
      exact: true,
    });
    await expect(alertNotificationRadioButton).toBeVisible();
    await alertNotificationRadioButton.click();

    await expect(page).toHaveURL(/\/settings\/alert(?:[/?#]|$)/);
    await expect(page.getByText('Alert List', { exact: true })).toBeVisible();
  });
});

// open Settings -> Backup accounts
test.describe('Backup accounts', () => {
  test('opens the Backup accounts settings from the Settings page', async ({ page }) => {
    await page.goto('/');

    const settingsMenuItem = page.getByRole('menuitem', {
      name: 'Settings',
      exact: true,
    });
    await expect(settingsMenuItem).toBeVisible();
    await settingsMenuItem.click();

    const backupAccountsRadioButton = page.getByRole('radio', {
      name: 'Backup accounts',
      exact: true,
    });
    await expect(backupAccountsRadioButton).toBeVisible();
    await backupAccountsRadioButton.click();

    await expect(page).toHaveURL(/\/settings\/backupaccount(?:[/?#]|$)/);
    await expect(
      page.getByRole('button', { name: 'Add', exact: true }),
    ).toBeVisible();
  });
});

// open Settings -> Snapshots
test.describe('Snapshots', () => {
  test('opens the Snapshots settings from the Settings page', async ({ page }) => {
    await page.goto('/');

    const settingsMenuItem = page.getByRole('menuitem', {
      name: 'Settings',
      exact: true,
    });
    await expect(settingsMenuItem).toBeVisible();
    await settingsMenuItem.click();

    const snapshotsRadioButton = page.getByRole('radio', {
      name: 'Snapshots',
      exact: true,
    });
    await expect(snapshotsRadioButton).toBeVisible();
    await snapshotsRadioButton.click();

    await expect(page).toHaveURL(/\/settings\/snapshot(?:[/?#]|$)/);
    await expect(page.getByText('Create', { exact: true })).toBeVisible();
  });
});

// open Settings -> About
test.describe('About', () => {
  test('opens the About page from the Settings page', async ({ page }) => {
    await page.goto('/');

    const settingsMenuItem = page.getByRole('menuitem', {
      name: 'Settings',
      exact: true,
    });
    await expect(settingsMenuItem).toBeVisible();
    await settingsMenuItem.click();

    const aboutRadioButton = page.getByRole('radio', {
      name: 'About',
      exact: true,
    });
    await expect(aboutRadioButton).toBeVisible();
    await aboutRadioButton.click();

    await expect(page).toHaveURL(/\/settings\/about(?:[/?#]|$)/);
    await expect(page.getByText('Linux Server Panel', { exact: true })).toBeVisible();
  });
});
