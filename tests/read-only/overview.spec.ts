import { test, expect } from '../fixtures/read-only-test';

test.describe('Overview', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('displays the main dashboard sections', async ({ page }) => {
    await expect(page).toHaveTitle('KneoPanel');
    await expect(page.getByText('Status', { exact: true })).toBeVisible();
    await expect(page.getByText('Monitoring', { exact: true })).toBeVisible();
    await expect(
      page.getByText('System information', { exact: true }),
    ).toBeVisible();
  });

  test('displays the main system status categories', async ({ page }) => {
    await expect(page.getByText('Load', { exact: true })).toBeVisible();
    await expect(page.getByText('CPU', { exact: true })).toBeVisible();
    await expect(page.getByText('Memory', { exact: true })).toBeVisible();
  });

  test('displays the KIS summary categories', async ({ page }) => {
    await expect(page.getByText('KIS Gateway', { exact: true })).toBeVisible();
    await expect(page.getByText('Local Provider', { exact: true })).toBeVisible();
    await expect(page.getByText('Total Providers', { exact: true })).toBeVisible();
    await expect(page.getByText('Total Models', { exact: true })).toBeVisible();
  });

  test('displays the system information fields', async ({ page }) => {
    for (const label of [
      'Hostname',
      'Operating system',
      'Kernel',
      'Architecture',
      'Local IP',
      'Uptime',
      'Up since',
    ]) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }
  });

  test('shows Network monitoring by default', async ({ page }) => {
    const networkRadioButton = page.getByRole('radio', {
      name: 'Network',
      exact: true,
    });

    await expect(networkRadioButton).toBeChecked();
    await expect(page.getByText(/^Up:/)).toBeVisible();
    await expect(page.getByText(/^Down:/)).toBeVisible();
    await expect(page.getByText(/^Total sent:/)).toBeVisible();
    await expect(page.getByText(/^Total received:/)).toBeVisible();
  });

  test('switches between Disk I/O and Network monitoring', async ({ page }) => {
    const diskIORadioButton = page.getByRole('radio', {
      name: 'Disk I/O',
      exact: true,
    });
    const networkRadioButton = page.getByRole('radio', {
      name: 'Network',
      exact: true,
    });

    await diskIORadioButton.click();
    await expect(diskIORadioButton).toBeChecked();
    await expect(page.getByText(/^Read:/)).toBeVisible();
    await expect(page.getByText(/^Write:/)).toBeVisible();
    await expect(page.getByText(/^I\/O operations:/)).toBeVisible();
    await expect(page.getByText(/^I\/O latency:/)).toBeVisible();

    await networkRadioButton.click();
    await expect(networkRadioButton).toBeChecked();
    await expect(page.getByText(/^Up:/)).toBeVisible();
  });

  test('remains authenticated after refreshing', async ({ page }) => {
    await page.reload();

    await expect(page.getByText('Status', { exact: true })).toBeVisible();
    await expect(page.getByPlaceholder('Password')).toHaveCount(0);
  });
});

