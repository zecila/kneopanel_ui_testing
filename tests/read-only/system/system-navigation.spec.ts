import { test, expect } from '../../fixtures/read-only-test';

const SYSTEM_DESTINATIONS = [
  {
    name: 'Processes',
    path: /\/hosts\/process\/process(?:[/?#]|$)/,
    content: 'View details',
  },
  {
    name: 'Disk',
    path: /\/hosts\/disk(?:[/?#]|$)/,
    content: 'Mount Directory',
  },
] as const;

test.describe('System navigation', () => {
  for (const destination of SYSTEM_DESTINATIONS) {
    test(`opens ${destination.name} from the sidebar`, async ({ page }) => {
      await page.goto('/');

      await page.getByRole('menuitem', { name: 'System', exact: true }).click();
      await page
        .getByRole('menuitem', { name: destination.name, exact: true })
        .click();

      await expect(page).toHaveURL(destination.path);
      await expect(
        page
          .getByRole(
            destination.name === 'Processes' ? 'button' : 'columnheader',
            { name: destination.content, exact: true },
          )
          .first(),
      ).toBeVisible();
    });
  }
});
