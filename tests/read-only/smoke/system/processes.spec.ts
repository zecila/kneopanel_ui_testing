import { test, expect } from '../../../fixtures/read-only-test';

function isAscending(values: number[]): boolean {
  return values.every((value, index) => index === 0 || values[index - 1] <= value);
}

function isDescending(values: number[]): boolean {
  return values.every((value, index) => index === 0 || values[index - 1] >= value);
}

test.describe('Processes', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/hosts/process/process');
  });

  test('combines and clears process filters', async ({ page }) => {
    const processId = page.getByPlaceholder('Process ID');
    const name = page.getByPlaceholder('Name');
    const owner = page.getByPlaceholder('Owner');
    const detailsButtons = page.getByRole('button', { name: 'View details' });

    await expect(processId).toBeVisible();
    await expect(name).toBeVisible();
    await expect(owner).toBeVisible();
    await expect(detailsButtons.first()).toBeVisible();

    const initialCount = await detailsButtons.count();
    await name.fill('kneo-e2e-process-that-does-not-exist');
    await name.press('Enter');
    await expect(detailsButtons).toHaveCount(0);

    await owner.fill('kneo-e2e-owner-that-does-not-exist');
    await owner.press('Enter');
    await expect(detailsButtons).toHaveCount(0);

    await name.clear();
    await owner.clear();
    await owner.press('Enter');
    await expect(detailsButtons).toHaveCount(initialCount);
  });

  test('opens and closes process details without ending it', async ({ page }) => {
    const details = page.getByRole('button', { name: 'View details' }).first();
    await expect(details).toBeVisible();
    await details.click();

    const descriptions = page.locator('.el-descriptions:visible');
    for (const label of [
      'Name',
      'Status',
      'Process ID',
      'Connections',
      'Owner',
      'Start command',
    ]) {
      await expect(
        descriptions.getByText(label, { exact: true }),
      ).toBeVisible();
    }

    await page
      .locator('.el-drawer:visible')
      .getByText('Back', { exact: true })
      .click();
    await expect(page.getByText('Start command', { exact: true })).toBeHidden();
  });

  test('cycles the Connections sort direction', async ({ page }) => {
    const connections = page.getByRole('columnheader', {
      name: 'Connections',
      exact: true,
    });

    await expect(connections).toBeVisible();
    const processRows = page.getByRole('row').filter({
      has: page.getByRole('button', { name: 'View details' }),
    });
    const readValues = async () =>
      processRows.evaluateAll((rows) =>
        rows.map((row) => {
          const cells = row.querySelectorAll('[role="cell"]');
          return Number(cells[7]?.textContent?.trim());
        }),
      );

    await connections.click();
    await expect.poll(async () => (await readValues()).length).toBeGreaterThan(1);
    const firstValues = await readValues();
    expect(
      isAscending(firstValues) || isDescending(firstValues),
      'The first click should sort Connections in one direction.',
    ).toBe(true);

    await connections.click();
    await expect
      .poll(async () => JSON.stringify(await readValues()))
      .not.toBe(JSON.stringify(firstValues));
    const secondValues = await readValues();
    expect(
      (isAscending(firstValues) && isDescending(secondValues)) ||
        (isDescending(firstValues) && isAscending(secondValues)),
      'The second click should reverse the Connections sort direction.',
    ).toBe(true);
  });
});
