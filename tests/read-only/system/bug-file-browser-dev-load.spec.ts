import type { Page, Response } from '@playwright/test';

import { test, expect } from '../../fixtures/read-only-test';

interface ApiEnvelope<T> {
  code: number;
  data: T;
  message: string;
}

interface FileListing {
  itemTotal: number;
}

const SEARCH_PATH = '/api/v2/files/search';
const DEV_RESPONSE_TIMEOUT_MS = 30_000;

function waitForListing(
  page: Page,
  path: string,
  timeout = 30_000,
): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === SEARCH_PATH &&
      response.request().postDataJSON()?.path === path,
    { timeout },
  );
}

function fileRow(page: Page, name: string) {
  return page
    .locator('[role="tabpanel"]:visible')
    .last()
    .getByRole('row')
    .filter({ has: page.getByText(name, { exact: true }) });
}

test('loads /dev without leaving the File Browser blocked', async ({ page }) => {
  test.setTimeout(DEV_RESPONSE_TIMEOUT_MS + 60_000);
  test.info().annotations.push({
    type: 'bug-report',
    description:
      'docs/bugs/2026-10-06/verified-ui-bugs-10-06-2026.md#32-opening-dev-hangs-until-the-request-times-out',
  });

  const rootResponse = waitForListing(page, '/');
  await page.goto('/hosts/files');
  await rootResponse;

  const devRequest = page.waitForRequest(
    (request) =>
      request.method() === 'POST' &&
      new URL(request.url()).pathname === SEARCH_PATH &&
      request.postDataJSON()?.path === '/dev',
  );
  const startedAt = performance.now();
  const devResponse = waitForListing(page, '/dev', DEV_RESPONSE_TIMEOUT_MS);
  await fileRow(page, 'dev')
    .getByRole('button', { name: 'Open', exact: true })
    .click();
  await devRequest;

  let response: Response;
  try {
    response = await devResponse;
  } catch (error) {
    test.fail(
      error instanceof Error && error.name === 'TimeoutError',
      'Known defect: the /dev listing request remains pending and blocks the File Browser.',
    );
    throw error;
  }

  const envelope = (await response.json()) as ApiEnvelope<FileListing>;
  console.log(
    JSON.stringify({
      applicationCode: envelope.code,
      elapsedMs: Math.round(performance.now() - startedAt),
      httpStatus: response.status(),
      message: envelope.message,
    }),
  );
  const requestTimedOut = envelope.message === 'Request timed out, try again later';
  if (requestTimedOut) {
    await expect(page.getByText(envelope.message, { exact: true })).toBeVisible();
  }
  test.fail(
    requestTimedOut,
    'Known defect: opening /dev eventually returns a request-timeout error.',
  );
  expect(response.ok()).toBe(true);
  expect(envelope.code, envelope.message).toBe(200);
  await expect(
    page
      .locator('[role="tabpanel"]:visible')
      .last()
      .getByText(`Total ${envelope.data.itemTotal}`, { exact: true }),
  ).toBeVisible();
});
