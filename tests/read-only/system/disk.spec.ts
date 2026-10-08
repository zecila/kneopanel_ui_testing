import type { Page, Response } from '@playwright/test';

import { test, expect } from '../../fixtures/read-only-test';

interface ApiEnvelope<T> {
  code: number;
  data: T;
  message?: string;
}

interface DiskRecord {
  avail: string;
  device: string;
  diskType: string;
  filesystem: string;
  isMounted: boolean;
  isRemovable: boolean;
  isSystem: boolean;
  model: string;
  mountPoint: string;
  serial: string;
  size: string;
  usePercent: number;
  used: string;
}

interface SystemDisk extends DiskRecord {
  partitions: DiskRecord[];
}

interface DiskInventory {
  disks: DiskRecord[] | null;
  systemDisks: SystemDisk[];
  totalCapacity: number;
  totalDisks: number;
  unpartitionedDisks: DiskRecord[] | null;
}

const DISKS_PATH = '/api/v2/hosts/disks';
const HEADERS = [
  'PartitionName',
  'Size',
  'Used',
  'Available',
  'Utilization',
  'Mount Directory',
  'Filesystem',
  'Actions',
] as const;

const PARTITIONS: DiskRecord[] = [
  {
    avail: '75 GiB',
    device: '/dev/kneo-e2e-a1',
    diskType: 'part',
    filesystem: 'ext4',
    isMounted: true,
    isRemovable: false,
    isSystem: true,
    model: 'kneo-e2e disk alpha',
    mountPoint: '/mnt/kneo-e2e-alpha',
    serial: 'kneo-e2e-alpha',
    size: '100 GiB',
    usePercent: 25,
    used: '25 GiB',
  },
  {
    avail: '120 GiB',
    device: '/dev/kneo-e2e-b1',
    diskType: 'part',
    filesystem: 'xfs',
    isMounted: true,
    isRemovable: false,
    isSystem: false,
    model: 'kneo-e2e disk beta',
    mountPoint: '/mnt/kneo-e2e-beta',
    serial: 'kneo-e2e-beta',
    size: '200 GiB',
    usePercent: 40,
    used: '80 GiB',
  },
];

const SAFE_INVENTORY: DiskInventory = {
  disks: [],
  systemDisks: [
    {
      ...PARTITIONS[0],
      avail: '',
      device: '/dev/kneo-e2e-a',
      filesystem: '',
      isMounted: false,
      mountPoint: '',
      partitions: PARTITIONS,
      size: '300 GiB',
      usePercent: 0,
      used: '',
    },
  ],
  totalCapacity: 300,
  totalDisks: 1,
  unpartitionedDisks: [],
};

function diskResponse(page: Page): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === 'GET' &&
      new URL(response.url()).pathname === DISKS_PATH,
  );
}

async function readInventory(response: Response): Promise<DiskInventory> {
  expect(response.ok()).toBe(true);
  const envelope = (await response.json()) as ApiEnvelope<DiskInventory>;
  expect(envelope.code, envelope.message).toBe(200);
  expect(Array.isArray(envelope.data.systemDisks)).toBe(true);
  return envelope.data;
}

function displayedPartitions(inventory: DiskInventory): DiskRecord[] {
  return inventory.systemDisks.flatMap((disk) => disk.partitions ?? []);
}

function diskRows(page: Page) {
  return page.locator('.el-table__body-wrapper .el-table__row');
}

async function expectDiskRows(page: Page, partitions: DiskRecord[]): Promise<void> {
  const rows = diskRows(page);
  await expect(rows).toHaveCount(partitions.length);
  for (let index = 0; index < partitions.length; index += 1) {
    const rowText = (await rows.nth(index).innerText()).replace(/\s+/g, ' ');
    const partition = partitions[index];
    for (const value of [
      partition.device.replace(/^\/dev\//, ''),
      partition.size,
      partition.used,
      partition.avail,
      `${partition.usePercent}%`,
      partition.mountPoint,
      partition.filesystem,
    ]) {
      expect(rowText).toContain(value);
    }
  }
}

async function routeInventory(page: Page, inventory: DiskInventory): Promise<void> {
  await page.route(`**${DISKS_PATH}`, (route) =>
    route.fulfill({ json: { code: 200, data: inventory, message: '' } }),
  );
}

test.describe('System > Disk inventory [H,F,R,P,C,A]', () => {
  test('maps every live system partition to one complete row and reloads', async ({
    page,
  }) => {
    const response = diskResponse(page);
    await page.goto('/hosts/disk');
    const inventory = await readInventory(await response);
    expect(inventory.totalDisks).toBeGreaterThanOrEqual(inventory.systemDisks.length);
    expect(inventory.totalCapacity).toBeGreaterThanOrEqual(0);
    for (const header of HEADERS) {
      await expect(
        page.getByRole('columnheader', { name: header, exact: true }),
      ).toBeVisible();
    }
    await expectDiskRows(page, displayedPartitions(inventory));

    const reloaded = diskResponse(page);
    await page.reload();
    await expectDiskRows(page, displayedPartitions(await readInventory(await reloaded)));
  });

  test('renders deterministic multiple partitions with complete storage fields', async ({
    page,
  }) => {
    await routeInventory(page, SAFE_INVENTORY);
    await page.goto('/hosts/disk');
    await expectDiskRows(page, PARTITIONS);
  });

  test('renders a successful empty disk inventory', async ({ page }) => {
    await routeInventory(page, {
      disks: [],
      systemDisks: [],
      totalCapacity: 0,
      totalDisks: 0,
      unpartitionedDisks: [],
    });
    await page.goto('/hosts/disk');
    await expect(diskRows(page)).toHaveCount(0);
  });

  test('shows retrieval failure feedback and recovers on reload', async ({ page }) => {
    let unavailable = true;
    let attempts = 0;
    await page.route(`**${DISKS_PATH}`, (route) => {
      attempts += 1;
      return route.fulfill({
        json: unavailable
          ? { code: 500, data: null, message: 'kneo-e2e disk inventory unavailable' }
          : { code: 200, data: SAFE_INVENTORY, message: '' },
      });
    });

    await page.goto('/hosts/disk');
    await expect(page.getByRole('alert')).toContainText(
      'kneo-e2e disk inventory unavailable',
    );
    await expect(diskRows(page)).toHaveCount(0);

    unavailable = false;
    const retried = diskResponse(page);
    await page.reload();
    await readInventory(await retried);
    await expectDiskRows(page, PARTITIONS);
    expect(attempts).toBe(2);
  });
});
