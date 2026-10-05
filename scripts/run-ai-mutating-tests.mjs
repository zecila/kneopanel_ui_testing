import 'dotenv/config';

import { spawnSync } from 'node:child_process';
import path from 'node:path';

function requireEnvironmentValue(name) {
  const value = process.env[name]?.trim();

  if (!value) {
    console.error(`AI mutation tests require ${name}.`);
    process.exit(1);
  }

  return value;
}

function validateOptionalNumber(name, allowZero) {
  const rawValue = process.env[name]?.trim();
  if (!rawValue) {
    return;
  }

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
    'AI mutation tests require the general mutation gate ALLOW_MUTATIONS=true.',
  );
  process.exit(1);
}

if (process.env.ALLOW_AI_MUTATIONS !== 'true') {
  console.error(
    'AI mutation tests are disabled. Set ALLOW_AI_MUTATIONS=true only for an approved model-operation window.',
  );
  process.exit(1);
}

const mutationTarget = requireEnvironmentValue('KNEO_BASE_URL').replace(
  /\/$/,
  '',
);
const approvedMutationTarget = requireEnvironmentValue(
  'KNEO_APPROVED_MUTATION_TARGET',
).replace(/\/$/, '');

if (mutationTarget !== approvedMutationTarget) {
  console.error(
    'The AI mutation target does not match the approved test environment.',
  );
  process.exit(1);
}

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
const forwardedArguments = process.argv.slice(2);
const uiMode = forwardedArguments.includes('--ui');

if (uiMode && !forwardedArguments.includes('--no-deps')) {
  const authentication = spawnSync(
    process.execPath,
    [playwrightCli, 'test', '--project=setup', '--workers=1'],
    { env: process.env, stdio: 'inherit' },
  );

  if (authentication.status !== 0) {
    process.exit(authentication.status ?? 1);
  }

  forwardedArguments.push('--no-deps');
}

const result = spawnSync(
  process.execPath,
  [
    playwrightCli,
    'test',
    ...forwardedArguments,
    '--project=ai-mutating',
    '--workers=1',
  ],
  { env: process.env, stdio: 'inherit' },
);

process.exit(result.status ?? 1);
