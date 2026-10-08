import type { Locator, Page, Response } from '@playwright/test';

import { test, expect } from '../../fixtures/read-only-test';

interface GpuProcess {
  pid: string;
  processName: string;
  type: string;
  usedMemory: string;
}

interface GpuDevice {
  busID: string;
  computeMode: string;
  displayActive: string;
  ecc: string;
  fanSpeed: string;
  gpuUtil: string;
  index: number;
  maxPowerLimit: string;
  memTotal: string;
  memUsed: string;
  migMode: string;
  performanceState: string;
  persistenceMode: string;
  powerDraw: string;
  processes: GpuProcess[];
  productName: string;
  temperature: string;
}

interface GpuStatus {
  cudaVersion: string;
  driverVersion: string;
  gpu: GpuDevice[];
  type: string;
}

interface ApiEnvelope<T> {
  code: number;
  data: T;
  message?: string;
}

const GPU_PATH = '/api/v2/ai/gpu/load';

const SAFE_STATUS: GpuStatus = {
  cudaVersion: '12.6',
  driverVersion: '560.00',
  gpu: [
    {
      busID: '0000:01:00.0',
      computeMode: 'Default',
      displayActive: 'Disabled',
      ecc: 'N/A',
      fanSpeed: '31 %',
      gpuUtil: '12 %',
      index: 0,
      maxPowerLimit: '300 W',
      memTotal: '8192 MiB',
      memUsed: '256 MiB',
      migMode: 'Disabled',
      performanceState: 'P2',
      persistenceMode: 'Enabled',
      powerDraw: '75 W',
      processes: [
        {
          pid: '4242',
          processName: 'kneo-e2e-safe-process',
          type: 'C',
          usedMemory: '128 MiB',
        },
      ],
      productName: 'kneo-e2e GPU Alpha',
      temperature: '44 C',
    },
    {
      busID: '0000:02:00.0',
      computeMode: 'Default',
      displayActive: 'Disabled',
      ecc: 'N/A',
      fanSpeed: '25 %',
      gpuUtil: '0 %',
      index: 1,
      maxPowerLimit: '300 W',
      memTotal: '16384 MiB',
      memUsed: '0 MiB',
      migMode: 'Disabled',
      performanceState: 'P8',
      persistenceMode: 'Enabled',
      powerDraw: '30 W',
      processes: [],
      productName: 'kneo-e2e GPU Beta',
      temperature: '35 C',
    },
  ],
  type: 'nvidia',
};

function toMiB(value: number, unit: string): number {
  return unit === 'GiB' ? value * 1024 : value;
}

function parseMemory(value: string): number {
  const match = value.trim().match(/^(\d+(?:\.\d+)?)\s*(MiB|GiB)$/);
  expect(match, `Expected a GPU memory value, received: ${value}`).not.toBeNull();
  return toMiB(Number(match?.[1]), match?.[2] ?? 'MiB');
}

function displayTemperature(value: string): string {
  return value.replace(/\s*C$/, ' °C');
}

function displayCapability(value: string): string {
  return value === 'N/A' ? 'Not Supported' : value;
}

function displayActive(value: string): string {
  return value === 'Enabled' || value === 'Yes' ? 'Yes' : 'No';
}

function displayProcessType(value: string): string {
  return value === 'C' ? 'Compute' : value === 'G' ? 'Graphics' : value;
}

function gpuResponse(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === 'GET' &&
      new URL(response.url()).pathname === GPU_PATH,
  );
}

async function readGpuStatus(response: Response): Promise<GpuStatus> {
  expect(response.ok()).toBe(true);
  const envelope = (await response.json()) as ApiEnvelope<GpuStatus>;
  expect(envelope.code, envelope.message).toBe(200);
  expect(Array.isArray(envelope.data.gpu)).toBe(true);
  return envelope.data;
}

async function openGpuMonitoring(page: Page): Promise<GpuStatus> {
  const pending = gpuResponse(page);
  await page.goto('/ai/gpu/current');
  return readGpuStatus(await pending);
}

async function expandGpu(item: Locator): Promise<void> {
  const content = item.locator('.el-collapse-item__wrap');
  if (!(await content.isVisible())) {
    await item.locator('.el-collapse-item__header').click();
  }
  await expect(content).toBeVisible();
}

async function routeGpuStatus(page: Page, status: GpuStatus): Promise<void> {
  await page.route(`**${GPU_PATH}`, async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      json: { code: 200, data: status, message: '' },
      status: 200,
    });
  });
}

