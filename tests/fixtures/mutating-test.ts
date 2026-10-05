import {
  test as base,
  expect,
  type APIRequestContext,
  type APIResponse,
} from '@playwright/test';

import {
  requireExactResourceId,
  type ExactResourceId,
} from '../helpers/mutation-safety';

export type MutationResourceKind =
  | 'cron-group'
  | 'cron-job'
  | 'script-group'
  | 'script';

export interface MutationResource {
  id: ExactResourceId;
  kind: MutationResourceKind;
  name: string;
}

interface ApiEnvelope<T> {
  code: number;
  data: T;
  message: string;
}

interface ListData<T> {
  items: T[];
  total: number;
}

interface ResourceItem {
  id: unknown;
  name: string;
}

interface PendingCapture {
  kind: MutationResourceKind;
  name: string;
}

interface SettingRestoration {
  key: string;
  value: unknown;
}

const API_ROOT = '/api/v2';

async function readEnvelope<T>(response: APIResponse): Promise<ApiEnvelope<T>> {
  if (!response.ok()) {
    throw new Error(
      `KneoPanel API request failed with HTTP ${response.status()}: ${response.url()}`,
    );
  }

  return (await response.json()) as ApiEnvelope<T>;
}

function idsMatch(left: unknown, right: ExactResourceId): boolean {
  return String(left) === String(right);
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function listResources(
  request: APIRequestContext,
  headers: Record<string, string>,
  kind: MutationResourceKind,
  name: string,
): Promise<ResourceItem[]> {
  if (kind === 'cron-group' || kind === 'script-group') {
    const response = await request.post(`${API_ROOT}/core/groups/search`, {
      data: { type: kind === 'cron-group' ? 'cronjob' : 'script' },
      headers,
    });
    const envelope = await readEnvelope<ResourceItem[]>(response);
    return envelope.data ?? [];
  }

  if (kind === 'cron-job') {
    const response = await request.post(`${API_ROOT}/cronjobs/search`, {
      data: {
        info: name,
        order: 'null',
        orderBy: 'createdAt',
        page: 1,
        pageSize: 100,
      },
      headers,
    });
    const envelope = await readEnvelope<ListData<ResourceItem>>(response);
    return envelope.data?.items ?? [];
  }

  const response = await request.post(`${API_ROOT}/core/script/search`, {
    data: { groupID: 0, info: name, page: 1, pageSize: 100 },
    headers,
  });
  const envelope = await readEnvelope<ListData<ResourceItem>>(response);
  return envelope.data?.items ?? [];
}

async function findExactResources(
  request: APIRequestContext,
  headers: Record<string, string>,
  kind: MutationResourceKind,
  name: string,
): Promise<ResourceItem[]> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const matches = (await listResources(request, headers, kind, name)).filter(
      (item) => item.name === name,
    );

    if (matches.length > 0 || attempt === 4) {
      return matches;
    }

    await delay(200);
  }

  return [];
}

async function deleteResource(
  request: APIRequestContext,
  headers: Record<string, string>,
  resource: MutationResource,
): Promise<void> {
  const id = requireExactResourceId(resource.id);

  switch (resource.kind) {
    case 'cron-group':
    case 'script-group':
      await request.post(`${API_ROOT}/core/groups/del`, {
        data: { id },
        headers,
      });
      break;
    case 'cron-job':
      await request.post(`${API_ROOT}/cronjobs/del`, {
        data: {
          cleanData: false,
          cleanRemoteData: false,
          ids: [id],
        },
        headers,
      });
      break;
    case 'script':
      await request.post(`${API_ROOT}/core/script/del`, {
        data: { ids: [id] },
        headers,
      });
      break;
  }
}

export class MutationRegistry {
  private readonly pendingCaptures: PendingCapture[] = [];
  private readonly resources: MutationResource[] = [];
  private readonly settingRestorations = new Map<string, SettingRestoration>();

  constructor(
    private readonly request: APIRequestContext,
    private readonly headers: Record<string, string>,
  ) {}

  async prepare(kind: MutationResourceKind, name: string): Promise<void> {
    const alreadyTracked = this.pendingCaptures.some(
      (pending) => pending.kind === kind && pending.name === name,
    );

    if (alreadyTracked) {
      return;
    }

    const existing = await findExactResources(
      this.request,
      this.headers,
      kind,
      name,
    );
    if (existing.length > 0) {
      throw new Error(
        `Refusing to create ${kind} ${name}: an exact-name resource already exists.`,
      );
    }

    this.pendingCaptures.push({ kind, name });
  }

