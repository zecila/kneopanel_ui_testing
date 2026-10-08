import type { Locator, Page, Response } from '@playwright/test';

import { test, expect } from '../../fixtures/read-only-test';

interface ApiEnvelope<T> {
  code: number;
  data: T;
  message: string;
}

interface HostEntry {
  host: string;
  ip: string;
}

interface SwapEntry {
  isNew: boolean;
  path: string;
  size: number;
  taskID: string;
  used: string;
}

interface ToolboxBase {
  dns: string[];
  hostname: string;
  hosts: HostEntry[];
  localTime: string;
  maxSize: number;
  ntp: string;
  swapDetails: SwapEntry[];
  swapMemoryAvailable: number;
  swapMemoryTotal: number;
  swapMemoryUsed: number;
  timeZone: string;
  user: string;
}

const BASE_PATH = '/api/v2/toolbox/device/base';

const SAFE_BASE: ToolboxBase = {
  dns: ['192.0.2.53', '192.0.2.54'],
  hostname: 'kneo-e2e-host',
  hosts: [
    { host: 'alpha.kneo-e2e.invalid', ip: '192.0.2.41' },
    { host: 'beta.kneo-e2e.invalid', ip: '192.0.2.42' },
  ],
  localTime: '2026-10-07 18:00:00',
  maxSize: 10 * 1024 ** 3,
  ntp: 'ntp.kneo-e2e.invalid',
  swapDetails: [
    {
      isNew: false,
      path: '/tmp/kneo-e2e.swap',
      size: 512 * 1024 ** 2,
      taskID: '',
      used: '25%',
    },
  ],
  swapMemoryAvailable: 1.5 * 1024 ** 3,
  swapMemoryTotal: 2 * 1024 ** 3,
  swapMemoryUsed: 512 * 1024 ** 2,
  timeZone: 'UTC',
  user: 'kneo-e2e-user',
};

function baseResponse(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === BASE_PATH,
  );
}

async function readBase(response: Response): Promise<ToolboxBase> {
  expect(response.ok()).toBe(true);
  const envelope = (await response.json()) as ApiEnvelope<ToolboxBase>;
  expect(envelope.code, envelope.message).toBe(200);
  return envelope.data;
}

function settingRow(page: Page, label: string): Locator {
  return page
    .getByText(label, { exact: true })
    .first()
    .locator('xpath=ancestor::div[contains(@class, "el-form-item")][1]');
}

async function routeBase(page: Page, data: ToolboxBase): Promise<void> {
  await page.route(`**${BASE_PATH}`, (route) =>
    route.fulfill({
      json: { code: 200, data, message: '' },
    }),
  );
}

async function expectDialogValue(dialog: Locator, value: string): Promise<void> {
  const text = await dialog.innerText();
  const formValues = await dialog.locator('input, textarea').evaluateAll((controls) =>
    controls.map((control) => (control as HTMLInputElement).value),
  );
  expect(
    text.includes(value) || formValues.some((formValue) => formValue.includes(value)),
    `Expected the dialog to map the synthetic value ${value}.`,
  ).toBe(true);
}

