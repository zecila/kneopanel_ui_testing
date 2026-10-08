import type { Page, Response } from '@playwright/test';

import { test, expect } from '../../fixtures/read-only-test';

interface ApiEnvelope<T> {
  code: number;
  data: T;
  message: string;
}

interface DashboardCurrent {
  cpuDetailedPercent: number[];
  cpuPercent: number[];
  cpuTotal: number;
  cpuUsed: number;
  cpuUsedPercent: number;
  diskData: unknown[];
  gpuData: unknown[];
  ioCount: number;
  ioReadBytes: number;
  ioReadTime: number;
  ioWriteBytes: number;
  ioWriteTime: number;
  load1: number;
  load15: number;
  load5: number;
  loadUsagePercent: number;
  memoryAvailable: number;
  memoryCache: number;
  memoryFree: number;
  memoryShard: number;
  memoryTotal: number;
  memoryUsed: number;
  memoryUsedPercent: number;
  netBytesRecv: number;
  netBytesSent: number;
  procs: number;
  shotTime: string;
  swapMemoryAvailable: number;
  swapMemoryTotal: number;
  swapMemoryUsed: number;
  swapMemoryUsedPercent: number;
  timeSinceUptime: string;
  topCPUItems: unknown[] | null;
  topMemItems: unknown[] | null;
  uptime: number;
  xpuData: unknown[] | null;
}

const CURRENT_PATH = '/api/v2/dashboard/current/all/all';

const SAFE_CURRENT: DashboardCurrent = {
  cpuDetailedPercent: [10, 2, 3, 4, 0, 0, 0, 81],
  cpuPercent: [19],
  cpuTotal: 100,
  cpuUsed: 19,
  cpuUsedPercent: 19,
  diskData: [],
  gpuData: [],
  ioCount: 20,
  ioReadBytes: 10 * 1024 * 1024,
  ioReadTime: 1_000,
  ioWriteBytes: 20 * 1024 * 1024,
  ioWriteTime: 1_000,
  load1: 0.1,
  load15: 0.3,
  load5: 0.2,
  loadUsagePercent: 10,
  memoryAvailable: 6 * 1024 ** 3,
  memoryCache: 1024 ** 3,
  memoryFree: 5 * 1024 ** 3,
  memoryShard: 0,
  memoryTotal: 8 * 1024 ** 3,
  memoryUsed: 2 * 1024 ** 3,
  memoryUsedPercent: 25,
  netBytesRecv: 8 * 1024,
  netBytesSent: 4 * 1024,
  procs: 42,
  shotTime: '2026-10-07T18:00:01Z',
  swapMemoryAvailable: 2 * 1024 ** 3,
  swapMemoryTotal: 2 * 1024 ** 3,
  swapMemoryUsed: 0,
  swapMemoryUsedPercent: 0,
  timeSinceUptime: '1 day',
  topCPUItems: null,
  topMemItems: null,
  uptime: 86_400,
  xpuData: null,
};

function currentResponse(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === 'GET' &&
      new URL(response.url()).pathname === CURRENT_PATH,
  );
}

async function readCurrent(response: Response): Promise<DashboardCurrent> {
  expect(response.ok()).toBe(true);
  const envelope = (await response.json()) as ApiEnvelope<DashboardCurrent>;
  expect(envelope.code, envelope.message).toBe(200);
  return envelope.data;
}

async function routeCurrent(
  page: Page,
  readState: () => DashboardCurrent,
): Promise<void> {
  await page.route(`**${CURRENT_PATH}`, (route) =>
    route.fulfill({
      json: { code: 200, data: readState(), message: '' },
    }),
  );
}

