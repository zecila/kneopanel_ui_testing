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

General mutation tests are separate and disabled by default. Resource tests
create only uniquely named dummy cron jobs, cron groups, and Script Library
entries, then remove the exact objects they created. Configuration tests capture
the original value, register fallback cleanup, and restore it after verification.
They must run against a dedicated test installation, never production. The
mutation runner checks that the configured base URL exactly matches an approved
mutation target and runs with one worker.

KIS model operations have a second, independent opt-in gate. They dynamically
select a preflight-approved model and use exact instance-ID cleanup. They are
excluded from both the default suite and the dummy-resource mutation suite.

## First-time setup

Requirements:

- Node.js 20 or newer
- network or VPN access to the approved KneoPanel test environment
- the environment base URL and security-entrance path
- an approved test administrator account

Install the locked dependencies and all browsers used by the CI lanes:

```bash
npm ci
npx playwright install chromium firefox webkit
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

Verify the complete local setup before running the suite:

```bash
npm run ci:doctor
```

The readiness check validates required settings without printing their values,
checks the installed browsers and pinned Playwright versions, contacts the
configured security entrance, and performs the real authentication setup. It
never enables or executes mutation tests.

Do not commit `.env` or `playwright/.auth/admin.json`. They are ignored because
they contain environment details or authentication state.

## What is tested

The capability-level source of truth is
[`docs/coverage/workflow-coverage-matrix.md`](docs/coverage/workflow-coverage-matrix.md).
It distinguishes route smoke checks from workflow coverage, defines the
required depth for each user skill, and assigns mutating or disruptive work to
an appropriate CI lane.

The test files are grouped first by safety scope and then by KneoPanel product area:

```text
tests/
|-- public/
|   `-- authentication/
|-- read-only/
|   |-- ai/
|   |-- containers/
|   |-- cron-jobs/
|   |-- navigation/
|   |-- overview/
|   |-- scripts/
|   |-- settings/
|   |-- system/
|   `-- terminal/
`-- mutating/
    |-- ai/             separately approved KIS model operations
    |-- configuration/
    |-- cron-jobs/
    |-- scripts/
    |-- system/
    |-- validation/
    `-- zz-cleanup/     terminal exact-resource residue audit
