import type { Page, WebSocket as PlaywrightWebSocket } from '@playwright/test';

import { test, expect } from '../../fixtures/read-only-test';

interface ProcessRecord {
  PID: number;
  PPID: number;
  cmdLine: string;
  connects: unknown;
  cpuPercent: string;
  cpuValue: number;
  data: string;
  dirty: string;
  diskRead: string;
  diskWrite: string;
  envs: unknown;
  hwm: string;
  locked: string;
  name: string;
  numConnections: number;
  numThreads: number;
  openFiles: unknown;
  pss: string;
  rss: string;
  rssValue: number;
  shared: string;
  stack: string;
  startTime: string;
  status: string;
  swap: string;
  text: string;
  username: string;
  uss: string;
  vms: string;
}

interface ProcessQuery {
  name: string;
  type: string;
  username: string;
}

const PROCESS_SOCKET_PATH = '/api/v2/process/ws';

const SAFE_PROCESSES: ProcessRecord[] = [
  {
    PID: 42001,
    PPID: 1,
    cmdLine: '/usr/bin/kneo-e2e-alpha --safe',
    connects: [],
    cpuPercent: '1.2%',
    cpuValue: 1.2,
    data: '2 MiB',
    dirty: '0 B',
    diskRead: '1 MiB',
    diskWrite: '2 MiB',
    envs: [],
    hwm: '40 MiB',
    locked: '0 B',
    name: 'kneo-e2e-alpha',
    numConnections: 2,
    numThreads: 4,
    openFiles: [],
    pss: '30 MiB',
    rss: '32 MiB',
    rssValue: 32,
    shared: '2 MiB',
    stack: '132 KiB',
    startTime: '2026-10-07 10:00:00',
    status: 'sleep',
    swap: '0 B',
    text: '1 MiB',
    username: 'kneo-e2e-owner-a',
    uss: '28 MiB',
    vms: '128 MiB',
  },
  {
    PID: 42002,
    PPID: 42001,
    cmdLine: '/usr/bin/kneo-e2e-beta --safe',
    connects: [],
    cpuPercent: '0.4%',
    cpuValue: 0.4,
    data: '3 MiB',
    dirty: '0 B',
    diskRead: '3 MiB',
    diskWrite: '1 MiB',
    envs: [],
    hwm: '52 MiB',
    locked: '0 B',
    name: 'kneo-e2e-beta',
    numConnections: 0,
    numThreads: 2,
    openFiles: [],
    pss: '38 MiB',
    rss: '40 MiB',
    rssValue: 40,
    shared: '2 MiB',
    stack: '132 KiB',
    startTime: '2026-10-07 10:05:00',
    status: 'running',
    swap: '0 B',
    text: '1 MiB',
    username: 'kneo-e2e-owner-b',
    uss: '36 MiB',
    vms: '160 MiB',
  },
  {
    PID: 42003,
    PPID: 1,
    cmdLine: '/usr/bin/kneo-e2e-gamma --safe',
    connects: [],
    cpuPercent: '2.1%',
    cpuValue: 2.1,
    data: '4 MiB',
    dirty: '0 B',
    diskRead: '4 MiB',
    diskWrite: '5 MiB',
    envs: [],
    hwm: '68 MiB',
    locked: '0 B',
    name: 'kneo-e2e-gamma',
    numConnections: 5,
    numThreads: 8,
    openFiles: [],
    pss: '54 MiB',
    rss: '56 MiB',
    rssValue: 56,
    shared: '2 MiB',
    stack: '132 KiB',
    startTime: '2026-10-07 10:10:00',
    status: 'idle',
    swap: '0 B',
    text: '1 MiB',
    username: 'kneo-e2e-owner-a',
    uss: '52 MiB',
    vms: '192 MiB',
  },
];

