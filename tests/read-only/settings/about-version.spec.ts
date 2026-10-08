import type { Page, Request, Response } from '@playwright/test';

import { test, expect } from '../../fixtures/read-only-test';

interface ApiEnvelope<T> {
  code: number;
  data: T;
  message: string;
}

interface PanelSettings {
  systemVersion?: string;
}

interface KisVersion {
  version?: string;
}

const PANEL_SETTINGS_PATH = '/api/v2/core/settings/search';
const KIS_VERSION_PATH = '/api/v2/core/settings/kis/version';

function isRequest(request: Request, method: string, path: string): boolean {
  return request.method() === method && new URL(request.url()).pathname === path;
}

function waitForPanelSettings(page: Page): Promise<Response> {
  return page.waitForResponse((response) =>
    isRequest(response.request(), 'POST', PANEL_SETTINGS_PATH),
  );
}

function waitForKisVersion(page: Page): Promise<Response> {
  return page.waitForResponse((response) =>
    isRequest(response.request(), 'GET', KIS_VERSION_PATH),
  );
}

async function readEnvelope<T>(response: Response): Promise<T> {
  expect(response.ok()).toBe(true);
  const envelope = (await response.json()) as ApiEnvelope<T>;
  expect(envelope.code, envelope.message).toBe(200);
  return envelope.data;
}

async function routeVersions(
  page: Page,
  panelVersion: () => string,
  kisVersion: () => string,
): Promise<void> {
  await page.route(`**${PANEL_SETTINGS_PATH}`, async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      json: {
        code: 200,
        data: { systemVersion: panelVersion() },
        message: '',
      },
      status: 200,
    });
  });
  await page.route(`**${KIS_VERSION_PATH}`, async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      json: {
        code: 200,
        data: { version: kisVersion() },
        message: '',
      },
      status: 200,
    });
  });
}

