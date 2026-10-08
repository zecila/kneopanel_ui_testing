import 'dotenv/config';

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { chromium, firefox, webkit } from 'playwright';

const REQUIRED_ENVIRONMENT = [
  'KNEO_BASE_URL',
  'KNEO_SECURITY_ENTRANCE',
  'KNEO_ADMIN_USERNAME',
  'KNEO_ADMIN_PASSWORD',
];

let failures = 0;
let warnings = 0;

function pass(message) {
  console.log(`PASS ${message}`);
}

function warn(message) {
  warnings += 1;
  console.warn(`WARN ${message}`);
}

function fail(message) {
  failures += 1;
  console.error(`FAIL ${message}`);
}

function environmentValue(name) {
  return process.env[name]?.trim() ?? '';
}

function parseBoolean(name, fallback = false) {
  const rawValue = environmentValue(name);
  if (!rawValue) return fallback;
  if (rawValue === 'true') return true;
  if (rawValue === 'false') return false;
  fail(`${name} must be true or false.`);
  return fallback;
}

function normalizeUrl(name, rawValue) {
  try {
    const url = new URL(rawValue);
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error('unsupported protocol');
    }
    return url.toString().replace(/\/$/, '');
  } catch {
    fail(`${name} must be an absolute HTTP(S) URL.`);
    return undefined;
  }
}

function checkPlaywrightVersions() {
  try {
    const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
    const testVersion =
      lock.packages?.['node_modules/@playwright/test']?.version;
    const runtimeVersion = lock.packages?.['node_modules/playwright']?.version;
    const gitlabConfig = readFileSync('.gitlab-ci.yml', 'utf8');
    const imageVersion = gitlabConfig.match(
      /mcr\.microsoft\.com\/playwright:v([^\s-]+)-/,
    )?.[1];

    if (!testVersion || !runtimeVersion || !imageVersion) {
      fail(
        'Could not resolve every Playwright version from the lockfile and CI image.',
      );
      return;
    }

    if (testVersion !== runtimeVersion || testVersion !== imageVersion) {
      fail(
        `Playwright versions differ: test=${testVersion}, runtime=${runtimeVersion}, CI image=${imageVersion}.`,
      );
      return;
    }

    pass(
      `Playwright test, runtime, and CI image versions agree (${testVersion}).`,
    );
  } catch (error) {
    fail(
      `Could not validate Playwright versions: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function checkBrowsers() {
  let chromiumInstalled = false;
  for (const [name, browserType] of [
    ['Chromium', chromium],
    ['Firefox', firefox],
    ['WebKit', webkit],
  ]) {
    const executable = browserType.executablePath();
    if (existsSync(executable)) {
      pass(`${name} is installed.`);
      if (name === 'Chromium') chromiumInstalled = true;
    } else {
      fail(
        `${name} is not installed. Run: npx playwright install chromium firefox webkit`,
      );
    }
  }
  return chromiumInstalled;
}

function checkMutationConfiguration(baseUrl) {
  const mutationsEnabled = parseBoolean('ALLOW_MUTATIONS');
  const aiMutationsEnabled = parseBoolean('ALLOW_AI_MUTATIONS');
  const rawApprovedTarget = environmentValue('KNEO_APPROVED_MUTATION_TARGET');

  if (aiMutationsEnabled && !mutationsEnabled) {
    fail('ALLOW_AI_MUTATIONS=true also requires ALLOW_MUTATIONS=true.');
  }

  if (!rawApprovedTarget) {
    if (mutationsEnabled) {
      fail('Enabled mutations require KNEO_APPROVED_MUTATION_TARGET.');
    } else {
      warn('Mutation target is not configured; read-only lanes remain ready.');
    }
    return;
  }

  const approvedTarget = normalizeUrl(
    'KNEO_APPROVED_MUTATION_TARGET',
    rawApprovedTarget,
  );
  if (!approvedTarget || !baseUrl) return;

  if (approvedTarget === baseUrl) {
    pass('Approved mutation target exactly matches the test target.');
  } else if (mutationsEnabled) {
    fail('Enabled mutations do not match the approved mutation target.');
  } else {
    warn('Approved mutation target differs from the current read-only target.');
  }
}

async function checkReachability(baseUrl, securityEntrance) {
  if (!baseUrl || !securityEntrance) return false;

  let entranceUrl;
  try {
    entranceUrl = new URL(securityEntrance, `${baseUrl}/`);
  } catch {
    fail('KNEO_SECURITY_ENTRANCE must be a valid path or absolute URL.');
    return false;
  }

  try {
    const response = await fetch(entranceUrl, {
      redirect: 'manual',
      signal: AbortSignal.timeout(10_000),
    });
    await response.body?.cancel();
    pass(`KneoPanel security entrance responded with HTTP ${response.status}.`);
    return true;
  } catch (error) {
    fail(
      `KneoPanel security entrance is unreachable: ${error instanceof Error ? error.message : String(error)}`,
    );
    return false;
  }
}

function checkAuthentication() {
  const playwrightCli = path.join(
    process.cwd(),
    'node_modules',
    '@playwright',
    'test',
    'cli.js',
  );
  const result = spawnSync(
    process.execPath,
    [
      playwrightCli,
      'test',
      '--project=setup',
      '--workers=1',
      '--retries=0',
      '--reporter=line',
    ],
    { env: process.env, stdio: 'inherit' },
  );

  if (result.status === 0) {
    pass(
      'Chromium launched and the configured automation account authenticated.',
    );
  } else {
    fail('Chromium launch or KneoPanel authentication failed.');
  }
}

console.log('KneoPanel CI readiness check');

const missingEnvironment = REQUIRED_ENVIRONMENT.filter(
  (name) => !environmentValue(name),
);
if (missingEnvironment.length > 0) {
  for (const name of missingEnvironment) {
    fail(`${name} is required.`);
  }
} else {
  pass('Required read-only environment variables are present.');
}

const baseUrl = environmentValue('KNEO_BASE_URL')
  ? normalizeUrl('KNEO_BASE_URL', environmentValue('KNEO_BASE_URL'))
  : undefined;
const chromiumInstalled = checkBrowsers();
checkPlaywrightVersions();
checkMutationConfiguration(baseUrl);

const reachable = await checkReachability(
  baseUrl,
  environmentValue('KNEO_SECURITY_ENTRANCE'),
);
if (missingEnvironment.length === 0 && chromiumInstalled && reachable) {
  checkAuthentication();
} else {
  warn('Authentication check was skipped until its prerequisites pass.');
}

console.log('');
if (failures > 0) {
  console.error(
    `Readiness check failed with ${failures} failure(s) and ${warnings} warning(s).`,
  );
  process.exit(1);
}

console.log(`Readiness check passed with ${warnings} warning(s).`);
