import { test as base, expect, type Request } from '@playwright/test';

import { BASE_URL } from '../helpers/environment';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const APP_ORIGIN = new URL(BASE_URL).origin;

// KneoPanel uses POST for these retrieval-only list/search operations.
const REVIEWED_READ_ONLY_POST_PATHS: readonly RegExp[] = [
  /^\/api\/v2\/ai\/mcp\/search$/,
  /^\/api\/v2\/apps\/installed\/search$/,
  // Legacy container views retrieve per-item resource statistics via POST.
  /^\/api\/v2\/containers\/item\/stats$/,
  /^\/api\/v2\/core\/commands\/search$/,
  /^\/api\/v2\/core\/commands\/tree$/,
  /^\/api\/v2\/core\/nodes\/list$/,
  /^\/api\/v2\/core\/groups\/search$/,
  /^\/api\/v2\/core\/script\/search$/,
  // KIS Models uses POST for status and list lookups that do not change state.
  /^\/api\/v2\/core\/settings\/kis\/instances$/,
  /^\/api\/v2\/core\/settings\/kis\/model\/background\/jobs$/,
  /^\/api\/v2\/core\/settings\/kis\/model\/load\/preflight$/,
  /^\/api\/v2\/core\/settings\/kis\/models\/available$/,
  /^\/api\/v2\/core\/settings\/kis\/models\/loaded$/,
  /^\/api\/v2\/core\/settings\/kis\/ssh\/logs$/,
  // Opens the Provider confirmation after SSH inspection; applying is separate.
  /^\/api\/v2\/core\/settings\/kis\/ssh\/provider\/preflight$/,
  /^\/api\/v2\/core\/settings\/by$/,
  /^\/api\/v2\/core\/settings\/search$/,
  /^\/api\/v2\/core\/settings\/terminal\/search$/,
  /^\/api\/v2\/core\/logs\/login$/,
  /^\/api\/v2\/core\/logs\/operation$/,
  /^\/api\/v2\/containers\/list$/,
  /^\/api\/v2\/containers\/inspect$/,
  /^\/api\/v2\/containers\/search$/,
  /^\/api\/v2\/cronjobs\/search$/,
  /^\/api\/v2\/files\/mount$/,
  // Reads the optional remark associated with each displayed path.
  /^\/api\/v2\/files\/remarks$/,
  /^\/api\/v2\/files\/recycle\/search$/,
  /^\/api\/v2\/files\/read$/,
  /^\/api\/v2\/files\/search$/,
  /^\/api\/v2\/files\/user\/group$/,
  /^\/api\/v2\/groups\/search$/,
  /^\/api\/v2\/hosts\/firewall\/base$/,
  /^\/api\/v2\/hosts\/firewall\/search$/,
  /^\/api\/v2\/hosts\/monitor\/gpu\/search$/,
  /^\/api\/v2\/hosts\/monitor\/search$/,
  /^\/api\/v2\/hosts\/ssh\/log$/,
  /^\/api\/v2\/hosts\/ssh\/search$/,
  /^\/api\/v2\/hosts\/tree$/,
  /^\/api\/v2\/logs\/tasks\/search$/,
  /^\/api\/v2\/process\/listening$/,
  /^\/api\/v2\/settings\/search$/,
  /^\/api\/v2\/settings\/ssh\/check$/,
  /^\/api\/v2\/toolbox\/device\/base$/,
  /^\/api\/v2\/websites\/options$/,
  // Security > Panel SSL reads selectable certificates through a POST list API.
  /^\/api\/v2\/websites\/ssl\/list$/,
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
      // A safety violation must fail even when the test observed a known defect.
      testInfo.expectedStatus = 'passed';
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
