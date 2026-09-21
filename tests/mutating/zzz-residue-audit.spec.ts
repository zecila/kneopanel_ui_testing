import { test, expect } from '../fixtures/mutating-test';

interface ApiEnvelope<T> {
  data: T;
}

interface NamedResource {
  name: string;
}

interface ListData {
  items: NamedResource[];
}

const PREFIX = 'kneo-e2e-';

test('leaves no Playwright mutation resources behind', async ({
  context,
  page,
}) => {
  await page.goto('/');
  const searchRequest = page.waitForRequest(
    (request) =>
      request.method() === 'POST' &&
      new URL(request.url()).pathname === '/api/v2/cronjobs/search',
  );
  await page.goto('/cronjobs/cronjob');
  const browserHeaders = await (await searchRequest).allHeaders();
  const headers = {
    currentnode: browserHeaders.currentnode,
    'x-csrf-token': browserHeaders['x-csrf-token'],
  };

  const [cronGroupsResponse, scriptGroupsResponse, cronJobsResponse, scriptsResponse] =
    await Promise.all([
      context.request.post('/api/v2/core/groups/search', {
        data: { type: 'cronjob' },
        headers,
      }),
      context.request.post('/api/v2/core/groups/search', {
        data: { type: 'script' },
        headers,
      }),
      context.request.post('/api/v2/cronjobs/search', {
        data: {
          info: PREFIX,
          order: 'null',
          orderBy: 'createdAt',
          page: 1,
          pageSize: 100,
        },
        headers,
      }),
      context.request.post('/api/v2/core/script/search', {
        data: { groupID: 0, info: PREFIX, page: 1, pageSize: 100 },
        headers,
      }),
    ]);

  for (const response of [
    cronGroupsResponse,
    scriptGroupsResponse,
    cronJobsResponse,
    scriptsResponse,
  ]) {
    expect(response.ok()).toBe(true);
  }

  const cronGroups = (
    (await cronGroupsResponse.json()) as ApiEnvelope<NamedResource[]>
  ).data;
  const scriptGroups = (
    (await scriptGroupsResponse.json()) as ApiEnvelope<NamedResource[]>
  ).data;
  const cronJobs = (
    (await cronJobsResponse.json()) as ApiEnvelope<ListData>
  ).data?.items;
  const scripts = ((await scriptsResponse.json()) as ApiEnvelope<ListData>).data
    ?.items;

  const residue = {
    cronGroups: (cronGroups ?? []).filter(({ name }) => name.startsWith(PREFIX))
      .length,
    cronJobs: (cronJobs ?? []).filter(({ name }) => name.startsWith(PREFIX))
      .length,
    scriptGroups: (scriptGroups ?? []).filter(({ name }) =>
      name.startsWith(PREFIX),
    ).length,
    scripts: (scripts ?? []).filter(({ name }) => name.startsWith(PREFIX)).length,
  };

  expect(residue).toEqual({
    cronGroups: 0,
    cronJobs: 0,
    scriptGroups: 0,
    scripts: 0,
  });
});
