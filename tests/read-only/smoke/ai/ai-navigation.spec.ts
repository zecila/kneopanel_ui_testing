import { test, expect } from '../../../fixtures/read-only-test';

const AI_DESTINATIONS = [
  {
    name: 'KIS',
    path: /\/ai\/kis\/nodes(?:[/?#]|$)/,
    content: 'Last Provider Heartbeat',
  },
  {
    name: 'KIS Monitoring',
    path: /\/ai\/kis-monitoring(?:[/?#]|$)/,
  },
  {
    name: 'GPU Monitoring',
    path: /\/ai\/gpu\/current(?:[/?#]|$)/,
    content: 'Driver Version',
  },
] as const;

test.describe('AI navigation', () => {
  for (const destination of AI_DESTINATIONS) {
    test(`opens ${destination.name} from the sidebar`, async ({ page }) => {
      await page.goto('/');

      await page.getByRole('menuitem', { name: 'AI', exact: true }).click();
      await page
        .getByRole('menuitem', { name: destination.name, exact: true })
        .click();

      await expect(page).toHaveURL(destination.path);

      if ('content' in destination) {
        await expect(
          page.getByRole('columnheader', {
            name: destination.content,
            exact: true,
          }),
        ).toBeVisible();
      } else {
        await expect(page.locator('iframe')).toBeVisible();
      }
    });
  }
});