```

The current read-only suite covers the public security entrance, authenticated
overview, system/process views, AI/KIS pages, cron controls, settings, nested
module navigation, filtering, sorting, validation, and selected documented UI
bugs. AI coverage includes One-Click service configuration and pipeline health,
model-instance API/UI consistency and refresh behavior, non-submitting model-load
requirements, safe intercepted stop/delete/server-import workflows, KIS service,
Gateway, Provider, traffic-control and settings contracts, embedded monitoring,
and Kneo Apps lifecycle behavior. Authentication coverage now includes invalid
credential feedback, password validation/failure, and Security dialog validation
and cancellation. No intercepted lifecycle request reaches the panel, so the safe
suite still does not load, stop, delete, or import a real model or alter host-wide
security/services. Current GPU monitoring also maps complete device telemetry
and process cardinality, with synthetic multi/empty/error states and proven
auto-refresh updates and stopping. Container coverage reads and maps the live
inventory and statistics without emitting row values, then uses a reserved
synthetic container for populated, filtered, unavailable, inspect, CPU/memory,
safe EventSource log, and failure/recovery states. It never opens a live row or
starts, stops, or otherwise controls a live container. Historical GPU coverage
maps all six chart series, exact device
selection, metric availability, refresh/reload, empty time ranges and
inventories, and failure recovery. System Monitoring maps live load, CPU,
memory, disk, and network series, verifies aggregate and per-chart requests,
proves all five canvases redraw, and covers empty/error recovery. Overview
monitoring validates the live disk/network counter contract and uses synthetic
counter samples to prove zero initialization, nonzero later rates, exact totals,
automatic polling, switching, and failure recovery. Operation-log coverage validates the live paged response without
emitting its contents and uses synthetic records for filter, empty, failure,
retry, and cleanup-cancellation behavior. Login, task, and system-log tests use
the same content-safe pattern, and all live system-log content reads are
replaced with empty responses. SSH-log coverage validates the live paged schema
and cardinality without emitting records, with synthetic filter, refresh, and
failure recovery. Website-log coverage maps the live site inventory while
intercepting every live content read, then uses synthetic sites and content to
verify access/error selection, switching, failure recovery, and cleanup cancel.
Process coverage validates the live WebSocket
schema and row identities without emitting process details, then uses a mocked
socket and exact dummy detail GET for filters, empty results, details,
closed-socket recovery, and cancellation without ending anything. Disk
coverage maps live and synthetic partitions, reload, empty/error states, and
never invokes a disk action. Installed Applications coverage validates the
live inventory contract and uses only synthetic applications for status,
filters, action eligibility, refresh/reload, and failure recovery; it never
starts, stops, restarts, rebuilds, backs up, configures, or uninstalls an app.
Local terminal coverage installs a browser-side
WebSocket mock before navigation, validates connection and resize frames, and
uses only synthetic commands and output for execution, Quick Command,
disconnect/reconnect, unavailable-access, and cleanup states; no terminal
command reaches the panel host.
Toolbox coverage validates the live quick-settings schema and scalar UI mapping
without emitting configuration values, then uses synthetic DNS, Hosts, Swap,
hostname, account, NTP, timezone, and time data for dialog mapping,
validation, cancellation, and failure recovery. Panel/server restart dialogs
are canceled before confirmation; utilities, time sync, and host settings are
never applied in the read-only lane. About coverage maps the live panel and KIS
version sources without emitting their values and covers placeholders,
permission-denied sign-out, unavailable feedback, reload recovery, and the compiled build ID;
the current build exposes no update or upgrade action on that page.
The current mutation suite covers cron-group and cron-job lifecycles, Script
Library lifecycles, assignment, search and selection, cancel/delete button
behavior, cron enable/disable persistence, safe manual execution with successful
and failed records, validation without submission, deletion protection,
File Browser folder and file lifecycles with byte-for-byte download and exact
cleanup, One-Click address validation and persistence, reversible Panel alias
updates, and cleanup.
The separately gated AI mutation suite covers model load/unload, automatic GPU
assignment, VRAM allocation and release, insufficient-capacity blocking,
duplicate-load prevention, unload cancellation, exact instance cleanup, and
failed-load recovery.

Numbered regression tests correspond to reports in chronologically sortable
`docs/bugs/YYYY-MM-DD/` packages. A dated package may also contain its complete
case list, reviewer summary, and narrowly retained evidence.
The dated reports are also the backlog for findings that are not automated yet;
a documented manual finding should not be assumed to have Playwright coverage
unless a test links to it with a `bug-report` annotation.
Known reproduced defects use a conditional Playwright `test.fail()` marker only
after the test has completed its prerequisite steps and observed the specific
defect condition. This records a known product defect without allowing unrelated
setup, navigation, or cleanup failures to appear successful. Once the expected
behavior is present, the same assertion runs as an ordinary passing regression.
The read-only guard and mutation cleanup fixtures override that expected status
when they fail, so a safety or cleanup problem always fails the run.
Configured core workflows also fail normally when their service or usable
resource is unavailable. In particular, One-Click connectivity, its six-stage
health pipeline, KIS service-log targets, and the gated model-load target are
never converted to environment skips.
Skips are reserved for optional or case-specific fixtures that do not block the
feature's primary path.

## Running tests locally

Run the safe default suite:

```bash
npm test
```

Useful commands:

```bash
npm run typecheck                 # TypeScript validation only
npm run ci:doctor                 # Environment, browser, target, and auth readiness
npm run test:ci:smoke             # Critical Chromium CI gate
npm run test:ci:regression        # Remaining Chromium read-only regression
npm run test:ci:cross-browser     # Full Firefox and WebKit compatibility
npm run test:headed               # Read-only tests with a visible browser
npm run test:ui                   # Refresh auth, then open read-only tests in UI mode
npm run test:firefox              # Read-only suite in Firefox
npm run test:webkit               # Read-only suite in WebKit/Safari mode
npm run test:all                  # All browsers and both approved mutation scopes
npm run test:mutating:ui          # Permission-checked mutation tests in UI mode
npm run test:ai-mutating:ui       # Separately gated KIS model tests in UI mode
npm run test:model-config         # Registry workflow and hard parameter validation
npm run test:model-config:fast    # The model group without the large archive transfer
npm run test:model-config:upload  # Upload stage only
npm run test:model-config:generate # Generate Registry stage only
npm run test:model-config:add-version # Add Version stage only
npm run test:model-config:ui      # The same focused group in UI mode
npm run report                    # Open the last HTML report
```

Run one test file or one test by title with Playwright's normal filters:

```bash
npx playwright test tests/read-only/overview/overview.spec.ts
npx playwright test -g "switches between Disk I/O and Network monitoring"
```

The first authenticated run creates local browser state through the `setup`
project. The `read-only` project reuses that state. Reports, screenshots, traces,
and videos are generated only as configured by Playwright and should be checked
before sharing them for sensitive data.

Every run writes an interactive report to `playwright-report/index.html`, a
review-friendly summary grouped by project and feature to
`playwright-report/summary.md`, and CI-compatible JUnit XML to
`test-results/results.xml`. The complete runner uses one worker so reversible
configuration/resource tests and real model operations cannot overlap. It
requires both mutation gates and the same exact approved-target check as the
individual mutation runners. The Markdown report also includes dated pending
reproduction notes, clearly separated from defects verified by the test run.

`npm run test:ui` runs the authentication setup first, then starts UI Mode with
project dependencies hidden. The test tree should therefore show both the
public checks and authenticated read-only smoke and regression tests rather
than only `auth.setup.ts`. Use the project filter in UI Mode to select
`public-read-only` and `read-only` if a previously saved UI filter is still
active.

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

To inspect or run mutation tests interactively, use:

```bash
npm run test:mutating:ui
```

This performs the same opt-in and approved-target checks, refreshes the saved
authentication state, and opens UI Mode with only the mutation project in the
test tree. Opening UI Mode does not create resources; a mutation begins only
when a test is run.

The mutation suite uses the `kneo-e2e-` name prefix, records exact server IDs,
cleans up in reverse dependency order, and runs a final residue audit. If a run
is interrupted, inspect the test environment for leftover `kneo-e2e-` resources
before running again. See `tests/mutating/README.md` for the rules every new
mutation test must follow.

## Configuring AI mutation tests

AI tests perform real model loads and are not part of `npm run test:mutating`.
Before enabling them, reserve a Provider test window. The suite discovers
running Providers and its normal model from the current KIS data. It chooses an
inactive model with the fewest required GPUs only when preflight reports enough
free GPUs, a complete capacity check, and no context-window or projected VRAM
warning. `KNEO_AI_PROVIDER` remains available as an override when discovery is
not suitable. The
insufficient-capacity UI case mocks only its preflight result and verifies that
no load request is submitted.

Do not start concurrent model operations during the run. KIS background-job
records do not expose the Provider needed to disambiguate them.

Set the following only in the ignored `.env` file or protected CI variables:

```dotenv
ALLOW_MUTATIONS=true
ALLOW_AI_MUTATIONS=true
KNEO_APPROVED_MUTATION_TARGET=https://your-test-panel.example

