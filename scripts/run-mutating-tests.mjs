import 'dotenv/config';

import { spawnSync } from 'node:child_process';
import path from 'node:path';

function requireEnvironmentValue(name) {
  const value = process.env[name]?.trim();

  if (!value) {
    console.error(`Mutation tests require ${name}.`);
    process.exit(1);
  }

  return value.replace(/\/$/, '');
}

if (process.env.ALLOW_MUTATIONS !== 'true') {
  console.error(
    'Mutation tests are disabled. Set ALLOW_MUTATIONS=true only for an approved test environment.',
  );
  process.exit(1);
}

const mutationTarget = requireEnvironmentValue('KNEO_BASE_URL');
const approvedMutationTarget = requireEnvironmentValue(
  'KNEO_APPROVED_MUTATION_TARGET',
);

if (mutationTarget !== approvedMutationTarget) {
  console.error(
    'The mutation target does not match the approved test environment.',
  );
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

  // Authentication has been refreshed; keep setup out of the mutation UI tree.
  forwardedArguments.push('--no-deps');
}

const result = spawnSync(
  process.execPath,
  [
    playwrightCli,
    'test',
    ...forwardedArguments,
    '--project=mutating',
    '--workers=1',
  ],
  { env: process.env, stdio: 'inherit' },
);

process.exit(result.status ?? 1);
