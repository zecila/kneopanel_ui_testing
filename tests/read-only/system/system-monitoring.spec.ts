import type { Page, Response } from '@playwright/test';

import { test, expect } from '../../fixtures/read-only-test';

interface ApiEnvelope<T> {
  code: number;
  data: T;
  message?: string;
}

interface BaseSample {
  cpu: number;
  cpuLoad1: number;
  cpuLoad5: number;
  cpuLoad15: number;
  createdAt: string;
  id: number;
  loadUsage: number;
  memory: number;
  topCPU: string;
  topCPUItems: unknown[];
  topMem: string;
  topMemItems: unknown[];
  updatedAt: string;
}

interface IoSample {
  count: number;
  createdAt: string;
  id: number;
  name: string;
  read: number;
  time: string;
  updatedAt: string;
  write: number;
}

interface NetworkSample {
  createdAt: string;
  down: number;
  id: number;
  name: string;
  up: number;
  updatedAt: string;
}

type MonitorSeries =
  | { date: string[]; param: 'base'; value: BaseSample[] }
  | { date: string[]; param: 'io'; value: IoSample[] }
  | { date: string[]; param: 'network'; value: NetworkSample[] };

interface MonitorRequest {
  endTime: string;
  io: string;
  network: string;
  param: string;
  startTime: string;
}

const SEARCH_PATH = '/api/v2/hosts/monitor/search';
const IO_OPTIONS_PATH = '/api/v2/hosts/monitor/iooptions';
const NETWORK_OPTIONS_PATH = '/api/v2/hosts/monitor/netoptions';
const CHART_TITLES = [
  'Load average',
  'CPU',
  'Memory',
  'Disk I/O: All',
  'Network: All',
] as const;

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

function validateRequest(request: MonitorRequest, expectedParam: string): void {
  expect(request).toMatchObject({
    io: 'all',
    network: 'all',
    param: expectedParam,
  });
  expect(Date.parse(request.startTime)).not.toBeNaN();
  expect(Date.parse(request.endTime)).not.toBeNaN();
  expect(Date.parse(request.startTime)).toBeLessThan(Date.parse(request.endTime));
}

function isSearchResponse(response: Response, param?: string): boolean {
  if (!pathMatches(response, SEARCH_PATH, 'POST')) return false;
  if (!param) return true;
  return (response.request().postDataJSON() as MonitorRequest).param === param;
}

function expectSeriesContract(
  series: MonitorSeries[],
  requestParam = 'all',
): void {
  const expectedParams =
    requestParam === 'all'
      ? ['base', 'io', 'network']
      : [requestParam === 'io' || requestParam === 'network' ? requestParam : 'base'];
  expect(series.map((item) => item.param)).toEqual(expectedParams);
  for (const item of series) {
    expect(item.date.length).toBe(item.value.length);
    expect(item.date.length).toBeGreaterThan(0);
    for (const date of item.date) expect(Date.parse(date)).not.toBeNaN();
    if (item.param === 'base') {
      expect(item.value[0]).toEqual(
        expect.objectContaining({
          cpu: expect.any(Number),
          cpuLoad1: expect.any(Number),
          cpuLoad5: expect.any(Number),
          cpuLoad15: expect.any(Number),
          loadUsage: expect.any(Number),
          memory: expect.any(Number),
        }),
      );
    } else if (item.param === 'io') {
      expect(item.value[0]).toEqual(
        expect.objectContaining({
          name: expect.any(String),
          read: expect.any(Number),
          write: expect.any(Number),
        }),
      );
    } else {
      expect(item.value[0]).toEqual(
        expect.objectContaining({
          down: expect.any(Number),
          name: expect.any(String),
          up: expect.any(Number),
        }),
      );
    }
  }
}

async function expectMonitoringSurface(page: Page): Promise<void> {
  await expect(page.getByText('Monitoring', { exact: true }).last()).toBeVisible();
  for (const title of CHART_TITLES) {
    await expect(page.getByText(title, { exact: true })).toBeVisible();
  }
  await expect(page.locator('.v-charts')).toHaveCount(CHART_TITLES.length);
  await expect(page.locator('.v-charts canvas')).toHaveCount(CHART_TITLES.length);
}