test.describe('Settings > About version information [H,F,R,P,C,A]', () => {
  test(
    'maps live panel and KIS versions to the UI and reloads them',
    { tag: '@smoke' },
    async ({ page }) => {
      const apiPaths: string[] = [];
      page.on('request', (request) => {
        const path = new URL(request.url()).pathname;
        if (path.startsWith('/api/')) {
          apiPaths.push(path);
        }
      });

      const panelResponse = waitForPanelSettings(page);
      const kisResponse = waitForKisVersion(page);
      await page.goto('/settings/about');
      const panel = await readEnvelope<PanelSettings>(await panelResponse);
      const kis = await readEnvelope<KisVersion>(await kisResponse);

      expect(typeof panel.systemVersion).toBe('string');
      expect(panel.systemVersion?.trim()).not.toBe('');
      expect(typeof kis.version).toBe('string');
      expect(kis.version?.trim()).not.toBe('');
      expect((await panelResponse).request().postData()).toBeNull();
      expect((await panelResponse).request().headers()['currentnode']).toBe(
        'local',
      );

      await expect(page).toHaveURL(/\/settings\/about(?:[/?#]|$)/);
      await expect(
        page.getByText('Linux Server Panel', { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText(`KneoPanel Version: ${panel.systemVersion}`, {
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        page.getByText(`KIS Version: ${kis.version}`, { exact: true }),
      ).toBeVisible();
      await expect(page.getByText(/^Build: \S+$/, { exact: true })).toBeVisible();

      const reloadedPanelResponse = waitForPanelSettings(page);
      const reloadedKisResponse = waitForKisVersion(page);
      await page.reload();
      const reloadedPanel = await readEnvelope<PanelSettings>(
        await reloadedPanelResponse,
      );
      const reloadedKis = await readEnvelope<KisVersion>(
        await reloadedKisResponse,
      );
      expect(reloadedPanel.systemVersion).toBe(panel.systemVersion);
      expect(reloadedKis.version).toBe(kis.version);

      await expect(
        page.getByRole('button', {
          name: /(?:check for updates|update|upgrade)/i,
        }),
      ).toHaveCount(0);
      expect(
        apiPaths.filter((path) => /(?:update|upgrade)/i.test(path)),
      ).toEqual([]);
    },
  );

  test('renders deterministic versions and persists changed values after reload', async ({
    page,
  }) => {
    let panelVersion = '9.8.7-kneo-e2e';
    let kisVersion = '6.5.4-kneo-e2e';
    await routeVersions(page, () => panelVersion, () => kisVersion);

    await page.goto('/settings/about');
    await expect(
      page.getByText(`KneoPanel Version: ${panelVersion}`, { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(`KIS Version: ${kisVersion}`, { exact: true }),
    ).toBeVisible();

    panelVersion = '9.8.8-kneo-e2e';
    kisVersion = '6.5.5-kneo-e2e';
    await page.reload();
    await expect(
      page.getByText(`KneoPanel Version: ${panelVersion}`, { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(`KIS Version: ${kisVersion}`, { exact: true }),
    ).toBeVisible();
  });

  test('uses explicit placeholders when both version values are absent', async ({
    page,
  }) => {
    await routeVersions(page, () => '', () => '');
    await page.goto('/settings/about');

    await expect(
      page.getByText('KneoPanel Version: -', { exact: true }),
    ).toBeVisible();
    await expect(page.getByText('KIS Version: -', { exact: true })).toBeVisible();
    await expect(page.getByText(/^Build: \S+$/, { exact: true })).toBeVisible();
  });

  test('shows KIS-version failure and recovers on reload', async ({ page }) => {
    let unavailable = true;
    await page.route(`**${PANEL_SETTINGS_PATH}`, async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        json: {
          code: 200,
          data: { systemVersion: '9.8.7-kneo-e2e' },
          message: '',
        },
        status: 200,
      });
    });
    await page.route(`**${KIS_VERSION_PATH}`, async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        json: unavailable
          ? {
              code: 500,
              data: null,
              message: 'kneo-e2e KIS version unavailable',
            }
          : {
              code: 200,
              data: { version: '6.5.4-kneo-e2e' },
              message: '',
            },
        status: 200,
      });
    });

    await page.goto('/settings/about');
    await expect(
      page.getByText('kneo-e2e KIS version unavailable', { exact: true }).last(),
    ).toBeVisible();
    await expect(
      page.getByText('KneoPanel Version: 9.8.7-kneo-e2e', { exact: true }),
    ).toBeVisible();
    await expect(page.getByText('KIS Version: -', { exact: true })).toBeVisible();

    unavailable = false;
    const recoveredResponse = waitForKisVersion(page);
    await page.reload();
    await readEnvelope<KisVersion>(await recoveredResponse);
    await expect(
      page.getByText('KIS Version: 6.5.4-kneo-e2e', { exact: true }),
    ).toBeVisible();
  });

  test('returns to sign-in when KIS-version access is denied', async ({
    page,
  }) => {
    await page.route(`**${PANEL_SETTINGS_PATH}`, async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        json: {
          code: 200,
          data: { systemVersion: '9.8.7-kneo-e2e' },
          message: '',
        },
        status: 200,
      });
    });
    await page.route(`**${KIS_VERSION_PATH}`, async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        json: {
          code: 403,
          data: null,
          message: 'kneo-e2e KIS version permission denied',
        },
        status: 200,
      });
    });

    await page.goto('/settings/about');
    await expect(page.getByRole('textbox', { name: 'Username' })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Password' })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Sign in', exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Linux Server Panel', { exact: true })).toHaveCount(
      0,
    );
  });

  test('still retrieves KIS version when panel-version retrieval fails', async ({
    page,
  }) => {
    test.info().annotations.push({
      type: 'bug-report',
      description:
        'docs/bugs/2026-10-07/verified-ui-bugs-10-07-2026.md#37-panel-version-failure-suppresses-the-independent-kis-version',
    });

    let kisRequests = 0;
    await page.route(`**${PANEL_SETTINGS_PATH}`, async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        json: {
          code: 500,
          data: null,
          message: 'kneo-e2e panel version unavailable',
        },
        status: 200,
      });
    });
    await page.route(`**${KIS_VERSION_PATH}`, async (route) => {
      kisRequests += 1;
      await route.fulfill({
        contentType: 'application/json',
        json: {
          code: 200,
          data: { version: '6.5.4-kneo-e2e' },
          message: '',
        },
        status: 200,
      });
    });

    await page.goto('/settings/about');
    await expect(
      page.getByText('kneo-e2e panel version unavailable', { exact: true }).last(),
    ).toBeVisible();
    await expect(
      page.getByText('KneoPanel Version: -', { exact: true }),
    ).toBeVisible();
    await expect(page.getByText(/^Build: \S+$/, { exact: true })).toBeVisible();

    const kisRequestWasSuppressed = kisRequests === 0;
    test.fail(
      kisRequestWasSuppressed,
      'Known defect: a failed panel-version request prevents the independent KIS-version lookup.',
    );
    expect(kisRequests).toBeGreaterThan(0);
    await expect(
      page.getByText('KIS Version: 6.5.4-kneo-e2e', { exact: true }),
    ).toBeVisible();
  });
});
