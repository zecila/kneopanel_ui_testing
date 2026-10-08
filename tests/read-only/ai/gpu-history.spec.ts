import type { Locator, Page, Response } from '@playwright/test';

import { test, expect } from '../../fixtures/read-only-test';

interface ApiEnvelope<T> {
  code: number;
  data: T;
  message?: string;
}

interface ChartVisibility {
  gpu: boolean;
  memory: boolean;
  power: boolean;
  process: boolean;
  productName: string;
  speed: boolean;
  temperature: boolean;
}

interface GpuOptions {
  chartHide: ChartVisibility[];
  gpuType: string;
  options: string[];
}

interface GpuHistory {
  date: string[];
  gpuProcesses: unknown[][];
  gpuValue: number[];
  memoryPercent: number[];
  memoryTotal: number[];
  memoryUsed: number[];
  powerPercent: number[];
  powerTotal: number[];
  powerUsed: number[];
  processCount: number[];
  speedValue: number[];
  temperatureValue: number[];
}

interface HistoryRequest {
  endTime: string;
  productName: string;
  startTime: string;
}

const OPTIONS_PATH = '/api/v2/hosts/monitor/gpuoptions';
const SEARCH_PATH = '/api/v2/hosts/monitor/gpu/search';
const CHARTS = [
  { hideKey: 'memory', id: '#loadMemoryChart', title: 'Memory Utilization' },
  { hideKey: 'gpu', id: '#loadGPUChart', title: 'GPU Utilization' },
  { hideKey: 'process', id: '#loadProcessChart', title: 'Process Information' },
  { hideKey: 'power', id: '#loadPowerChart', title: 'Power Consumption' },
  { hideKey: 'temperature', id: '#loadTemperatureChart', title: 'Temperature' },
  { hideKey: 'speed', id: '#loadSpeedChart', title: 'Fan Speed' },
] as const;

const SAFE_OPTIONS: GpuOptions = {
  chartHide: [
    {
      gpu: false,
      memory: false,
      power: false,
      process: false,
      productName: '0 - kneo-e2e GPU Alpha',
      speed: false,
      temperature: false,
    },
    {
      gpu: false,
      memory: true,
      power: false,
      process: true,
      productName: '1 - kneo-e2e GPU Beta',
      speed: true,
      temperature: false,
    },
  ],
  gpuType: 'nvidia',
  options: ['0 - kneo-e2e GPU Alpha', '1 - kneo-e2e GPU Beta'],
};

function historyData(seed = 0): GpuHistory {
  const date = [
    '2026-10-07T10:00:00Z',
    '2026-10-07T10:05:00Z',
    '2026-10-07T10:10:00Z',
  ];
  return {
    date,
    gpuProcesses: [[], [], []],
    gpuValue: [10 + seed, 80 - seed, 30 + seed],
    memoryPercent: [20 + seed, 45 + seed, 30 + seed],
    memoryTotal: [16384, 16384, 16384],
    memoryUsed: [2048 + seed, 4096 + seed, 3072 + seed],
    powerPercent: [15 + seed, 35 + seed, 20 + seed],
    powerTotal: [300, 300, 300],
    powerUsed: [45 + seed, 105 + seed, 60 + seed],
    processCount: [1 + seed, 2 + seed, 1 + seed],
    speedValue: [25 + seed, 40 + seed, 30 + seed],
    temperatureValue: [35 + seed, 50 + seed, 41 + seed],
  };
}

function pathMatches(response: Response, path: string, method: string): boolean {
  return (
    response.request().method() === method &&
    new URL(response.url()).pathname === path
  );
}

async function readEnvelope<T>(response: Response): Promise<T> {
  expect(response.ok()).toBe(true);
  const envelope = (await response.json()) as ApiEnvelope<T>;
  expect(envelope.code, envelope.message).toBe(200);
  return envelope.data;
}

function validateHistoryRequest(request: HistoryRequest, productName: string): void {
  expect(request.productName).toBe(productName);
  expect(Date.parse(request.startTime)).not.toBeNaN();
  expect(Date.parse(request.endTime)).not.toBeNaN();
  expect(Date.parse(request.startTime)).toBeLessThan(Date.parse(request.endTime));
}

function validateHistory(history: GpuHistory): void {
  const length = history.date.length;
  expect(length).toBeGreaterThan(0);
  for (const field of [
    history.gpuProcesses,
    history.gpuValue,
    history.memoryPercent,
    history.memoryTotal,
    history.memoryUsed,
    history.powerPercent,
    history.powerTotal,
    history.powerUsed,
    history.processCount,
    history.speedValue,
    history.temperatureValue,
  ]) {
    expect(field).toHaveLength(length);
  }
  for (const date of history.date) expect(Date.parse(date)).not.toBeNaN();
  for (const field of [
    history.gpuValue,
    history.memoryPercent,
    history.memoryTotal,
    history.memoryUsed,
    history.powerPercent,
    history.powerTotal,
    history.powerUsed,
    history.processCount,
    history.speedValue,
    history.temperatureValue,
  ]) {
    for (const value of field) expect(value).toEqual(expect.any(Number));
  }
}

