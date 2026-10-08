import path from 'node:path';

import {
  test as base,
  expect,
  type APIRequestContext,
  type APIResponse,
} from '@playwright/test';

interface ApiEnvelope<T> {
  code: number;
  data: T;
  message: string;
}

interface FileItem {
  isDir: boolean;
  name: string;
  path: string;
}

interface FileListing {
  items: FileItem[];
}

export interface TrackedFile {
  isDir: boolean;
  path: string;
}

const API_ROOT = '/api/v2/files';
const OWNED_ROOT_PREFIX = '/tmp/kneo-e2e-';

async function readEnvelope<T>(response: APIResponse): Promise<ApiEnvelope<T>> {
  if (!response.ok()) {
    throw new Error(
      `KneoPanel file request failed with HTTP ${response.status()}: ${response.url()}`,
    );
  }
  const envelope = (await response.json()) as ApiEnvelope<T>;
  if (envelope.code !== 200) {
    throw new Error(
      `KneoPanel file request returned code ${envelope.code}: ${envelope.message}`,
    );
  }
  return envelope;
}

function requireOwnedPath(candidate: string): string {
  const normalized = path.posix.normalize(candidate);
  if (
    candidate !== normalized ||
    !normalized.startsWith(OWNED_ROOT_PREFIX) ||
    normalized === '/tmp'
  ) {
    throw new Error(
      `File mutation cleanup requires a normalized path under ${OWNED_ROOT_PREFIX}.`,
    );
  }
  return normalized;
}

async function findExactFile(
  request: APIRequestContext,
  headers: Record<string, string>,
  candidate: string,
): Promise<FileItem | undefined> {
  const exactPath = requireOwnedPath(candidate);
  const response = await request.post(`${API_ROOT}/search`, {
    data: {
      containSub: false,
      expand: true,
      page: 1,
      pageSize: 100,
      path: path.posix.dirname(exactPath),
      search: path.posix.basename(exactPath),
      showHidden: true,
      sortBy: 'name',
      sortOrder: 'ascending',
    },
    headers,
  });
  const listing = (await readEnvelope<FileListing>(response)).data;
  return (listing.items ?? []).find((item) => item.path === exactPath);
}

async function permanentlyDelete(
  request: APIRequestContext,
  headers: Record<string, string>,
  resource: TrackedFile,
): Promise<void> {
  if (!(await findExactFile(request, headers, resource.path))) {
    return;
  }

  await readEnvelope<unknown>(
    await request.post(`${API_ROOT}/del`, {
      data: {
        forceDelete: true,
        isDir: resource.isDir,
        path: requireOwnedPath(resource.path),
      },
      headers,
    }),
  );

  if (await findExactFile(request, headers, resource.path)) {
    throw new Error(`Tracked file path still exists: ${resource.path}`);
  }
}

export class FileMutationRegistry {
  private readonly pending: TrackedFile[] = [];
  private readonly resources: TrackedFile[] = [];

  constructor(
    private readonly request: APIRequestContext,
    private readonly headers: Record<string, string>,
  ) {}

  async prepare(candidate: string, isDir: boolean): Promise<void> {
    const exactPath = requireOwnedPath(candidate);
    if (
      this.pending.some((item) => item.path === exactPath) ||
      this.resources.some((item) => item.path === exactPath)
    ) {
      throw new Error(`File path is already tracked: ${exactPath}`);
    }
    if (await findExactFile(this.request, this.headers, exactPath)) {
      throw new Error(`Refusing to overwrite existing file path: ${exactPath}`);
    }
    this.pending.push({ isDir, path: exactPath });
  }

  async capture(candidate: string): Promise<TrackedFile> {
    const exactPath = requireOwnedPath(candidate);
    const pending = this.pending.find((item) => item.path === exactPath);
    if (!pending) {
      throw new Error(`File path was not prepared before creation: ${exactPath}`);
    }
    const item = await findExactFile(this.request, this.headers, exactPath);
    if (!item || item.isDir !== pending.isDir) {
      throw new Error(`Expected exact created file path: ${exactPath}`);
    }
    const resource = { ...pending };
    this.resources.push(resource);
    this.pending.splice(this.pending.indexOf(pending), 1);
    return resource;
  }

  async assertExists(candidate: string, isDir: boolean): Promise<void> {
    const exactPath = requireOwnedPath(candidate);
    const item = await findExactFile(this.request, this.headers, exactPath);
    if (!item || item.isDir !== isDir) {
      throw new Error(`Expected exact file path to exist: ${exactPath}`);
    }
  }

  async exists(candidate: string, isDir: boolean): Promise<boolean> {
    const exactPath = requireOwnedPath(candidate);
    const item = await findExactFile(this.request, this.headers, exactPath);
    return item?.isDir === isDir;
  }

  async assertAbsent(candidate: string): Promise<void> {
    const exactPath = requireOwnedPath(candidate);
    if (await findExactFile(this.request, this.headers, exactPath)) {
      throw new Error(`Expected exact file path to be absent: ${exactPath}`);
    }
  }

  async confirmDeleted(resource: TrackedFile): Promise<void> {
    if (await findExactFile(this.request, this.headers, resource.path)) {
      throw new Error(`Tracked file path still exists: ${resource.path}`);
    }
    const index = this.resources.indexOf(resource);
    if (index < 0) {
      throw new Error(`File path is not tracked: ${resource.path}`);
    }
    this.resources.splice(index, 1);
  }

  async cleanup(): Promise<void> {
    const failures: string[] = [];

    for (const pending of [...this.pending]) {
      try {
        const item = await findExactFile(this.request, this.headers, pending.path);
        if (item) {
          this.resources.push({ isDir: item.isDir, path: item.path });
        }
        this.pending.splice(this.pending.indexOf(pending), 1);
      } catch (error) {
        failures.push(`pending ${pending.path}: ${String(error)}`);
      }
    }

    for (const resource of [...this.resources].reverse()) {
      try {
        await permanentlyDelete(this.request, this.headers, resource);
        this.resources.splice(this.resources.indexOf(resource), 1);
      } catch (error) {
        failures.push(`${resource.path}: ${String(error)}`);
      }
    }

    if (failures.length > 0) {
      throw new Error(`File mutation cleanup failed:\n${failures.join('\n')}`);
    }
  }
}

interface FileMutatingFixtures {
  fileRegistry: FileMutationRegistry;
}

export const test = base.extend<FileMutatingFixtures>({
  fileRegistry: async ({ context, page }, use, testInfo) => {
    const searchRequest = page.waitForRequest(
      (request) =>
        request.method() === 'POST' &&
        new URL(request.url()).pathname === `${API_ROOT}/search`,
    );
    await page.goto('/hosts/files');
    const browserHeaders = await (await searchRequest).allHeaders();
    const csrfToken = browserHeaders['x-csrf-token'];
    const currentNode = browserHeaders.currentnode;
    if (!csrfToken || !currentNode) {
      throw new Error('Could not capture file mutation authentication headers.');
    }

    const registry = new FileMutationRegistry(context.request, {
      currentnode: currentNode,
      'x-csrf-token': csrfToken,
    });
    await use(registry);
    try {
      await registry.cleanup();
    } catch (error) {
      testInfo.expectedStatus = 'passed';
      throw error;
    }
  },
});

export { expect };