async function canvasFingerprints(page: Page): Promise<string[]> {
  await expect(page.locator('.v-charts canvas')).toHaveCount(CHART_TITLES.length);
  await page.waitForTimeout(700);
  const canvases = page.locator('.v-charts canvas');
  const opaquePixels = await canvases.evaluateAll((elements) =>
    elements.map((element) => {
      const canvas = element as HTMLCanvasElement;
      const pixels = canvas
        .getContext('2d')
        ?.getImageData(0, 0, canvas.width, canvas.height).data;
      if (!pixels) return 0;
      let opaque = 0;
      for (let index = 3; index < pixels.length; index += 4) {
        if (pixels[index] > 0) opaque += 1;
      }
      return opaque;
    }),
  );
  for (const opaque of opaquePixels) expect(opaque).toBeGreaterThan(100);
  return canvases.evaluateAll((elements) =>
    elements.map((element) => (element as HTMLCanvasElement).toDataURL()),
  );
}

function buildSeries(alternate = false): MonitorSeries[] {
  const dates = [
    '2026-10-07T10:00:00Z',
    '2026-10-07T10:05:00Z',
    '2026-10-07T10:10:00Z',
  ];
  const pattern = alternate ? [90, 5, 75] : [10, 30, 20];
  const base = pattern.map((value, index): BaseSample => ({
    cpu: value,
    cpuLoad1: value / 10,
    cpuLoad5: (value + 5) / 10,
    cpuLoad15: (value + 10) / 10,
    createdAt: dates[index],
    id: index + 1,
    loadUsage: value / 2,
    memory: value + 5,
    topCPU: '',
    topCPUItems: [],
    topMem: '',
    topMemItems: [],
    updatedAt: dates[index],
  }));
  const io = pattern.map((value, index): IoSample => ({
    count: index + 1,
    createdAt: dates[index],
    id: index + 11,
    name: 'kneo-e2e-disk',
    read: value * (index + 1),
    time: dates[index],
    updatedAt: dates[index],
    write: (100 - value) * (index + 1),
  }));
  const network = pattern.map((value, index): NetworkSample => ({
    createdAt: dates[index],
    down: value * (index + 2),
    id: index + 21,
    name: 'kneo-e2e-network',
    up: (100 - value) * (index + 1),
    updatedAt: dates[index],
  }));
  return [
    { date: dates, param: 'base', value: base },
    { date: dates, param: 'io', value: io },
    { date: dates, param: 'network', value: network },
  ];
}

function seriesForParam(param: string, alternate = false): MonitorSeries[] {
  const series = buildSeries(alternate);
  if (param === 'all') return series;
  if (param === 'io') return [series[1]];
  if (param === 'network') return [series[2]];
  return [series[0]];
}

async function routeOptions(page: Page): Promise<void> {
  await page.route(`**${IO_OPTIONS_PATH}`, (route) =>
    route.fulfill({ json: { code: 200, data: ['all', 'kneo-e2e-disk'] } }),
  );
  await page.route(`**${NETWORK_OPTIONS_PATH}`, (route) =>
    route.fulfill({ json: { code: 200, data: ['all', 'kneo-e2e-network'] } }),
  );
}