async function expectCanvasDrawn(chart: Locator): Promise<void> {
  const canvas = chart.locator('canvas');
  await expect(canvas).toBeVisible();
  await expect
    .poll(async () =>
      canvas.evaluate((element) => {
        const target = element as HTMLCanvasElement;
        const pixels = target
          .getContext('2d')
          ?.getImageData(0, 0, target.width, target.height).data;
        if (!pixels) return 0;
        let opaque = 0;
        for (let index = 3; index < pixels.length; index += 4) {
          if (pixels[index] > 0) opaque += 1;
        }
        return opaque;
      }),
    )
    .toBeGreaterThan(100);
}

async function expectChartVisibility(
  page: Page,
  visibility: ChartVisibility,
): Promise<void> {
  for (const chart of CHARTS) {
    const hidden = visibility[chart.hideKey];
    const title = page.getByText(chart.title, { exact: true });
    const container = page.locator(chart.id);
    await expect(title).toBeVisible();
    if (hidden) {
      await expect(container).toBeHidden();
      const card = title.locator(
        'xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " el-card ")][1]',
      );
      await expect(card).toContainText(
        'The current version or driver does not support displaying this parameter.',
      );
    } else {
      await expect(container).toBeVisible();
      await expectCanvasDrawn(container);
    }
  }
}

async function routeOptions(page: Page, options = SAFE_OPTIONS): Promise<void> {
  await page.route(`**${OPTIONS_PATH}`, (route) =>
    route.fulfill({ json: { code: 200, data: options, message: '' } }),
  );
}

async function selectGpu(page: Page, name: string): Promise<void> {
  await page.locator('.el-select').click();
  await page.getByRole('option', { name, exact: true }).click();
}

