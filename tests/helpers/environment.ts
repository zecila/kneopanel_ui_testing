import path from 'node:path';

function requireEnvironmentValue(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(
      `Missing ${name}. Add it to the ignored .env file or export it in your shell.`,
    );
  }

  return value;
}

function requireBaseUrl(): string {
  const value = requireEnvironmentValue('KNEO_BASE_URL').replace(/\/$/, '');

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('KNEO_BASE_URL must be an absolute HTTP(S) URL.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('KNEO_BASE_URL must be an absolute HTTP(S) URL.');
  }

  return value;
}

export const BASE_URL = requireBaseUrl();

export const SECURITY_ENTRANCE = requireEnvironmentValue(
  'KNEO_SECURITY_ENTRANCE',
);

export const AUTH_STATE_PATH = path.join(
  process.cwd(),
  'playwright',
  '.auth',
  'admin.json',
);

export function requireSecret(name: string): string {
  return requireEnvironmentValue(name);
}
