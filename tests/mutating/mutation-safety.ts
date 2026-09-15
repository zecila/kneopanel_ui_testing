import { randomUUID } from 'node:crypto';

const RESOURCE_PREFIX = 'kneo-e2e';

export function uniqueResourceName(label: string): string {
  const safeLabel = label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return `${RESOURCE_PREFIX}-${safeLabel}-${Date.now()}-${randomUUID().slice(0, 8)}`;
}

export function requireExactResourceId(id: unknown): string {
  if (typeof id !== 'string' || id.trim() === '') {
    throw new Error('Cleanup requires the exact non-empty resource ID.');
  }

  return id;
}