test.describe('GPU Monitoring > Historical Records [H,F,R,P,C,A]', () => {
  test('maps the live device, history schema, chart visibility, refresh, and reload', async ({
    page,
  }) => {
    const optionsResponse = page.waitForResponse((response) =>
      pathMatches(response, OPTIONS_PATH, 'GET'),
    );
    const historyResponse = page.waitForResponse((response) =>
      pathMatches(response, SEARCH_PATH, 'POST'),
    );
    await page.goto('/ai/gpu/history');

    const options = await readEnvelope<GpuOptions>(await optionsResponse);
    expect(options.options.length).toBeGreaterThan(0);
    expect(options.chartHide).toHaveLength(options.options.length);
    expect(options.chartHide.map((item) => item.productName)).toEqual(options.options);

    const historyReply = await historyResponse;
    validateHistoryRequest(
      historyReply.request().postDataJSON() as HistoryRequest,
      options.options[0],
    );
    validateHistory(await readEnvelope<GpuHistory>(historyReply));
    await expect(page.getByText('Historical Records', { exact: true })).toBeVisible();
    await expect(page.locator('.el-select')).toContainText(options.options[0]);
    await expectChartVisibility(page, options.chartHide[0]);

    const refreshed = page.waitForResponse((response) =>
      pathMatches(response, SEARCH_PATH, 'POST'),
    );
    await page.locator('.fresh-button').click();
    const refreshedReply = await refreshed;
    validateHistoryRequest(
      refreshedReply.request().postDataJSON() as HistoryRequest,
      options.options[0],
    );
    validateHistory(await readEnvelope<GpuHistory>(refreshedReply));

    const reloaded = page.waitForResponse((response) =>
      pathMatches(response, SEARCH_PATH, 'POST'),
    );
    await page.reload();
    const reloadedReply = await reloaded;
    validateHistoryRequest(
      reloadedReply.request().postDataJSON() as HistoryRequest,
      options.options[0],
    );
    validateHistory(await readEnvelope<GpuHistory>(reloadedReply));
    await expectChartVisibility(page, options.chartHide[0]);
  });

  test('selects an exact GPU and applies its metric-availability configuration', async ({
    page,
  }) => {
    await page.clock.install({ time: new Date('2026-10-07T12:00:00Z') });
    await routeOptions(page);
    const requests: HistoryRequest[] = [];
    await page.route(`**${SEARCH_PATH}`, async (route) => {
      const request = route.request().postDataJSON() as HistoryRequest;
      requests.push(request);
      const selectedIndex = SAFE_OPTIONS.options.indexOf(request.productName);
      await route.fulfill({
        json: { code: 200, data: historyData(selectedIndex * 10), message: '' },
      });
    });

    await page.goto('/ai/gpu/history');
    await expectChartVisibility(page, SAFE_OPTIONS.chartHide[0]);

    const secondSearch = page.waitForResponse((response) =>
      pathMatches(response, SEARCH_PATH, 'POST'),
    );
    await selectGpu(page, SAFE_OPTIONS.options[1]);
    validateHistory(await readEnvelope<GpuHistory>(await secondSearch));
    expect(requests).toHaveLength(2);
    validateHistoryRequest(requests[1], SAFE_OPTIONS.options[1]);
    await expect(page.locator('.el-select')).toContainText(SAFE_OPTIONS.options[1]);
    await expectChartVisibility(page, SAFE_OPTIONS.chartHide[1]);
  });

  test('keeps chart structure stable for an empty time range result', async ({ page }) => {
    await routeOptions(page, {
      chartHide: [SAFE_OPTIONS.chartHide[0]],
      gpuType: 'nvidia',
      options: [SAFE_OPTIONS.options[0]],
    });
    const empty: GpuHistory = {
      date: [],
      gpuProcesses: [],
      gpuValue: [],
      memoryPercent: [],
      memoryTotal: [],
      memoryUsed: [],
      powerPercent: [],
      powerTotal: [],
      powerUsed: [],
      processCount: [],
      speedValue: [],
      temperatureValue: [],
    };
    await page.route(`**${SEARCH_PATH}`, (route) =>
      route.fulfill({ json: { code: 200, data: empty, message: '' } }),
    );

    const response = page.waitForResponse((candidate) =>
      pathMatches(candidate, SEARCH_PATH, 'POST'),
    );
    await page.goto('/ai/gpu/history');
    expect(await readEnvelope<GpuHistory>(await response)).toEqual(empty);
    for (const chart of CHARTS) {
      await expect(page.getByText(chart.title, { exact: true })).toBeVisible();
      await expect(page.locator(chart.id)).toBeVisible();
    }
  });

  test('shows a history-search failure and retries from the refresh control', async ({
    page,
  }) => {
    await routeOptions(page, {
      chartHide: [SAFE_OPTIONS.chartHide[0]],
      gpuType: 'nvidia',
      options: [SAFE_OPTIONS.options[0]],
    });
    let unavailable = true;
    let attempts = 0;
    await page.route(`**${SEARCH_PATH}`, (route) => {
      attempts += 1;
      return route.fulfill({
        json: unavailable
          ? { code: 500, data: null, message: 'kneo-e2e GPU history unavailable' }
          : { code: 200, data: historyData(), message: '' },
      });
    });

    await page.goto('/ai/gpu/history');
    await expect(page.getByRole('alert')).toContainText(
      'kneo-e2e GPU history unavailable',
    );

    unavailable = false;
    const retried = page.waitForResponse((response) =>
      pathMatches(response, SEARCH_PATH, 'POST'),
    );
    await page.locator('.fresh-button').click();
    validateHistory(await readEnvelope<GpuHistory>(await retried));
    expect(attempts).toBe(2);
    await expectChartVisibility(page, SAFE_OPTIONS.chartHide[0]);
  });

  test('renders the no-GPU state for an empty inventory', async ({ page }) => {
    await routeOptions(page, {
      chartHide: [],
      gpuType: 'nvidia',
      options: [],
    });
    await page.route(`**${SEARCH_PATH}`, (route) => {
      return route.fulfill({ json: { code: 200, data: historyData(), message: '' } });
    });

    const optionsResponse = page.waitForResponse((response) =>
      pathMatches(response, OPTIONS_PATH, 'GET'),
    );
    await page.goto('/ai/gpu/history');
    expect(await readEnvelope<GpuOptions>(await optionsResponse)).toEqual({
      chartHide: [],
      gpuType: 'nvidia',
      options: [],
    });
    await expect(
      page.getByText(
        'The system did not detect NVIDIA-SMI or XPU-SMI commands. Please check and try again!',
        { exact: true },
      ),
    ).toBeVisible();
    await expect(page.locator('.el-select')).toHaveCount(0);
  });

  test('shows GPU-inventory failure feedback and recovers on reload', async ({ page }) => {
    let unavailable = true;
    let attempts = 0;
    await page.route(`**${OPTIONS_PATH}`, (route) => {
      attempts += 1;
      return route.fulfill({
        json: unavailable
          ? { code: 500, data: null, message: 'kneo-e2e GPU inventory unavailable' }
          : {
              code: 200,
              data: {
                chartHide: [SAFE_OPTIONS.chartHide[0]],
                gpuType: 'nvidia',
                options: [SAFE_OPTIONS.options[0]],
              },
              message: '',
            },
      });
    });
    await page.route(`**${SEARCH_PATH}`, (route) =>
      route.fulfill({ json: { code: 200, data: historyData(), message: '' } }),
    );

    await page.goto('/ai/gpu/history');
    await expect(
      page.getByText(
        'The system did not detect NVIDIA-SMI or XPU-SMI commands. Please check and try again!',
        { exact: true },
      ),
    ).toBeVisible();

    unavailable = false;
    const recovered = page.waitForResponse((response) =>
      pathMatches(response, SEARCH_PATH, 'POST'),
    );
    await page.reload();
    validateHistory(await readEnvelope<GpuHistory>(await recovered));
    expect(attempts).toBe(2);
    await expectChartVisibility(page, SAFE_OPTIONS.chartHide[0]);
  });
});
