import { test, expect } from '../../fixtures/mutating-test';

interface ApiEnvelope<T> {
  code: number;
  data: T;
  message: string;
}

interface NamedResource {
  name: string;
  path?: string;
}

interface ListData {
  items: NamedResource[];
}

const PREFIX = 'kneo-e2e-';

test('final audit leaves no Playwright mutation resources behind', async ({
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

  const [
    cronGroupsResponse,
    scriptGroupsResponse,
    cronJobsResponse,
    scriptsResponse,
    filesResponse,
  ] =
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
      context.request.post('/api/v2/files/search', {
        data: {
          containSub: false,
          expand: true,
          page: 1,
          pageSize: 100,
          path: '/tmp',
          search: PREFIX,
          showHidden: true,
          sortBy: 'name',
          sortOrder: 'ascending',
        },
        headers,
      }),
    ]);

  const responses = [
    cronGroupsResponse,
    scriptGroupsResponse,
    cronJobsResponse,
    scriptsResponse,
    filesResponse,
  ];
  for (const response of responses) {
    expect(response.ok()).toBe(true);
  }

  const [
    cronGroupsEnvelope,
    scriptGroupsEnvelope,
    cronJobsEnvelope,
    scriptsEnvelope,
    filesEnvelope,
  ] = (await Promise.all(responses.map((response) => response.json()))) as [
      ApiEnvelope<NamedResource[]>,
      ApiEnvelope<NamedResource[]>,
      ApiEnvelope<ListData>,
      ApiEnvelope<ListData>,
      ApiEnvelope<ListData>,
    ];
  for (const envelope of [
    cronGroupsEnvelope,
    scriptGroupsEnvelope,
    cronJobsEnvelope,
    scriptsEnvelope,
    filesEnvelope,
  ]) {
    expect(envelope.code, envelope.message).toBe(200);
  }

  const cronGroups = cronGroupsEnvelope.data;
  const scriptGroups = scriptGroupsEnvelope.data;
  const cronJobs = cronJobsEnvelope.data?.items;
  const scripts = scriptsEnvelope.data?.items;
  const files = filesEnvelope.data?.items;

  const residue = {
    cronGroups: (cronGroups ?? []).filter(({ name }) => name.startsWith(PREFIX))
      .length,
    cronJobs: (cronJobs ?? []).filter(({ name }) => name.startsWith(PREFIX))
      .length,
    filePaths: (files ?? [])
      .filter(({ name }) => name.startsWith(PREFIX))
      .map(({ path }) => path),
    scriptGroups: (scriptGroups ?? []).filter(({ name }) =>
      name.startsWith(PREFIX),
    ).length,
    scripts: (scripts ?? []).filter(({ name }) => name.startsWith(PREFIX)).length,
  };

  expect(residue).toEqual({
    cronGroups: 0,
    cronJobs: 0,
    filePaths: [],
    scriptGroups: 0,
    scripts: 0,
  });
});
