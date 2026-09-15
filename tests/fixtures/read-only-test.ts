import { test as base, expect, type Request } from '@playwright/test';

import { BASE_URL } from '../helpers/environment';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const APP_ORIGIN = new URL(BASE_URL).origin;

// KneoPanel uses POST for these retrieval-only list/search operations.
const REVIEWED_READ_ONLY_POST_PATHS: readonly RegExp[] = [
  /^\/api\/v2\/core\/nodes\/list$/,
  /^\/api\/v2\/core\/settings\/search$/,
  /^\/api\/v2\/settings\/search$/,
];

function isAllowed(request: Request): boolean {
  if (SAFE_METHODS.has(request.method())) {
    return true;
  }

  if (request.method() !== 'POST') {
    return false;
  }

  const url = new URL(request.url());
  return (
    url.origin === APP_ORIGIN &&
    REVIEWED_READ_ONLY_POST_PATHS.some((pattern) => pattern.test(url.pathname))
  );
}

function reportableUrl(requestUrl: string): string {
  const url = new URL(requestUrl);
  return `${url.origin}${url.pathname}`;
}

export const test = base.extend({
  context: async ({ context }, use, testInfo) => {
    const blockedRequests: Array<{ method: string; url: string }> = [];

    await context.route('**/*', async (route) => {
      const request = route.request();

      if (isAllowed(request)) {
        await route.continue();
        return;
      }

      blockedRequests.push({
        method: request.method(),
        url: reportableUrl(request.url()),
      });
      await route.abort('blockedbyclient');
    });

    await use(context);

    if (blockedRequests.length > 0) {
      await testInfo.attach('blocked-write-requests.json', {
        body: Buffer.from(JSON.stringify(blockedRequests, null, 2)),
        contentType: 'application/json',
      });

      const summary = blockedRequests
        .map(({ method, url }) => `${method} ${url}`)
        .join('\n');

      throw new Error(
        `The read-only guard blocked ${blockedRequests.length} request(s):\n${summary}`,
      );
    }
  },
});

export { expect };
