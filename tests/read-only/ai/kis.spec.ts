import { test, expect } from '../../fixtures/read-only-test';

interface ApiEnvelope<T> {
  code: number;
  data: T;
  message: string;
}

interface ProviderPreflight {
  currentGatewayHost?: string;
  currentGatewayLocal?: boolean;
  currentGatewayUrl?: string;
  gatewayRunning: boolean;
  localTarget: boolean;
  providerRunning: boolean;
}

const PROVIDER_PREFLIGHT_PATH =
  '/api/v2/core/settings/kis/ssh/provider/preflight';

test.describe('KIS', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/ai/kis/nodes');
  });

  test('displays the provider node table', async ({ page }) => {
    for (const column of [
      'Node',
      'Last Provider Heartbeat',
      'Service Status',
      'Operation',
    ]) {
      await expect(
        page.getByRole('columnheader', { name: column, exact: true }),
      ).toBeVisible();
    }
  });

  test('displays node filtering controls', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Apply' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Refresh' })).toBeVisible();
  });

  test('Provider reapply preflight: opens and cancels confirmation without an internal server error', async ({
    page,
  }) => {
    test.info().annotations.push({
      type: 'pending-reproduction',
      description:
        'docs/bugs/2026-10-01/REVIEWER-TEST-REPORT.md#kis-internal-server-error',
    });

    const reapplyButton = page.getByRole('button', {
      name: 'Reapply',
      exact: true,
    });
    await expect(page.locator('.el-table__row').first()).toBeVisible();
    test.skip(
      (await reapplyButton.count()) === 0,
      'KIS did not report a Provider node with a Reapply action.',
    );

    const preflightResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === PROVIDER_PREFLIGHT_PATH,
    );
    await reapplyButton.first().click();

    const response = await preflightResponse;
    expect(response.ok()).toBe(true);
    const envelope = (await response.json()) as ApiEnvelope<ProviderPreflight>;
    expect(envelope.code, envelope.message).toBe(200);
    expect(typeof envelope.data.gatewayRunning).toBe('boolean');
    expect(typeof envelope.data.providerRunning).toBe('boolean');

    const confirmation = page
      .locator('.el-dialog:visible')
      .filter({ hasText: 'Confirm Provider Configuration' });
    await expect(confirmation).toBeVisible();
    await expect(confirmation).toContainText('Apply provider configuration');
    await expect(page.getByText(/internal server error/i)).toHaveCount(0);

    await confirmation
      .getByRole('button', { name: 'Cancel', exact: true })
      .click();
    await expect(confirmation).toBeHidden();
  });
});
