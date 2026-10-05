import type { Page } from '@playwright/test';

import { test, expect } from '../../fixtures/read-only-test';

interface GpuStatus {
  gpu: Array<{
    index: number;
    memTotal: string;
    memUsed: string;
  }>;
}

interface ApiEnvelope<T> {
  code: number;
  data: T;
}

function toMiB(value: number, unit: string): number {
  return unit === 'GiB' ? value * 1024 : value;
}

function parseMemory(value: string): number {
  const match = value.trim().match(/^(\d+(?:\.\d+)?)\s*(MiB|GiB)$/);
  expect(match, `Expected a GPU memory value, received: ${value}`).not.toBeNull();
  return toMiB(Number(match?.[1]), match?.[2] ?? 'MiB');
}

async function openGpuMonitoring(page: Page): Promise<GpuStatus> {
  const gpuResponse = page.waitForResponse(
    (response) =>
      response.request().method() === 'GET' &&
      new URL(response.url()).pathname === '/api/v2/ai/gpu/load',
  );
  await page.goto('/ai/gpu/current');

  const response = await gpuResponse;
  expect(response.ok()).toBe(true);
  const envelope = (await response.json()) as ApiEnvelope<GpuStatus>;
  expect(envelope.code).toBe(200);
  expect(Array.isArray(envelope.data.gpu)).toBe(true);
  return envelope.data;
}

test.describe('GPU Monitoring', () => {
  test('displays GPU status columns', async ({ page }) => {
    await openGpuMonitoring(page);

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
  });

  test('numbers every reported GPU uniquely and consecutively', async ({ page }) => {
    const status = await openGpuMonitoring(page);
    const gpuItems = page.locator('.el-collapse-item');
    await expect(gpuItems.first()).toBeVisible();

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
    expect(numbers).toEqual(numbers.map((_, index) => index));
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  test('reports a valid VRAM utilization ratio for every GPU', async ({ page }) => {
    const status = await openGpuMonitoring(page);
    const gpuItems = page.locator('.el-collapse-item');
    await expect(gpuItems.first()).toBeVisible();
    const gpuCount = await gpuItems.count();
    expect(gpuCount).toBeGreaterThan(0);

    for (let index = 0; index < gpuCount; index += 1) {
      const item = gpuItems.nth(index);
      const content = item.locator('.el-collapse-item__wrap');
      if (!(await content.isVisible())) {
        await item.locator('.el-collapse-item__header').click();
      }
      await expect(content).toBeVisible();
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
        `GPU ${index} should report used and total VRAM`,
      ).toHaveText(memoryPattern);
      const match = (await memoryCell.innerText()).match(memoryPattern);
      expect(match, `GPU ${index} should report used and total VRAM`).not.toBeNull();

      const used = toMiB(Number(match?.[1]), match?.[2] ?? 'MiB');
      const total = toMiB(Number(match?.[3]), match?.[4] ?? 'MiB');
      expect(used).toBeGreaterThanOrEqual(0);
      expect(total).toBeGreaterThan(0);
      expect(used).toBeLessThanOrEqual(total);

      const apiGpu = status.gpu.find((gpu) => gpu.index === index);
      expect(apiGpu, `The API should report GPU ${index}`).toBeDefined();
      expect(used).toBeCloseTo(parseMemory(apiGpu?.memUsed ?? ''), 0);
      expect(total).toBeCloseTo(parseMemory(apiGpu?.memTotal ?? ''), 0);
    }
  });

  test('selects an automatic refresh interval and returns to no refresh', async ({
    page,
  }) => {
    await openGpuMonitoring(page);

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
  });
});
