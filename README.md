# KneoPanel Playwright tests

This repository tests the KneoPanel web interface from a user's point of view.
Playwright opens a real browser, signs in to an approved KneoPanel environment,
clicks controls, and checks the resulting pages, messages, tables, and forms.
It is an end-to-end test project; it does not contain the KneoPanel application
itself.

## Safety model

The normal test command is read-only. Its request guard allows `GET`, `HEAD`, and
`OPTIONS` requests and a small, reviewed list of retrieval endpoints that use
`POST`. Any other state-changing request is aborted and fails the test.

Mutation tests are separate and disabled by default. They create only uniquely
named dummy cron jobs, cron groups, and Script Library entries, then remove the
exact objects they created. They must run against a dedicated test installation,
never production. The mutation runner checks that the configured base URL
exactly matches an approved mutation target and runs with one worker.

## First-time setup

Requirements:

- Node.js 20 or newer
- network or VPN access to the approved KneoPanel test environment
- the environment base URL and security-entrance path
- an approved test administrator account

Install dependencies and the default browser:

```bash
npm install
npx playwright install chromium
```

Create the ignored local configuration file:

```bash
cp .env.example .env
```

Fill in `.env`:

```dotenv
KNEO_BASE_URL=https://your-test-panel.example
KNEO_SECURITY_ENTRANCE=/security-entrance
KNEO_ADMIN_USERNAME=your-test-user
KNEO_ADMIN_PASSWORD=your-test-password
ALLOW_MUTATIONS=false
KNEO_APPROVED_MUTATION_TARGET=
```

Do not commit `.env` or `playwright/.auth/admin.json`. They are ignored because
they contain environment details or authentication state.

## What is tested

The test files are grouped by safety scope first, then by purpose:

```text
tests/
|-- public/       unauthenticated login and protected-route checks
|-- read-only/    safe navigation, dashboards, settings, controls, and regressions
|   |-- smoke/    general page and workflow checks
|   |-- logical-inconsistencies/
|   |-- ui-problems/
|   `-- visual-formatting/
`-- mutating/     opt-in dummy-resource lifecycle and mutation regressions
    |-- smoke/
    |-- logical-inconsistencies/
    |-- ui-problems/
    `-- visual-formatting/
```

The current read-only suite covers the public security entrance, authenticated
overview, system/process views, AI/KIS pages, cron controls, settings, nested
module navigation, filtering, sorting, validation, and documented UI bugs.
The current mutation suite covers cron-group and cron-job lifecycles, Script
Library lifecycles, assignment, search and selection, cancel/delete button
behavior, validation without submission, deletion protection, and cleanup.

Numbered regression tests correspond to the dated reports in `docs/bugs/`.
Known reproduced defects use Playwright's `test.fail()` marker so CI records the
defect without hiding it; an unexpected pass signals that the product behavior
changed and the test should be reviewed.

## Running tests locally

Run the safe default suite:

```bash
npm test
```

Useful commands:

```bash
npm run typecheck                 # TypeScript validation only
npm run test:headed               # Read-only tests with a visible browser
npm run test:ui                   # Playwright UI mode
npm run test:firefox              # Read-only suite in Firefox
npm run test:webkit               # Read-only suite in WebKit/Safari mode
npm run report                    # Open the last HTML report
```

Run one test file or one test by title with Playwright's normal filters:

```bash
npx playwright test tests/read-only/smoke/overview.spec.ts
npx playwright test -g "switches between Disk I/O and Network monitoring"
```

The first authenticated run creates local browser state through the `setup`
project. The `read-only` project reuses that state. Reports, screenshots, traces,
and videos are generated only as configured by Playwright and should be checked
before sharing them for sensitive data.

## Configuring mutation tests

Mutation tests are not included in `npm test`. Before enabling them, confirm that
the target is a disposable KneoPanel test environment and that the account has
only the permissions needed by the tests.

Set both values in the ignored `.env` file:

```dotenv
ALLOW_MUTATIONS=true
KNEO_APPROVED_MUTATION_TARGET=https://your-test-panel.example
```

The two URLs must match exactly. Then run:

```bash
npm run test:mutating
```

The mutation suite uses the `kneo-e2e-` name prefix, records exact server IDs,
cleans up in reverse dependency order, and runs a final residue audit. If a run
is interrupted, inspect the test environment for leftover `kneo-e2e-` resources
before running again. See `tests/mutating/README.md` for the rules every new
mutation test must follow.

## GitLab CI

`.gitlab-ci.yml` is prepared for GitLab. The automatic pipeline runs:

1. TypeScript type checking.
2. The public and authenticated read-only suite.
3. A manual mutation job on the default branch, only when explicitly started.

The GitLab runner needs network access to KneoPanel and a Playwright-compatible
Docker executor. Configure the URL, security entrance, and credentials as
protected CI/CD variables. The mutation job additionally requires the approved
mutation target and should be protected as an environment. See
`docs/ci/gitlab.md` for runner requirements, variables, and the review checklist.

## Before adding a test

Use accessible roles and visible names instead of generated CSS classes. Assert
the result of an interaction, not just that a button exists. Keep read-only
tests free of server mutations. For a new mutation test, use a unique name,
retain exact IDs, and clean up in `finally` or fixture teardown. Run
`npm run typecheck` and the relevant Playwright command before opening a review.
