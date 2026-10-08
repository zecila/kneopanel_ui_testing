import type { Page, Request } from '@playwright/test';

import { test, expect } from '../../fixtures/read-only-test';

interface TrafficRule {
  key: string;
  value: string;
}

const LOAD_PATH = '/api/v2/core/settings/kis/ssh/traffic-control/load';
const APPLY_PATH = '/api/v2/core/settings/kis/ssh/traffic-control/apply';
const RESTART_PATH = '/api/v2/core/settings/kis/ssh/traffic-control/restart';

const RULES: TrafficRule[] = [
  { key: 'admin-load', value: '17r/s/ip' },
  { key: 'chat-responses', value: '23r/s/ip' },
  { key: 'embeddings-score', value: '29r/s/ip' },
  { key: 'inference', value: '31r/s/ip' },
  { key: 'models', value: '37r/s/ip' },
  { key: 'admin-files', value: '41r/s/ip' },
  { key: 'health', value: '43r/s/ip' },
  { key: 'metrics', value: '47r/s/ip' },
  { key: 'location', value: '53r/s/ip' },
];

function body(request: Request): unknown {
  return request.postDataJSON() as unknown;
}

async function routeLoad(page: Page, rules: () => TrafficRule[]): Promise<void> {
  await page.route(`**${LOAD_PATH}`, async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      json: { code: 200, data: { rules: rules() }, message: '' },
      status: 200,
    });
  });
}

test.describe('KIS Traffic Control compatibility [H,V,F,R,A]', () => {
  test('maps every path group and loaded limit to the UI', async ({ page }) => {
    await routeLoad(page, () => RULES);
    await page.goto('/ai/kis/traffic-control');

    for (const path of [
      '/admin/load',
      '/admin/unload',
      '/v1/chat/completions',
      '/v1/responses',
      '/v1/embeddings',
      '/v1/score',
      '/inference',
      '/models',
      '/instances',
      '/model_names',
      '/admin/files/*',
      '/health',
      '/metrics',
      '/',
    ]) {
      await expect(page.getByText(path, { exact: true }).first()).toBeVisible();
    }

    const inputs = page.locator('.traffic-control-rate-input input');
    await expect(inputs).toHaveCount(RULES.length);
    for (let index = 0; index < RULES.length; index += 1) {
      await expect(inputs.nth(index)).toHaveValue(
        RULES[index].value.replace('r/s/ip', ''),
      );
    }
  });

  test('restores defaults locally without applying them', async ({ page }) => {
    await routeLoad(page, () => RULES);
    let applyRequests = 0;
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === APPLY_PATH) applyRequests += 1;
    });
    await page.goto('/ai/kis/traffic-control');

    await page.getByRole('button', { name: 'Default', exact: true }).click();
    const inputs = page.locator('.traffic-control-rate-input input');
    await expect(inputs.first()).toHaveValue('5000');
    await expect(inputs.nth(1)).toHaveValue('10000');
    expect(applyRequests).toBe(0);
  });

  test('applies exact integer limits and defers the nginx restart', async ({
    page,
  }) => {
    await routeLoad(page, () => RULES);
    let applied: unknown;
    let restartRequests = 0;
    await page.route(`**${APPLY_PATH}`, async (route) => {
      applied = body(route.request());
      await route.fulfill({
        contentType: 'application/json',
        json: { code: 200, data: {}, message: '' },
        status: 200,
      });
    });
    await page.route(`**${RESTART_PATH}`, async (route) => {
      restartRequests += 1;
      await route.fulfill({
        contentType: 'application/json',
        json: { code: 200, data: {}, message: '' },
        status: 200,
      });
    });
    await page.goto('/ai/kis/traffic-control');

    const first = page.locator('.traffic-control-rate-input input').first();
    await first.fill('61');
    await page.getByRole('button', { name: 'Apply', exact: true }).click();
    const prompt = page.locator('.el-message-box:visible');
    await expect(prompt).toContainText(/restart/i);
    await prompt
      .getByRole('button', { name: 'Restart manually later', exact: true })
      .click();

    expect(applied).toEqual({
      rules: [
        { key: 'admin-load', value: '61r/s/ip' },
        ...RULES.slice(1),
      ],
    });
    expect(restartRequests).toBe(0);
  });

  test('retries a failed load and then uses the recovered limits', async ({
    page,
  }) => {
    let attempts = 0;
    await page.route(`**${LOAD_PATH}`, async (route) => {
      attempts += 1;
      await route.fulfill({
        contentType: 'application/json',
        json:
          attempts === 1
            ? {
                code: 500,
                data: null,
                message: 'kneo-e2e traffic limits unavailable',
              }
            : { code: 200, data: { rules: RULES }, message: '' },
        status: 200,
      });
    });

    await page.goto('/ai/kis/traffic-control');
    await expect(page.getByText(/Failed to load traffic control/).last()).toBeVisible();
    await page.getByRole('button', { name: 'Load current', exact: true }).click();
    expect(attempts).toBe(2);
    await expect(page.locator('.traffic-control-rate-input input').first()).toHaveValue(
      '17',
    );
  });
});
