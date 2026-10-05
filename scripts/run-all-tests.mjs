import 'dotenv/config';

import { spawnSync } from 'node:child_process';
import path from 'node:path';

function requireEnvironmentValue(name) {
  const value = process.env[name]?.trim();

  if (!value) {
    console.error(`The complete test run requires ${name}.`);
    process.exit(1);
  }

  return value.replace(/\/$/, '');
}

function validateOptionalNumber(name, allowZero) {
  const rawValue = process.env[name]?.trim();
  if (!rawValue) return;

  const value = Number(rawValue);
  if (!Number.isFinite(value) || (allowZero ? value < 0 : value <= 0)) {
    console.error(
      `${name} must be ${allowZero ? 'zero or a positive number' : 'a positive number'}.`,
    );
    process.exit(1);
  }
}

if (process.env.ALLOW_MUTATIONS !== 'true') {
  console.error(
    'The complete test run includes reversible mutations. Set ALLOW_MUTATIONS=true only for an approved test environment.',
  );
  process.exit(1);
}

if (process.env.ALLOW_AI_MUTATIONS !== 'true') {
  console.error(
    'The complete test run includes real model operations. Set ALLOW_AI_MUTATIONS=true only for an approved Provider test window.',
  );
  process.exit(1);
}

const target = requireEnvironmentValue('KNEO_BASE_URL');
const approvedTarget = requireEnvironmentValue('KNEO_APPROVED_MUTATION_TARGET');
if (target !== approvedTarget) {
  console.error(
    'The complete test target does not match the approved mutation environment.',
  );
  process.exit(1);
}

let targetHostname;
try {
  targetHostname = new URL(target).hostname;
} catch {
  console.error('KNEO_BASE_URL must be a valid absolute URL.');
  process.exit(1);
}

// WebKit honors the process proxy for private IPs unless the target is bypassed.
// Derive the bypass from KNEO_BASE_URL so reviewers do not need another env value.
const noProxyEntries = new Set(
  [process.env.NO_PROXY, process.env.no_proxy]
    .filter(Boolean)
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter(Boolean),
);
noProxyEntries.add(targetHostname);
process.env.NO_PROXY = [...noProxyEntries].join(',');
process.env.no_proxy = process.env.NO_PROXY;

const failureModel = process.env.KNEO_AI_FAILURE_MODEL?.trim();
const failureVersion = process.env.KNEO_AI_FAILURE_VERSION?.trim();
if (Boolean(failureModel) !== Boolean(failureVersion)) {
  console.error(
    'Set both KNEO_AI_FAILURE_MODEL and KNEO_AI_FAILURE_VERSION, or leave both unset.',
  );
  process.exit(1);
}

validateOptionalNumber('KNEO_AI_MIN_VRAM_DELTA_MIB', false);
validateOptionalNumber('KNEO_AI_VRAM_RELEASE_TOLERANCE_MIB', true);
validateOptionalNumber('KNEO_AI_OPERATION_TIMEOUT_MS', false);

const warningAcknowledgement =
  process.env.KNEO_AI_ACKNOWLEDGE_WARNINGS?.trim() ?? 'false';
if (!['false', 'true'].includes(warningAcknowledgement)) {
  console.error('KNEO_AI_ACKNOWLEDGE_WARNINGS must be true or false.');
  process.exit(1);
}

const playwrightCli = path.join(
  process.cwd(),
  'node_modules',
  '@playwright',
  'test',
  'cli.js',
);

const result = spawnSync(
  process.execPath,
  [playwrightCli, 'test', ...process.argv.slice(2), '--workers=1'],
  { env: process.env, stdio: 'inherit' },
);

process.exit(result.status ?? 1);