  async capture(
    kind: MutationResourceKind,
    name: string,
  ): Promise<MutationResource> {
    let pending = this.pendingCaptures.find(
      (candidate) => candidate.kind === kind && candidate.name === name,
    );
    if (!pending) {
      pending = { kind, name };
      this.pendingCaptures.push(pending);
    }
    const exactMatches = await findExactResources(
      this.request,
      this.headers,
      kind,
      name,
    );

    if (exactMatches.length !== 1) {
      throw new Error(
        `Expected exactly one ${kind} named ${name}, found ${exactMatches.length}.`,
      );
    }

    const resource: MutationResource = {
      id: requireExactResourceId(exactMatches[0].id),
      kind,
      name,
    };
    this.resources.push(resource);
    this.releasePending(pending);
    return resource;
  }

  rename(resource: MutationResource, name: string): void {
    resource.name = name;
  }

  trackSettingRestoration(key: string, value: unknown): void {
    if (!this.settingRestorations.has(key)) {
      this.settingRestorations.set(key, { key, value });
    }
  }

  confirmSettingRestored(key: string): void {
    this.settingRestorations.delete(key);
  }

  async confirmDeleted(resource: MutationResource): Promise<void> {
    const stillExists = (
      await listResources(
        this.request,
        this.headers,
        resource.kind,
        resource.name,
      )
    ).some((item) => idsMatch(item.id, resource.id));

    if (stillExists) {
      throw new Error(
        `${resource.kind} ${resource.id} still exists after deletion.`,
      );
    }

    this.release(resource);
  }

  async cleanup(): Promise<void> {
    const failures: string[] = [];

    for (const restoration of this.settingRestorations.values()) {
      try {
        const envelope = await readEnvelope<unknown>(
          await this.request.post(`${API_ROOT}/core/settings/update`, {
            data: restoration,
            headers: this.headers,
          }),
        );
        if (envelope.code !== 200) {
          throw new Error(
            `KneoPanel returned code ${envelope.code}: ${envelope.message}`,
          );
        }
        this.settingRestorations.delete(restoration.key);
      } catch (error) {
        failures.push(`setting ${restoration.key}: ${String(error)}`);
      }
    }

    for (const pending of [...this.pendingCaptures]) {
      try {
        const exactMatches = await findExactResources(
          this.request,
          this.headers,
          pending.kind,
          pending.name,
        );

        if (exactMatches.length === 0) {
          this.releasePending(pending);
        } else if (exactMatches.length === 1) {
          this.resources.push({
            id: requireExactResourceId(exactMatches[0].id),
            kind: pending.kind,
            name: pending.name,
          });
          this.releasePending(pending);
        } else {
          failures.push(
            `pending ${pending.kind} ${pending.name}: found ${exactMatches.length} exact matches`,
          );
        }
      } catch (error) {
        failures.push(
          `pending ${pending.kind} ${pending.name}: ${String(error)}`,
        );
      }
    }

    for (const resource of [...this.resources].reverse()) {
      try {
        await deleteResource(this.request, this.headers, resource);
        const stillExists = (
          await listResources(
            this.request,
            this.headers,
            resource.kind,
            resource.name,
          )
        ).some((item) => idsMatch(item.id, resource.id));

        if (stillExists) {
          failures.push(
            `${resource.kind} ${resource.id} (${resource.name}) still exists`,
          );
        } else {
          this.release(resource);
        }
      } catch (error) {
        failures.push(
          `${resource.kind} ${resource.id} (${resource.name}): ${String(error)}`,
        );
      }
    }

    if (failures.length > 0) {
      throw new Error(`Mutation cleanup failed:\n${failures.join('\n')}`);
    }
  }

  private release(resource: MutationResource): void {
    const index = this.resources.indexOf(resource);
    if (index !== -1) {
      this.resources.splice(index, 1);
    }
  }

  private releasePending(pending: PendingCapture): void {
    const index = this.pendingCaptures.indexOf(pending);
    if (index !== -1) {
      this.pendingCaptures.splice(index, 1);
    }
  }
}

interface MutatingFixtures {
  mutationRegistry: MutationRegistry;
}

export const test = base.extend<MutatingFixtures>({
  mutationRegistry: async ({ context, page }, use, testInfo) => {
    const authenticatedRequest = page.waitForRequest(
      (request) =>
        request.method() === 'POST' &&
        new URL(request.url()).pathname === '/api/v2/cronjobs/search',
    );
    await page.goto('/cronjobs/cronjob');
    const browserRequest = await authenticatedRequest;
    const browserHeaders = await browserRequest.allHeaders();
    const csrfToken = browserHeaders['x-csrf-token'];
    const currentNode = browserHeaders.currentnode;

    if (!csrfToken || !currentNode) {
      throw new Error(
        'Could not capture KneoPanel CSRF and node headers for mutation cleanup.',
      );
    }

    const registry = new MutationRegistry(context.request, {
      currentnode: currentNode,
      'x-csrf-token': csrfToken,
    });
    await use(registry);
    try {
      await registry.cleanup();
    } catch (error) {
      // Cleanup failures must fail even when the test observed a known defect.
      testInfo.expectedStatus = 'passed';
      throw error;
    }
  },
});

export { expect };
