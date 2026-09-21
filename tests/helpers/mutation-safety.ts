import { randomUUID } from 'node:crypto';

const RESOURCE_PREFIX = 'kneo-e2e';

export type ExactResourceId = string | number;

export function uniqueResourceName(label: string): string {
  const safeLabel = label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return `${RESOURCE_PREFIX}-${safeLabel}-${Date.now()}-${randomUUID().slice(0, 8)}`;
}

export function requireExactResourceId(id: unknown): ExactResourceId {
  if (typeof id === 'number' && Number.isInteger(id) && id >= 0) {
    return id;
  }

  if (typeof id === 'string' && id.trim() !== '') {
    return id;
  }

  throw new Error('Cleanup requires an exact non-empty resource ID.');
}
