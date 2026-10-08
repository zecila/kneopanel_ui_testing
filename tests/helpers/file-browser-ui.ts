import path from 'node:path';

import type { Locator, Page, Response } from '@playwright/test';

import type {
  FileMutationRegistry,
  TrackedFile,
} from '../fixtures/file-mutating-test';

const SEARCH_PATH = '/api/v2/files/search';

export function visibleFilePanel(page: Page): Locator {
  return page.locator('[role="tabpanel"]:visible').last();
}

export function fileRow(page: Page, name: string): Locator {
  const panel = visibleFilePanel(page);
  return panel.getByRole('row').filter({
    has: page.getByText(name, { exact: true }),
  });
}

async function requireSuccessfulResponse(
  response: Response,
  action: string,
): Promise<void> {
  if (!response.ok()) {
    throw new Error(`${action} failed with HTTP ${response.status()}.`);
  }
  const envelope = (await response.json()) as { code: number; message: string };
  if (envelope.code !== 200) {
    throw new Error(`${action} failed: ${envelope.message}`);
  }
}

export async function openFileAction(
  page: Page,
  fileName: string,
  action: 'Delete' | 'Rename',
): Promise<Locator> {
  await fileRow(page, fileName)
    .locator('.fu-table-operations__dropdown-trigger')
    .click();
  await page
    .locator('.el-dropdown-menu:visible')
    .last()
    .getByText(action, { exact: true })
    .click();
  return page.getByRole('dialog');
}

export async function createFileThroughUi(
  page: Page,
  registry: FileMutationRegistry,
  parent: string,
  name: string,
): Promise<TrackedFile> {
  const exactPath = path.posix.join(parent, name);
  await registry.prepare(exactPath, false);
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await page
    .locator('.el-dropdown-menu:visible')
    .last()
    .getByText('File Browser', { exact: true })
    .click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name', { exact: true }).fill(name);

  const created = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/api/v2/files',
  );
  await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
  const response = await created;
  await requireSuccessfulResponse(response, 'File creation');
  const body = response.request().postDataJSON();
  if (
    body?.path !== exactPath ||
    body?.name !== name ||
    body?.isDir !== false ||
    body?.isLink !== false ||
    body?.isSymlink !== true ||
    body?.linkPath !== ''
  ) {
    throw new Error('File creation targeted an unexpected path or type.');
  }

  return registry.capture(exactPath);
}

export async function selectFileClipboardAction(
  page: Page,
  fileName: string,
  action: 'Copy' | 'Move',
): Promise<void> {
  await fileRow(page, fileName)
    .locator('.fu-table-operations__dropdown-trigger')
    .click();
  await page
    .locator('.el-dropdown-menu:visible')
    .last()
    .getByText(action, { exact: true })
    .first()
    .click();
}

export async function pasteSingleFileThroughUi(
  page: Page,
  sourcePath: string,
  destinationDirectory: string,
  type: 'copy' | 'cut',
): Promise<void> {
  const destinationPath = path.posix.join(
    destinationDirectory,
    path.posix.basename(sourcePath),
  );
  const checked = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/api/v2/files/check' &&
      response.request().postDataJSON()?.path === destinationPath,
  );
  const moved = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/api/v2/files/move',
  );
  await page.getByRole('button', { name: 'Paste(1)', exact: true }).click();

  const checkResponse = await checked;
  await requireSuccessfulResponse(checkResponse, 'Destination collision check');
  const checkEnvelope = (await checkResponse.json()) as { data: boolean };
  if (checkEnvelope.data !== false) {
    throw new Error(`Destination unexpectedly exists: ${destinationPath}`);
  }
  const checkBody = checkResponse.request().postDataJSON();
  if (checkBody?.path !== destinationPath || checkBody?.withInit !== false) {
    throw new Error('File collision check targeted an unexpected path.');
  }

  const moveResponse = await moved;
  await requireSuccessfulResponse(
    moveResponse,
    type === 'copy' ? 'File copy' : 'File move',
  );
  const body = moveResponse.request().postDataJSON();
  if (
    JSON.stringify(body?.oldPaths) !== JSON.stringify([sourcePath]) ||
    body?.newPath !== destinationDirectory ||
    body?.type !== type ||
    body?.name !== '' ||
    JSON.stringify(body?.allNames) !== '[]' ||
    body?.isDir !== false ||
    body?.cover !== false ||
    JSON.stringify(body?.coverPaths) !== '[]'
  ) {
    throw new Error('File clipboard operation sent an unexpected payload.');
  }
}

export async function openUploadDialog(page: Page): Promise<Locator> {
  await page
    .getByRole('button', { name: 'Upload/Download', exact: true })
    .click();
  await page
    .locator('.el-dropdown-menu:visible')
    .last()
    .getByText('Upload', { exact: true })
    .click();
  return page.getByRole('dialog');
}

export async function uploadFileThroughUi(
  page: Page,
  registry: FileMutationRegistry,
  parent: string,
  file: { buffer: Buffer; mimeType: string; name: string },
): Promise<TrackedFile> {
  const exactPath = path.posix.join(parent, file.name);
  await registry.prepare(exactPath, false);
  const dialog = await openUploadDialog(page);
  await dialog.locator('input[type="file"]').setInputFiles(file);

  const preflight = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/api/v2/files/batch/check',
  );
  const uploaded = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/api/v2/files/upload',
  );
  await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
  await requireSuccessfulResponse(await preflight, 'Upload preflight');
  await requireSuccessfulResponse(await uploaded, 'File upload');

  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  return registry.capture(exactPath);
}

export async function openTmpDirectory(page: Page): Promise<void> {
  const initialListing = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === SEARCH_PATH,
  );
  await page.goto('/hosts/files');
  const initialPath = (await initialListing).request().postDataJSON()?.path;
  if (initialPath === '/tmp') {
    return;
  }
  if (initialPath !== '/') {
    throw new Error(`File Browser opened an unexpected path: ${initialPath}`);
  }

  const tmpListing = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === SEARCH_PATH &&
      response.request().postDataJSON()?.path === '/tmp',
  );
  await fileRow(page, 'tmp')
    .getByRole('button', { name: 'Open', exact: true })
    .click();
  await tmpListing;
}

export async function openDirectory(
  page: Page,
  name: string,
  exactPath: string,
): Promise<void> {
  const listing = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === SEARCH_PATH &&
      response.request().postDataJSON()?.path === exactPath,
  );
  await fileRow(page, name)
    .getByRole('button', { name: 'Open', exact: true })
    .click();
  await listing;
}

export async function createFolderThroughUi(
  page: Page,
  registry: FileMutationRegistry,
  parent: string,
  name: string,
): Promise<TrackedFile> {
  const exactPath = path.posix.join(parent, name);
  await registry.prepare(exactPath, true);
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  const menu = page.locator('.el-dropdown-menu:visible').last();
  await menu.getByText('Folder', { exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name', { exact: true }).fill(name);

  const created = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/api/v2/files',
  );
  await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
  const response = await created;
  if (!response.ok()) {
    throw new Error(`Creating folder failed with HTTP ${response.status()}.`);
  }
  const envelope = (await response.json()) as { code: number; message: string };
  if (envelope.code !== 200) {
    throw new Error(`Creating folder failed: ${envelope.message}`);
  }
  const body = response.request().postDataJSON();
  if (body?.path !== exactPath || body?.isDir !== true) {
    throw new Error(`Folder creation targeted an unexpected path.`);
  }

  return registry.capture(exactPath);
}
