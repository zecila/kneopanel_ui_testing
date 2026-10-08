import type { Page, Response } from '@playwright/test';

import { test, expect } from '../../fixtures/read-only-test';

interface FileItem {
  gid: string;
  group: string;
  isDir: boolean;
  isSymlink: boolean;
  mode: string;
  name: string;
  path: string;
  uid: string;
  user: string;
}

interface FileListing extends FileItem {
  itemTotal: number;
  items: FileItem[];
}

interface ApiEnvelope<T> {
  code: number;
  data: T;
  message: string;
}

const SEARCH_PATH = '/api/v2/files/search';

async function readListing(response: Response): Promise<FileListing> {
  expect(response.ok()).toBe(true);
  const envelope = (await response.json()) as ApiEnvelope<FileListing>;
  expect(envelope.code).toBe(200);
  expect(envelope.message).toBe('');
  return envelope.data;
}

function waitForListing(page: Page, path: string): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === SEARCH_PATH &&
      response.request().postDataJSON()?.path === path,
  );
}

function fileRow(page: Page, name: string) {
  const panel = page.locator('[role="tabpanel"]:visible').last();
  return panel.getByRole('row').filter({
    has: page.getByText(name, { exact: true }),
  });
}

async function renderedFileRows(
  page: Page,
): Promise<Array<{ cells: string[]; nameTokens: string[] }>> {
  const panel = page.locator('[role="tabpanel"]:visible').last();
  return panel
    .locator('.el-table__body-wrapper .el-table__row')
    .evaluateAll((elements) =>
      elements.map((row) => {
        const cells = Array.from(row.querySelectorAll('td'), (cell) =>
          (cell.textContent ?? '').replace(/\s+/g, ' ').trim(),
        );
        const nameCell = row.querySelectorAll('td')[1];
        const nameTokens = [nameCell, ...nameCell.querySelectorAll('*')]
          .map((element) =>
            (element?.textContent ?? '').replace(/\s+/g, ' ').trim(),
          )
          .filter((value, index, values) => value && values.indexOf(value) === index);
        return { cells, nameTokens };
      }),
    );
}

