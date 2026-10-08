import type { Locator, Page, Response } from '@playwright/test';

import { test, expect } from '../../fixtures/mutating-test';
import { createShellCronJobThroughUi } from '../../helpers/cron-ui';
import { uniqueResourceName } from '../../helpers/mutation-safety';

interface ApiEnvelope<T> {
  code: number;
  data: T;
  message: string;
}

const STATUS_PATH = '/api/v2/cronjobs/status';

function cronRow(page: Page, name: string): Locator {
  return page.getByRole('row').filter({ hasText: name });
}

function waitForStatusResponse(
  page: Page,
  id: number | string,
  status: 'Disable' | 'Enable',
): Promise<Response> {
  return page.waitForResponse((response) => {
    if (
      response.request().method() !== 'POST' ||
      new URL(response.url()).pathname !== STATUS_PATH
    ) {
      return false;
    }

    const body = response.request().postDataJSON() as {
      id: number | string;
      status: string;
    };
    return String(body.id) === String(id) && body.status === status;
  });
}

async function selectRow(row: Locator): Promise<void> {
  await row.locator('.el-checkbox').click();
}

async function confirmBulkStatus(
  page: Page,
  status: 'Disable' | 'Enable',
): Promise<void> {
  await page
    .getByRole('button', {
      name: status === 'Disable' ? 'Disable' : 'Enable',
      exact: true,
    })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Change status' });
  await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
}

async function expectSuccessfulStatusResponse(
  response: Response,
  id: number | string,
  status: 'Disable' | 'Enable',
): Promise<void> {
  expect(response.ok()).toBe(true);
  expect(response.request().postDataJSON()).toEqual({ id, status });
  expect((await response.json()) as ApiEnvelope<null>).toEqual({
    code: 200,
    data: null,
    message: 'success',
  });
}

test.describe('Cron bulk status recovery [H,F,R,C,K,A]', () => {
  test('recovers a mixed selection after one bulk status request fails', async ({
    mutationRegistry,
    page,
  }) => {
    test.setTimeout(90_000);
    const firstName = uniqueResourceName('cron-bulk-a');
    const secondName = uniqueResourceName('cron-bulk-b');
    const firstJob = await createShellCronJobThroughUi(
      page,
      mutationRegistry,
      firstName,
    );
    const secondJob = await createShellCronJobThroughUi(
      page,
      mutationRegistry,
      secondName,
    );

    let firstRow = cronRow(page, firstName);
    let secondRow = cronRow(page, secondName);
    await selectRow(firstRow);
    await selectRow(secondRow);

    await page.route(`**${STATUS_PATH}`, async (route) => {
      const body = route.request().postDataJSON() as {
        id: number | string;
        status: string;
      };
      if (
        String(body.id) === String(secondJob.id) &&
        body.status === 'Disable'
      ) {
        await route.fulfill({
          contentType: 'application/json',
          json: {
            code: 500,
            data: null,
            message: 'kneo-e2e status unavailable',
          },
          status: 200,
        });
        return;
      }
      await route.continue();
    });

    const firstDisabled = waitForStatusResponse(page, firstJob.id, 'Disable');
    const secondRejected = waitForStatusResponse(
      page,
      secondJob.id,
      'Disable',
    );
    await confirmBulkStatus(page, 'Disable');
    const [firstDisabledResponse, secondRejectedResponse] = await Promise.all([
      firstDisabled,
      secondRejected,
    ]);
    await expectSuccessfulStatusResponse(
      firstDisabledResponse,
      firstJob.id,
      'Disable',
    );
    expect(secondRejectedResponse.request().postDataJSON()).toEqual({
      id: secondJob.id,
      status: 'Disable',
    });
    expect(
      (await secondRejectedResponse.json()) as ApiEnvelope<null>,
    ).toEqual({
      code: 500,
      data: null,
      message: 'kneo-e2e status unavailable',
    });
    await expect(page.getByText('kneo-e2e status unavailable')).toBeVisible();
    await page.unroute(`**${STATUS_PATH}`);

    await page.reload();
    firstRow = cronRow(page, firstName);
    secondRow = cronRow(page, secondName);
    await expect(
      firstRow.getByRole('button', { name: 'Disabled', exact: true }),
    ).toBeVisible();
    await expect(
      secondRow.getByRole('button', { name: 'Enabled', exact: true }),
    ).toBeVisible();

    await selectRow(secondRow);
    const retried = waitForStatusResponse(page, secondJob.id, 'Disable');
    await confirmBulkStatus(page, 'Disable');
    await expectSuccessfulStatusResponse(
      await retried,
      secondJob.id,
      'Disable',
    );

    await page.reload();
    firstRow = cronRow(page, firstName);
    secondRow = cronRow(page, secondName);
    await expect(
      firstRow.getByRole('button', { name: 'Disabled', exact: true }),
    ).toBeVisible();
    await expect(
      secondRow.getByRole('button', { name: 'Disabled', exact: true }),
    ).toBeVisible();

    await selectRow(firstRow);
    await selectRow(secondRow);
    const firstEnabled = waitForStatusResponse(page, firstJob.id, 'Enable');
    const secondEnabled = waitForStatusResponse(page, secondJob.id, 'Enable');
    await confirmBulkStatus(page, 'Enable');
    const [firstEnabledResponse, secondEnabledResponse] = await Promise.all([
      firstEnabled,
      secondEnabled,
    ]);
    await expectSuccessfulStatusResponse(
      firstEnabledResponse,
      firstJob.id,
      'Enable',
    );
    await expectSuccessfulStatusResponse(
      secondEnabledResponse,
      secondJob.id,
      'Enable',
    );

    await page.reload();
    await expect(
      cronRow(page, firstName).getByRole('button', {
        name: 'Enabled',
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      cronRow(page, secondName).getByRole('button', {
        name: 'Enabled',
        exact: true,
      }),
    ).toBeVisible();
  });
});