test.describe('System > Monitoring [H,F,R,P,C,A]', () => {
  test('maps the live metric series and exact default request, then refreshes and reloads', async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const options = Promise.all([
      page.waitForResponse((response) =>
        pathMatches(response, IO_OPTIONS_PATH, 'GET'),
      ),
      page.waitForResponse((response) =>
        pathMatches(response, NETWORK_OPTIONS_PATH, 'GET'),
      ),
    ]);
    const search = page.waitForResponse((response) =>
      isSearchResponse(response, 'all'),
    );
    await page.goto('/hosts/monitor/monitor');

    const [ioOptions, networkOptions] = await Promise.all(
      (await options).map((response) => readEnvelope<string[]>(response)),
    );
    expect(ioOptions.length).toBeGreaterThan(0);
    expect(networkOptions.length).toBeGreaterThan(0);

    const searchResponse = await search;
    validateRequest(
      searchResponse.request().postDataJSON() as MonitorRequest,
      'all',
    );
    expectSeriesContract(await readEnvelope<MonitorSeries[]>(searchResponse));
    await expectMonitoringSurface(page);
    await canvasFingerprints(page);

    const refreshed = page.waitForResponse((response) => isSearchResponse(response));
    await page.locator('.fresh-button').click();
    const refreshedResponse = await refreshed;
    const refreshedRequest =
      refreshedResponse.request().postDataJSON() as MonitorRequest;
    expect(['load', 'cpu', 'memory', 'io', 'network', 'all']).toContain(
      refreshedRequest.param,
    );
    validateRequest(
      refreshedRequest,
      refreshedRequest.param,
    );
    expectSeriesContract(
      await readEnvelope<MonitorSeries[]>(refreshedResponse),
      refreshedRequest.param,
    );

    const reloaded = page.waitForResponse((response) =>
      isSearchResponse(response, 'all'),
    );
    await page.reload();
    expectSeriesContract(await readEnvelope<MonitorSeries[]>(await reloaded));
    await expectMonitoringSurface(page);
  });

  test('redraws all five charts when refreshed data changes', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-10-07T12:00:00Z') });
    await routeOptions(page);
    let calls = 0;
    let alternate = false;
    await page.route(`**${SEARCH_PATH}`, (route) => {
      calls += 1;
      const request = route.request().postDataJSON() as MonitorRequest;
      return route.fulfill({
        json: {
          code: 200,
          data: seriesForParam(request.param, alternate),
          message: '',
        },
      });
    });

    await page.goto('/hosts/monitor/monitor');
    await expectMonitoringSurface(page);
    const before = await canvasFingerprints(page);

    const callsBeforeRefresh = calls;
    alternate = true;
    await page.locator('.fresh-button').click();
    await expect.poll(() => calls).toBeGreaterThan(callsBeforeRefresh);
    const after = await canvasFingerprints(page);
    expect(after).toHaveLength(before.length);
    for (let index = 0; index < before.length; index += 1) {
      expect(after[index], `Chart ${index + 1} should redraw`).not.toBe(before[index]);
    }
  });

  test('renders a successful empty monitoring result', async ({ page }) => {
    await routeOptions(page);
    await page.route(`**${SEARCH_PATH}`, (route) =>
      route.fulfill({ json: { code: 200, data: [], message: '' } }),
    );

    const search = page.waitForResponse((response) =>
      pathMatches(response, SEARCH_PATH, 'POST'),
    );
    await page.goto('/hosts/monitor/monitor');
    expect(await readEnvelope<MonitorSeries[]>(await search)).toEqual([]);
    for (const title of CHART_TITLES) {
      await expect(page.getByText(title, { exact: true })).toBeVisible();
    }
    await expect(page.locator('.v-charts')).toHaveCount(0);
  });

  test('shows search failure feedback and retries safely', async ({ page }) => {
    await routeOptions(page);
    let unavailable = true;
    let attempts = 0;
    await page.route(`**${SEARCH_PATH}`, (route) => {
      attempts += 1;
      const request = route.request().postDataJSON() as MonitorRequest;
      return route.fulfill({
        json: unavailable
          ? { code: 500, data: null, message: 'kneo-e2e monitoring unavailable' }
          : {
              code: 200,
              data: seriesForParam(request.param),
              message: '',
            },
      });
    });

    await page.goto('/hosts/monitor/monitor');
    await expect(
      page.getByText('kneo-e2e monitoring unavailable').first(),
    ).toBeVisible();

    const attemptsBeforeRetry = attempts;
    unavailable = false;
    const retried = page.waitForResponse((response) => isSearchResponse(response));
    await page.locator('.fresh-button').click();
    const retriedResponse = await retried;
    const retriedRequest = retriedResponse.request().postDataJSON() as MonitorRequest;
    expectSeriesContract(
      await readEnvelope<MonitorSeries[]>(retriedResponse),
      retriedRequest.param,
    );
    expect(attempts).toBeGreaterThan(attemptsBeforeRetry);
    await expectMonitoringSurface(page);
    await canvasFingerprints(page);
  });
});