test.describe('System > File Browser > Browsing [H,R,P,A]', () => {
  test('maps the complete root listing and metadata from API to UI', async ({
    page,
  }) => {
    const listingResponse = waitForListing(page, '/');
    await page.goto('/hosts/files');
    const listing = await readListing(await listingResponse);

    expect(listing.path).toBe('/');
    expect(listing.itemTotal).toBe(listing.items.length);
    expect(listing.items.length).toBeGreaterThan(0);

    for (const column of [
      'Name',
      'Permissions',
      'Owner / Group',
      'Size',
      'Modified',
      'Remark',
      'Actions',
    ]) {
      await expect(
        page.getByRole('columnheader', { name: column, exact: true }).first(),
      ).toBeVisible();
    }

    const renderedRows = await renderedFileRows(page);
    expect(renderedRows).toHaveLength(listing.items.length);
    for (const item of listing.items) {
      const matches = renderedRows.filter((row) => row.nameTokens.includes(item.name));
      expect(matches, `Expected one row for ${item.path}`).toHaveLength(1);
      const cells = matches[0].cells;
      expect(cells[2]).toBe(item.mode);
      expect(cells[3]).toBe(
        `${item.user} (${item.uid}) / ${item.group} (${item.gid})`,
      );
      expect(cells.at(-1)).toMatch(item.isDir ? /Open/ : /(Open|Preview)/);
    }

    const directoryCount = listing.items.filter((item) => item.isDir).length;
    const fileCount = listing.items.length - directoryCount;
    const visiblePanel = page.locator('[role="tabpanel"]:visible').last();
    await expect(
      visiblePanel.getByText(`${directoryCount} directories, ${fileCount} files,`, {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      visiblePanel.getByText(`Total ${listing.itemTotal}`, { exact: true }),
    ).toBeVisible();
  });

  test('searches the root and opens /tmp with matching request state', async ({
    page,
  }) => {
    const rootResponse = waitForListing(page, '/');
    await page.goto('/hosts/files');
    await readListing(await rootResponse);

    const filteredResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === SEARCH_PATH &&
        response.request().postDataJSON()?.path === '/' &&
        response.request().postDataJSON()?.search === 'tmp',
    );
    const search = page.getByPlaceholder('Search').first();
    await search.fill('tmp');
    await search.press('Enter');
    const filtered = await readListing(await filteredResponse);
    expect(filtered.items.map((item) => item.path)).toEqual(['/tmp']);
    await expect(fileRow(page, 'tmp')).toHaveCount(1);

    const tmpResponse = waitForListing(page, '/tmp');
    await fileRow(page, 'tmp')
      .getByRole('button', { name: 'Open', exact: true })
      .click();
    const tmpListing = await readListing(await tmpResponse);
    expect(tmpListing.path).toBe('/tmp');
    expect(tmpListing.itemTotal).toBeGreaterThan(0);

    const visiblePanel = page.locator('[role="tabpanel"]:visible').last();
    await expect(visiblePanel.getByText('tmp', { exact: true }).first()).toBeVisible();
    const renderedRows = await renderedFileRows(page);
    for (const item of tmpListing.items.slice(0, 3)) {
      expect(
        renderedRows.some((row) => row.nameTokens.includes(item.name)),
        `Expected one row for ${item.path}`,
      ).toBe(true);
    }
    await expect(
      visiblePanel.getByText(`Total ${tmpListing.itemTotal}`, { exact: true }),
    ).toBeVisible();
  });

  test('keeps the current listing usable when a directory lookup is unavailable', async ({
    page,
  }) => {
    const rootResponse = waitForListing(page, '/');
    await page.goto('/hosts/files');
    await readListing(await rootResponse);

    await page.route(`**${SEARCH_PATH}`, async (route) => {
      const body = route.request().postDataJSON();
      if (body?.path !== '/tmp') {
        await route.continue();
        return;
      }

      await route.fulfill({
        body: JSON.stringify({
          code: 500,
          data: null,
          message: 'kneo-e2e directory unavailable',
        }),
        contentType: 'application/json',
        status: 200,
      });
    });

    await fileRow(page, 'tmp')
      .getByRole('button', { name: 'Open', exact: true })
      .click();
    await expect(page.getByText('kneo-e2e directory unavailable')).toBeVisible();
    await expect(fileRow(page, 'tmp')).toHaveCount(1);
  });

  test('explains that the recycle bin is unavailable when it is disabled', async ({
    page,
  }) => {
    await page.route('**/api/v2/files/recycle/status', async (route) => {
      await route.fulfill({
        body: JSON.stringify({ code: 200, data: 'Disable', message: '' }),
        contentType: 'application/json',
        status: 200,
      });
    });
    await page.route('**/api/v2/files/recycle/search', async (route) => {
      await route.fulfill({
        body: JSON.stringify({
          code: 200,
          data: { items: [], total: 0 },
          message: '',
        }),
        contentType: 'application/json',
        status: 200,
      });
    });

    const rootResponse = waitForListing(page, '/');
    await page.goto('/hosts/files');
    await readListing(await rootResponse);
    const recycleSearch = page.waitForRequest(
      (request) =>
        request.method() === 'POST' &&
        new URL(request.url()).pathname === '/api/v2/files/recycle/search',
    );
    await page
      .getByRole('button', { name: 'Recycle bin', exact: true })
      .click();
    expect((await recycleSearch).postDataJSON()).toEqual({
      page: 1,
      pageSize: 20,
    });
    const recycleDialog = page.getByRole('dialog');
    await expect(
      recycleDialog.getByText('Enable recycle bin', { exact: true }),
    ).toBeVisible();
    await expect(
      recycleDialog.getByText('No Data', { exact: true }),
    ).toBeVisible();
    await expect(
      recycleDialog.getByText('Total 0', { exact: true }),
    ).toBeVisible();
  });
});