test.describe('Toolbox > Quick settings overview [H,V,F,R,P,C,A]', () => {
  test('maps the live base contract and scalar fields without exposing values', async ({
    page,
  }) => {
    let pending = baseResponse(page);
    await page.goto('/toolbox/device');
    const data = await readBase(await pending);
    expect(Object.keys(data).sort()).toEqual(Object.keys(SAFE_BASE).sort());
    expect(Array.isArray(data.dns)).toBe(true);
    expect(Array.isArray(data.hosts)).toBe(true);
    expect(Array.isArray(data.swapDetails)).toBe(true);
    if (data.hosts.length > 0) {
      expect(Object.keys(data.hosts[0]).sort()).toEqual(['host', 'ip']);
    }
    if (data.swapDetails.length > 0) {
      expect(Object.keys(data.swapDetails[0]).sort()).toEqual(
        ['isNew', 'path', 'size', 'taskID', 'used'].sort(),
      );
    }
    for (const [label, value] of [
      ['Hostname', data.hostname],
      ['NTP server', data.ntp],
      ['System time zone', data.timeZone],
      ['Server time', data.localTime],
    ] as const) {
      await expect(settingRow(page, label).locator('input')).toHaveValue(value);
    }
    await expect(settingRow(page, 'System password').locator('input')).toHaveValue(
      '******',
    );

    pending = baseResponse(page);
    await page.reload();
    await readBase(await pending);
    await expect(page.getByText('Quick settings', { exact: true })).toBeVisible();
  });

  test('renders deterministic values and cancels every settings dialog', async ({
    page,
  }) => {
    await routeBase(page, SAFE_BASE);
    await page.goto('/toolbox/device');
    for (const [label, value] of [
      ['Swap', '2 GB'],
      ['Hostname', SAFE_BASE.hostname],
      ['NTP server', SAFE_BASE.ntp],
      ['System time zone', SAFE_BASE.timeZone],
      ['Server time', SAFE_BASE.localTime],
    ] as const) {
      await expect(settingRow(page, label).locator('input')).toHaveValue(value);
    }

    const cases = [
      { label: 'DNS', title: 'DNS', values: SAFE_BASE.dns },
      {
        label: 'Hosts',
        title: 'Hosts',
        values: [SAFE_BASE.hosts[0].ip, SAFE_BASE.hosts[0].host],
      },
      {
        label: 'Swap',
        title: 'Swap',
        values: [SAFE_BASE.swapDetails[0].path, 'Swap Total', 'Swap Used'],
      },
      { label: 'Hostname', title: 'Hostname', values: [SAFE_BASE.hostname] },
      {
        label: 'System password',
        title: 'Change Password',
        values: [SAFE_BASE.user],
      },
      { label: 'NTP server', title: 'NTP server', values: [SAFE_BASE.ntp] },
      {
        label: 'System time zone',
        title: 'System time zone',
        values: [SAFE_BASE.timeZone],
      },
    ];
    for (const entry of cases) {
      await settingRow(page, entry.label)
        .getByRole('button', { name: 'Settings', exact: true })
        .click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText(entry.title);
      for (const value of entry.values) {
        await expectDialogValue(dialog, value);
      }
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
      await expect(dialog).toBeHidden();
    }
  });

  test('validates an empty hostname without submitting', async ({ page }) => {
    await routeBase(page, SAFE_BASE);
    await page.goto('/toolbox/device');
    await settingRow(page, 'Hostname')
      .getByRole('button', { name: 'Settings', exact: true })
      .click();
    const dialog = page.getByRole('dialog');
    const hostname = dialog.getByRole('textbox');
    await expect(hostname).toHaveValue(SAFE_BASE.hostname);
    await hostname.fill('');
    await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(dialog.locator('.el-form-item__error')).toBeVisible();
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  });

  test('cancels panel and server restart confirmations without sending an action', async ({
    page,
  }) => {
    await routeBase(page, SAFE_BASE);
    await page.goto('/toolbox/device');
    for (const name of ['Restart panel', 'Restart server']) {
      await page.getByRole('button', { name, exact: true }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText("To confirm, type: 'Restart now'");
      await expect(
        dialog.getByRole('button', { name: 'Confirm', exact: true }),
      ).toBeDisabled();
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
      await expect(dialog).toBeHidden();
    }
  });

  test('shows base retrieval failure feedback and recovers on reload', async ({
    page,
  }) => {
    let unavailable = true;
    let attempts = 0;
    await page.route(`**${BASE_PATH}`, (route) => {
      attempts += 1;
      return route.fulfill({
        json: unavailable
          ? { code: 500, data: null, message: 'kneo-e2e toolbox unavailable' }
          : { code: 200, data: SAFE_BASE, message: '' },
      });
    });

    await page.goto('/toolbox/device');
    await expect(
      page.getByRole('alert').filter({ hasText: 'kneo-e2e toolbox unavailable' }),
    ).toBeVisible();

    unavailable = false;
    const pending = baseResponse(page);
    await page.reload();
    await readBase(await pending);
    await expect(settingRow(page, 'Hostname').locator('input')).toHaveValue(
      SAFE_BASE.hostname,
    );
    expect(attempts).toBe(2);
  });
});
