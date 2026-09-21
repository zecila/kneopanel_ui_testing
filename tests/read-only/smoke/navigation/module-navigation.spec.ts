import { test, expect } from '../../../fixtures/read-only-test';

const DIRECT_DESTINATIONS = [
  { name: 'Containers', path: /\/containers\/dashboard(?:[/?#]|$)/ },
  { name: 'Terminals', path: /\/terminal(?:[/?#]|$)/ },
  { name: 'Toolbox', path: /\/toolbox\/device(?:[/?#]|$)/ },
  { name: 'Logs', path: /\/logs\/operation(?:[/?#]|$)/ },
] as const;

const SYSTEM_DESTINATIONS = [
  { name: 'File Browser', path: /\/hosts\/files(?:[/?#]|$)/ },
  { name: 'Monitoring', path: /\/hosts\/monitor\/monitor(?:[/?#]|$)/ },
  { name: 'Firewall', path: /\/hosts\/firewall\/port(?:[/?#]|$)/ },
  { name: 'SSH Settings', path: /\/hosts\/ssh\/ssh(?:[/?#]|$)/ },
] as const;

const AI_DESTINATIONS = [
  { name: 'Kneo Apps', path: /\/ai\/apps(?:[/?#]|$)/ },
  { name: 'MCP', path: /\/ai\/mcp(?:[/?#]|$)/ },
] as const;

test.describe('Main module navigation', () => {
  for (const destination of DIRECT_DESTINATIONS) {
    test(`opens ${destination.name}`, async ({ page }) => {
      await page.goto('/');
      const menuItem = page.getByRole('menuitem', {
        name: destination.name,
        exact: true,
      });
      await menuItem.click();

      await expect(page).toHaveURL(destination.path);
      await expect(menuItem).toHaveClass(/is-active/);
    });
  }

  for (const destination of SYSTEM_DESTINATIONS) {
    test(`opens System > ${destination.name}`, async ({ page }) => {
      await page.goto('/');
      await page.getByRole('menuitem', { name: 'System', exact: true }).click();
      const menuItem = page.getByRole('menuitem', {
        name: destination.name,
        exact: true,
      });
      await menuItem.click();

      await expect(page).toHaveURL(destination.path);
      await expect(menuItem).toHaveClass(/is-active/);
    });
  }

  for (const destination of AI_DESTINATIONS) {
    test(`opens AI > ${destination.name}`, async ({ page }) => {
      await page.goto('/');
      if (destination.name === 'Kneo Apps') {
        await page.route('**/api/v2/kneo-apps/rescan', (route) =>
          route.abort('blockedbyclient'),
        );
      }
      await page.getByRole('menuitem', { name: 'AI', exact: true }).click();
      const menuItem = page.getByRole('menuitem', {
        name: destination.name,
        exact: true,
      });
      await menuItem.click();

      await expect(page).toHaveURL(destination.path);
      await expect(menuItem).toHaveClass(/is-active/);
    });
  }
});