test.describe('GPU Monitoring > Current metrics [H,F,R,P,C,A]', () => {
  test('maps live device and process cardinality without emitting process details', async ({
    page,
  }) => {
    const status = await openGpuMonitoring(page);
    const gpuItems = page.locator('.el-collapse-item');
    await expect(gpuItems).toHaveCount(status.gpu.length);

    for (const column of [
      'Driver Version',
      'CUDA Version',
      'GPU Utilization',
      'Temperature',
      'Memory Utilization',
    ]) {
      await expect(
        page.getByRole('columnheader', { name: column, exact: true }),
      ).toBeVisible();
    }

    const labels = await gpuItems
      .locator('.el-collapse-item__header')
      .allTextContents();
    const numbers = labels.map((label) => {
      const match = label.trim().match(/^(\d+)\.\s+\S/);
      expect(match, `Expected a numbered GPU label, received: ${label}`).not.toBeNull();
      return Number(match?.[1]);
    });

    expect(numbers.length).toBeGreaterThan(0);
    expect(numbers).toEqual(status.gpu.map((gpu) => gpu.index));
    expect(new Set(numbers).size).toBe(numbers.length);
    const pageText = (await page.locator('#app').innerText()).replace(/\s+/g, ' ');
    expect(pageText).toContain(status.driverVersion);
    expect(pageText).toContain(status.cudaVersion);

    for (let itemIndex = 0; itemIndex < status.gpu.length; itemIndex += 1) {
      const apiGpu = status.gpu[itemIndex];
      const item = gpuItems.nth(itemIndex);
      await expandGpu(item);
      const itemText = (await item.innerText()).replace(/\s+/g, ' ');
      for (const metric of [
        apiGpu.gpuUtil,
        displayTemperature(apiGpu.temperature),
        apiGpu.performanceState,
        apiGpu.powerDraw,
        apiGpu.maxPowerLimit,
        apiGpu.fanSpeed,
        apiGpu.busID,
        apiGpu.persistenceMode,
        displayActive(apiGpu.displayActive),
        displayCapability(apiGpu.ecc),
        apiGpu.computeMode,
        displayCapability(apiGpu.migMode),
      ]) {
        expect(itemText).toContain(metric);
      }

      const memoryHeader = item.getByRole('columnheader', {
        name: 'Memory Utilization',
        exact: true,
      });
      await expect(memoryHeader).toBeVisible();

      const basicInfoTable = memoryHeader.locator('xpath=ancestor::table[1]');
      const headers = basicInfoTable.getByRole('columnheader');
      const memoryColumn = (await headers.allTextContents()).findIndex(
        (header) => header.trim() === 'Memory Utilization',
      );
      expect(memoryColumn).toBeGreaterThanOrEqual(0);

      const valueRow = basicInfoTable.getByRole('row').nth(1);
      const memoryCell = valueRow.getByRole('cell').nth(memoryColumn);
      const memoryPattern =
        /(\d+(?:\.\d+)?)\s*(MiB|GiB)\s*\/\s*(\d+(?:\.\d+)?)\s*(MiB|GiB)/;
      await expect(
        memoryCell,
        `GPU ${apiGpu.index} should report used and total VRAM`,
      ).toHaveText(memoryPattern);
      const match = (await memoryCell.innerText()).match(memoryPattern);
      expect(
        match,
        `GPU ${apiGpu.index} should report used and total VRAM`,
      ).not.toBeNull();

      const used = toMiB(Number(match?.[1]), match?.[2] ?? 'MiB');
      const total = toMiB(Number(match?.[3]), match?.[4] ?? 'MiB');
      expect(used).toBeGreaterThanOrEqual(0);
      expect(total).toBeGreaterThan(0);
      expect(used).toBeLessThanOrEqual(total);

      expect(used).toBeCloseTo(parseMemory(apiGpu.memUsed), 0);
      expect(total).toBeCloseTo(parseMemory(apiGpu.memTotal), 0);

      const processTable = item.locator('.el-table').filter({ hasText: 'PID' });
      await expect(
        processTable.locator('.el-table__body-wrapper .el-table__row'),
      ).toHaveCount(
        apiGpu.processes.length,
      );
    }
  });

  test('renders every synthetic metric and process for multiple GPUs', async ({
    page,
  }) => {
    await routeGpuStatus(page, SAFE_STATUS);
    await openGpuMonitoring(page);
    const pageText = (await page.locator('#app').innerText()).replace(/\s+/g, ' ');
    expect(pageText).toContain(SAFE_STATUS.driverVersion);
    expect(pageText).toContain(SAFE_STATUS.cudaVersion);
    const gpuItems = page.locator('.el-collapse-item');
    await expect(gpuItems).toHaveCount(SAFE_STATUS.gpu.length);

    for (let index = 0; index < SAFE_STATUS.gpu.length; index += 1) {
      const item = gpuItems.nth(index);
      const gpu = SAFE_STATUS.gpu[index];
      await expandGpu(item);
      await expect(item.locator('.el-collapse-item__header')).toContainText(
        `${gpu.index}. ${gpu.productName}`,
      );
      const itemText = (await item.innerText()).replace(/\s+/g, ' ');
      for (const value of [
        gpu.gpuUtil,
        displayTemperature(gpu.temperature),
        gpu.performanceState,
        gpu.powerDraw,
        gpu.maxPowerLimit,
        gpu.memUsed,
        gpu.memTotal,
        gpu.fanSpeed,
        gpu.busID,
        gpu.persistenceMode,
        displayActive(gpu.displayActive),
        displayCapability(gpu.ecc),
        gpu.computeMode,
        displayCapability(gpu.migMode),
      ]) {
        expect(itemText).toContain(value);
      }
      for (const process of gpu.processes) {
        for (const value of [
          process.pid,
          displayProcessType(process.type),
          process.processName,
          process.usedMemory,
        ]) {
          expect(itemText).toContain(value);
        }
      }
    }
  });

  test('renders a successful empty inventory', async ({ page }) => {
    await routeGpuStatus(page, { ...SAFE_STATUS, gpu: [] });
    await openGpuMonitoring(page);
    await expect(page.locator('.el-collapse-item')).toHaveCount(0);
  });

  test('shows unavailable feedback and recovers on reload', async ({ page }) => {
    let unavailable = true;
    let attempts = 0;
    await page.route(`**${GPU_PATH}`, async (route) => {
      attempts += 1;
      await route.fulfill({
        contentType: 'application/json',
        json: unavailable
          ? { code: 500, data: null, message: 'kneo-e2e GPU metrics unavailable' }
          : { code: 200, data: SAFE_STATUS, message: '' },
        status: 200,
      });
    });

    const rejected = gpuResponse(page);
    await page.goto('/ai/gpu/current');
    expect(((await (await rejected).json()) as ApiEnvelope<null>).code).toBe(500);
    await expect(
      page.getByText('kneo-e2e GPU metrics unavailable').first(),
    ).toBeVisible();
    await expect(page.locator('.el-collapse-item')).toHaveCount(0);

    unavailable = false;
    const retried = gpuResponse(page);
    await page.reload();
    await readGpuStatus(await retried);
    await expect(page.locator('.el-collapse-item')).toHaveCount(
      SAFE_STATUS.gpu.length,
    );
    expect(attempts).toBeGreaterThanOrEqual(2);
  });

  test('polls updated metrics and stops after returning to no refresh', async ({
    page,
  }) => {
    await page.clock.install();
    let calls = 0;
    await page.route(`**${GPU_PATH}`, async (route) => {
      calls += 1;
      const gpuUtil = calls === 1 ? '12 %' : '87 %';
      await route.fulfill({
        contentType: 'application/json',
        json: {
          code: 200,
          data: {
            ...SAFE_STATUS,
            gpu: [{ ...SAFE_STATUS.gpu[0], gpuUtil }],
          },
          message: '',
        },
        status: 200,
      });
    });
    await openGpuMonitoring(page);
    await expandGpu(page.locator('.el-collapse-item').first());
    await expect(page.getByText('12 %', { exact: true })).toBeVisible();

    const refreshControl = page.locator('.el-dropdown').filter({
      has: page.getByRole('button', { name: 'No refresh', exact: true }),
    });
    const openMenu = refreshControl.getByRole('button').last();

    await expect(
      page.getByRole('button', { name: 'No refresh', exact: true }),
    ).toBeVisible();
    await openMenu.click();

    const menu = page.locator('.el-dropdown-menu:visible');
    const items = menu.locator('.el-dropdown-menu__item');
    await expect(items.first()).toBeVisible();
    expect(await items.count()).toBeGreaterThan(1);

    const automaticInterval = (await items.nth(1).innerText()).trim();
    await items.nth(1).click();
    await expect(
      page.getByRole('button', {
        name: automaticInterval,
        exact: true,
      }),
    ).toBeVisible();
    await page.clock.fastForward(120_000);
    await expect.poll(() => calls).toBeGreaterThanOrEqual(2);
    await expect(page.getByText('87 %', { exact: true })).toBeVisible();

    const automaticRefreshControl = page.locator('.el-dropdown').filter({
      has: page.getByRole('button', {
        name: automaticInterval,
        exact: true,
      }),
    });
    await automaticRefreshControl.getByRole('button').last().click();
    await page
      .locator('.el-dropdown-menu:visible .el-dropdown-menu__item')
      .filter({ hasText: /^No refresh$/ })
      .click();
    await expect(
      page.getByRole('button', { name: 'No refresh', exact: true }),
    ).toBeVisible();
    const callsAfterStopping = calls;
    await page.clock.fastForward(120_000);
    expect(calls).toBe(callsAfterStopping);
  });
});