test.describe('Overview network and disk monitoring [H,F,R,C,A]', () => {
  test('validates the live metric contract and refresh request without exposing values', async ({
    page,
  }) => {
    let pending = currentResponse(page);
    await page.goto('/');
    const current = await readCurrent(await pending);
    expect(Object.keys(current).sort()).toEqual(Object.keys(SAFE_CURRENT).sort());
    for (const key of [
      'ioCount',
      'ioReadBytes',
      'ioReadTime',
      'ioWriteBytes',
      'ioWriteTime',
      'netBytesRecv',
      'netBytesSent',
    ] as const) {
      expect(typeof current[key]).toBe('number');
    }

    await expect(page.getByRole('radio', { name: 'Network' })).toBeChecked();
    for (const label of [/^Up:/, /^Down:/, /^Total sent:/, /^Total received:/]) {
      await expect(page.getByText(label)).toBeVisible();
    }

    pending = currentResponse(page);
    await page.reload();
    await readCurrent(await pending);
    await expect(page.getByRole('radio', { name: 'Network' })).toBeChecked();
  });

  test('maps zero and later counter samples across Network and Disk I/O', async ({
    page,
  }) => {
    let state = { ...SAFE_CURRENT };
    await routeCurrent(page, () => state);
    await page.goto('/');

    await expect(page.getByText('Total sent: 4 KB', { exact: true })).toBeVisible();
    await expect(page.getByText('Total received: 8 KB', { exact: true })).toBeVisible();
    await expect(page.getByText('Up: 0 KB/s', { exact: true })).toBeVisible();
    await expect(page.getByText('Down: 0 KB/s', { exact: true })).toBeVisible();

    await page.getByText('Disk I/O', { exact: true }).click();
    await expect(page.getByRole('radio', { name: 'Disk I/O' })).toBeChecked();
    for (const text of [
      'Read: 0 MB',
      'Write: 0 MB',
      'I/O operations: 0 rqm/s',
      'I/O latency: 0 ms',
    ]) {
      await expect(page.getByText(text, { exact: true })).toBeVisible();
    }

    state = {
      ...state,
      ioCount: 40,
      ioReadBytes: 20 * 1024 * 1024,
      ioReadTime: 2_000,
      ioWriteBytes: 40 * 1024 * 1024,
      ioWriteTime: 2_000,
      netBytesRecv: 16 * 1024,
      netBytesSent: 8 * 1024,
      shotTime: '2026-10-07T18:00:02Z',
    };
    const polled = currentResponse(page);
    await readCurrent(await polled);

    await expect(page.getByText(/^Read:/)).not.toHaveText('Read: 0 MB');
    await expect(page.getByText(/^Write:/)).not.toHaveText('Write: 0 MB');
    await expect(page.getByText(/^I\/O operations:/)).not.toHaveText(
      'I/O operations: 0 rqm/s',
    );
    await expect(page.getByText(/^I\/O latency:/)).not.toHaveText(
      'I/O latency: 0 ms',
    );

    await page.getByText('Network', { exact: true }).click();
    await expect(page.getByText('Total sent: 8 KB', { exact: true })).toBeVisible();
    await expect(page.getByText('Total received: 16 KB', { exact: true })).toBeVisible();
    await expect(page.getByText(/^Up:/)).not.toHaveText('Up: 0 KB/s');
    await expect(page.getByText(/^Down:/)).not.toHaveText('Down: 0 KB/s');
  });

  test('shows retrieval failure feedback and recovers on reload', async ({ page }) => {
    let unavailable = true;
    let attempts = 0;
    await page.route(`**${CURRENT_PATH}`, (route) => {
      attempts += 1;
      return route.fulfill({
        json: unavailable
          ? { code: 500, data: null, message: 'kneo-e2e overview metrics unavailable' }
          : { code: 200, data: SAFE_CURRENT, message: '' },
      });
    });

    await page.goto('/');
    await expect(
      page.getByRole('alert').filter({
        hasText: 'kneo-e2e overview metrics unavailable',
      }),
    ).toBeVisible();

    unavailable = false;
    const retried = currentResponse(page);
    await page.reload();
    await readCurrent(await retried);
    await expect(page.getByText('Total sent: 4 KB', { exact: true })).toBeVisible();
    expect(attempts).toBe(2);
  });
});