function socketSnapshot(page: Page): Promise<ProcessRecord[]> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('Timed out waiting for the process WebSocket snapshot.')),
      15_000,
    );
    page.on('websocket', (socket: PlaywrightWebSocket) => {
      if (new URL(socket.url()).pathname !== PROCESS_SOCKET_PATH) return;
      socket.on('framereceived', (event) => {
        try {
          const payload =
            typeof event.payload === 'string'
              ? event.payload
              : event.payload.toString();
          const parsed = JSON.parse(payload) as ProcessRecord[];
          if (!Array.isArray(parsed)) return;
          clearTimeout(timeout);
          resolve(parsed);
        } catch {
          // Ignore non-JSON frames and wait for the process snapshot.
        }
      });
    });
  });
}

function expectProcessContract(process: ProcessRecord): void {
  expect(Object.keys(process).sort()).toEqual(
    [
      'PID', 'PPID', 'cmdLine', 'connects', 'cpuPercent', 'cpuValue', 'data',
      'dirty', 'diskRead', 'diskWrite', 'envs', 'hwm', 'locked', 'name',
      'numConnections', 'numThreads', 'openFiles', 'pss', 'rss', 'rssValue',
      'shared', 'stack', 'startTime', 'status', 'swap', 'text', 'username',
      'uss', 'vms',
    ].sort(),
  );
  expect(process).toEqual(
    expect.objectContaining({
      PID: expect.any(Number),
      PPID: expect.any(Number),
      cpuValue: expect.any(Number),
      name: expect.any(String),
      numConnections: expect.any(Number),
      numThreads: expect.any(Number),
      rssValue: expect.any(Number),
      status: expect.any(String),
      username: expect.any(String),
    }),
  );
}

function processRows(page: Page) {
  return page.getByRole('row').filter({
    has: page.getByRole('button', { name: 'View details' }),
  });
}

async function expectSyntheticRows(page: Page, records: ProcessRecord[]): Promise<void> {
  const rows = processRows(page);
  await expect(rows).toHaveCount(records.length);
  for (let index = 0; index < records.length; index += 1) {
    const text = (await rows.nth(index).innerText()).replace(/\s+/g, ' ');
    const record = records[index];
    for (const value of [
      record.PID,
      record.name,
      record.PPID,
      record.numThreads,
      record.username,
      record.cpuPercent,
      record.rss,
      record.numConnections,
      record.status === 'running' ? 'Running' : record.status,
      record.startTime,
    ]) {
      expect(text).toContain(String(value));
    }
  }
}

async function routeProcessSocket(
  page: Page,
  onQuery: (query: ProcessQuery) => ProcessRecord[] | Promise<ProcessRecord[]>,
  queries: ProcessQuery[],
): Promise<void> {
  await page.routeWebSocket(
    (url) => url.pathname === PROCESS_SOCKET_PATH,
    (socket) => {
    socket.onMessage(async (message) => {
      const query = JSON.parse(message.toString()) as ProcessQuery;
      queries.push(query);
      socket.send(JSON.stringify(await onQuery(query)));
    });
    },
  );
}