# Optional Provider override. Leave empty for discovery.
KNEO_AI_PROVIDER=

# Optional pair: enables the known-failure recovery case.
KNEO_AI_FAILURE_MODEL=
KNEO_AI_FAILURE_VERSION=

# Optional tuning values; defaults are shown.
KNEO_AI_MIN_VRAM_DELTA_MIB=1
KNEO_AI_VRAM_RELEASE_TOLERANCE_MIB=128
KNEO_AI_OPERATION_TIMEOUT_MS=900000
KNEO_AI_ACKNOWLEDGE_WARNINGS=false
```

Keep warning acknowledgement disabled unless the selected model's context or
VRAM warning has been reviewed for that run. Execute with:

```bash
npm run test:ai-mutating
npm run test:ai-mutating:ui
npm run test:model-config
```

The runner verifies both opt-ins, the exact approved target, optional-value
consistency, one worker, and no retries. With no Provider or failure-model
values, five model-operation cases run and the known-failure recovery case is
skipped. Cleanup unloads only exact instance IDs discovered after each test's
baseline. See
`tests/mutating/ai/README.md` for target requirements and recovery behavior.
The focused model-configuration command covers upload, Generate Registry, Add
Version, generated YAML, numeric boundaries, `TP <= GPU Count`, and exact
registry cleanup without running model load or runtime-capacity cases. It
reuses an existing model as a read-only source when possible, labels the copy
with `kneo_e2e_test_copy_`, and deletes only that test-owned registry version.
The local placeholder archive is used automatically only on an empty target.

## GitLab CI

`.gitlab-ci.yml` is prepared for GitLab. The automatic pipeline runs:

1. TypeScript type checking.
2. Tagged Chromium smoke checks on branches and merge requests.
3. The remaining Chromium read-only regression on the default branch and on
   schedules.
4. The complete Firefox and WebKit read-only suite on schedules.

Merge requests can start the remaining Chromium regression manually. General
mutation tests are a separate manual job on non-scheduled default-branch
pipelines. AI mutation tests are not enabled in the GitLab pipeline draft.

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
