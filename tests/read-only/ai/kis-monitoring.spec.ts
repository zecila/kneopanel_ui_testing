import type { Page } from '@playwright/test';

import { test, expect } from '../../fixtures/read-only-test';

const STATUS_PATH = '/api/v2/core/settings/kis/gateway/status';
const DASHBOARD_PATH = '/api/v2/core/settings/kis/monitoring/proxy/';

async function routeMonitoringStatus(
  page: Page,
  monitorStatus: string,
): Promise<void> {
  await page.route(`**${STATUS_PATH}`, async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      json: {
        code: 200,
        data: { services: { kis_monitor: monitorStatus } },
        message: '',
      },
      status: 200,
    });
  });
}

test.describe('KIS Monitoring compatibility [H,F,R,P,A]', () => {
  test('loads the live embedded dashboard URL when monitoring is available', async ({
    page,
  }) => {
    await page.goto('/ai/kis-monitoring');

    const dashboard = page.locator('iframe');
    await expect(dashboard).toBeVisible();
    const source = await dashboard.getAttribute('src');
    expect(source).not.toBeNull();
    const url = new URL(source as string);
    expect(url.pathname).toContain(DASHBOARD_PATH);
    expect(url.searchParams.get('orgId')).toBe('1');
    expect(url.searchParams.get('refresh')).toBe('10s');
    expect(url.searchParams.get('kiosk')).toBe('tv');
  });

  test('embeds a dashboard whose time range and refresh controls are usable', async ({
    page,
  }) => {
    await routeMonitoringStatus(page, 'running');
    await page.route(`**${DASHBOARD_PATH}**`, async (route) => {
      await route.fulfill({
        body: `<!doctype html>
          <label>Time range <select aria-label="Time range"><option>Last 1 hour</option><option>Last 6 hours</option></select></label>
          <label>Refresh <select aria-label="Refresh"><option>10s</option><option>30s</option></select></label>
          <section aria-label="Gateway request rate">Gateway request rate</section>
          <section aria-label="Provider CPU and memory">Provider CPU and memory</section>`,
        contentType: 'text/html',
        status: 200,
      });
    });

    await page.goto('/ai/kis-monitoring');
    const dashboard = page.locator('iframe');
    await expect(dashboard).toBeVisible();
    const frame = page.frameLocator('iframe');
    await expect(frame.getByLabel('Gateway request rate')).toBeVisible();
    await expect(frame.getByLabel('Provider CPU and memory')).toBeVisible();
    await frame.getByLabel('Time range').selectOption({ label: 'Last 6 hours' });
    await frame.getByLabel('Refresh').selectOption({ label: '30s' });
    await expect(frame.getByLabel('Time range')).toHaveValue('Last 6 hours');
    await expect(frame.getByLabel('Refresh')).toHaveValue('30s');
  });

  test('explains that no dashboard is available when kis_monitor is stopped', async ({
    page,
  }) => {
    await routeMonitoringStatus(page, 'stopped');
    await page.goto('/ai/kis-monitoring');

    await expect(page.locator('iframe')).toHaveCount(0);
    await expect(
      page.getByText(/No nodes with running kis_monitor service were found/),
    ).toBeVisible();
  });

  test('re-evaluates service availability after reload', async ({ page }) => {
    let monitorStatus = 'stopped';
    await page.route(`**${STATUS_PATH}`, async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        json: {
          code: 200,
          data: { services: { kis_monitor: monitorStatus } },
          message: '',
        },
        status: 200,
      });
    });
    await page.route(`**${DASHBOARD_PATH}**`, async (route) => {
      await route.fulfill({ body: '<p>Recovered dashboard</p>', status: 200 });
    });

    await page.goto('/ai/kis-monitoring');
    await expect(page.locator('iframe')).toHaveCount(0);

    monitorStatus = 'running';
    await page.reload();
    await expect(page.locator('iframe')).toBeVisible();
    await expect(
      page.frameLocator('iframe').getByText('Recovered dashboard'),
    ).toBeVisible();
  });
});