test.describe('System > Processes inventory [H,V,F,R,P,C,A]', () => {
  test('maps the live WebSocket schema and visible-row cardinality without emitting process details', async ({ page }) => {
    const snapshot = socketSnapshot(page);
    await page.goto('/hosts/process/process');
    const records = await snapshot;
    expect(records.length).toBeGreaterThan(0);
    expectProcessContract(records[0]);

    const rows = processRows(page);
    await expect(rows.first()).toBeVisible();
    const displayed = await rows.count();
    expect(displayed).toBeGreaterThan(0);
    expect(displayed).toBeLessThanOrEqual(records.length);

    const knownPids = new Set(records.map((record) => record.PID));
    const displayedPids = await rows.evaluateAll((elements) =>
      elements.map((element) =>
        Number(element.querySelector('[role="cell"]')?.textContent?.trim()),
      ),
    );
    expect(
      displayedPids.every((pid) => knownPids.has(pid)),
      'Every virtualized UI row should identify a process from the live socket snapshot.',
    ).toBe(true);
  });

  test('filters synthetic multi-item data by name and owner with exact socket queries', async ({ page }) => {
    const queries: ProcessQuery[] = [];
    await routeProcessSocket(
      page,
      (query) =>
        SAFE_PROCESSES.filter(
          (process) =>
            (!query.name || process.name.includes(query.name)) &&
            (!query.username || process.username.includes(query.username)),
        ),
      queries,
    );
    await page.goto('/hosts/process/process');
    await expectSyntheticRows(page, SAFE_PROCESSES);
    expect(queries[0]).toEqual({ name: '', type: 'ps', username: '' });

    const name = page.getByPlaceholder('Name');
    await name.fill('alpha');
    await name.press('Enter');
    await expectSyntheticRows(page, [SAFE_PROCESSES[0]]);
    expect(queries.at(-1)).toEqual({ name: 'alpha', type: 'ps', username: '' });

    const owner = page.getByPlaceholder('Owner');
    await owner.fill('owner-b');
    await owner.press('Enter');
    await expect(processRows(page)).toHaveCount(0);
    await expect(page.getByText('No Data', { exact: true })).toBeVisible();
    expect(queries.at(-1)).toEqual({
      name: 'alpha', type: 'ps', username: 'owner-b',
    });

    await name.clear();
    await owner.clear();
    await owner.press('Enter');
    await expectSyntheticRows(page, SAFE_PROCESSES);
  });

  test('opens complete synthetic details and closes without ending a process', async ({ page }) => {
    const queries: ProcessQuery[] = [];
    await routeProcessSocket(page, () => SAFE_PROCESSES, queries);
    let detailRequests = 0;
    await page.route(`**/api/v2/process/${SAFE_PROCESSES[0].PID}`, (route) => {
      detailRequests += 1;
      expect(route.request().method()).toBe('GET');
      return route.fulfill({
        json: { code: 200, data: SAFE_PROCESSES[0], message: '' },
      });
    });
    await page.goto('/hosts/process/process');
    await expectSyntheticRows(page, SAFE_PROCESSES);

    await processRows(page).first().getByRole('button', { name: 'View details' }).click();
    const drawer = page.locator('.el-drawer:visible');
    await expect(drawer).toBeVisible();
    const descriptions = drawer.locator('.el-descriptions:visible');
    for (const label of [
      'Name', 'Status', 'Process ID', 'Connections', 'Owner', 'Start command',
    ]) {
      await expect(descriptions.getByText(label, { exact: true })).toBeVisible();
    }
    for (const value of [
      SAFE_PROCESSES[0].name,
      SAFE_PROCESSES[0].PID,
      SAFE_PROCESSES[0].username,
      SAFE_PROCESSES[0].cmdLine,
    ]) {
      await expect(drawer).toContainText(String(value));
    }
    await drawer.getByText('Back', { exact: true }).click();
    await expect(drawer).toBeHidden();
    expect(detailRequests).toBe(1);
    expect(queries.length).toBeGreaterThanOrEqual(1);
  });

  test('recovers from a closed socket on reload', async ({ page }) => {
    let unavailable = true;
    let connections = 0;
    await page.routeWebSocket(
      (url) => url.pathname === PROCESS_SOCKET_PATH,
      (socket) => {
        connections += 1;
        socket.onMessage(async () => {
          if (unavailable) {
            await socket.close({ code: 1011, reason: 'kneo-e2e unavailable' });
          } else {
            socket.send(JSON.stringify(SAFE_PROCESSES));
          }
        });
      },
    );

    await page.goto('/hosts/process/process');
    await expect.poll(() => connections).toBe(1);
    await expect(processRows(page)).toHaveCount(0);
    unavailable = false;
    await page.reload();
    await expectSyntheticRows(page, SAFE_PROCESSES);
    await expect.poll(() => connections).toBe(2);
  });
});
