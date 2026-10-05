import { test, expect } from '../../fixtures/read-only-test';

test('uses grammatically correct SSH port copy', async ({ page }) => {
  test.info().annotations.push({
    type: 'bug-report',
    description:
      'docs/bugs/2026-09-15/verified-ui-bugs-9-15-2026.md#18-ssh-port-explanation-contains-a-typo',
  });

  await page.goto('/hosts/ssh/ssh');
  const row = page.locator('.el-form-item').filter({
    has: page.getByText('Port', { exact: true }),
  });
  await expect(row).toBeVisible();
  const usesCorrectCopy = (await row.innerText()).includes(
    'Specify the port that SSH service listens on.',
  );
  test.fail(
    !usesCorrectCopy,
    'Known defect: the SSH port explanation starts with Specific.',
  );
  expect(usesCorrectCopy).toBe(true);
});
