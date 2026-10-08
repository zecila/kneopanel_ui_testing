# KneoPanel workflow coverage matrix

This matrix tracks observable user capabilities, not pages, routes, test files,
or line coverage. It was initialized from the October 2026 KneoPanel Quick
Start Guide and the workflows visible in the current panel and test suite.

The model configuration tests are the depth reference. A workflow is not
considered covered merely because a test can open its page or submit its happy
path.

## Coverage contract

For each skill, cover every applicable dimension below. Mark a dimension not
applicable only when the product cannot exhibit that behavior.

| Code | Dimension | Required evidence |
| --- | --- | --- |
| H | Happy path | The user completes the capability and sees its result. |
| V | Validation and cancellation | Invalid input cannot submit; cancel/back leaves state unchanged. |
| F | Failure and retry | A real or deterministic simulated failure is visible and the user can retry safely. |
| R | Refresh and persistence | Reload, revisit, or an explicit refresh agrees with the saved server state. |
| P | Permissions and availability | Missing permission, service, hardware, or other prerequisite is explained and blocks unsafe action. |
| C | Cardinality | Empty, one-item, and multiple-item behavior is checked where lists or selections are involved. |
| X | Cross-feature effect | Dependencies and downstream effects remain valid or the operation is blocked. |
| K | Recovery and cleanup | Partial work is recoverable and tests remove only the exact state they created. |
| A | UI/API consistency | The rendered state and relevant API response describe the same resource and outcome. |

Every mutating skill must also use a unique test-owned resource, capture its
exact server identity, register fallback cleanup before submission, run with one
worker, and verify cleanup. Configuration changes must capture and restore the
original value. Hardware or service disruption requires a separate explicit
gate.

## Status and CI lanes

Status is intentionally qualitative; a percentage would hide important gaps.

- **Strong**: comparable to the model-configuration reference for the
  dimensions that currently apply. This does not mean finished; listed gaps
  still need tests.
- **Partial**: meaningful behavior is asserted, but one or more primary paths
  or several applicable dimensions are missing.
- **Route only**: the suite proves that a page opens, not that its workflow
  works.
- **None**: no direct automated evidence was found.

| Lane | Trigger | Permitted behavior |
| --- | --- | --- |
| PR | Every trusted merge request and branch | Public and guarded read-only checks; deterministic browser-side failure simulations. |
| Mutation | Serialized scheduled/manual job on a disposable panel | Reversible settings and exact test-owned resource lifecycles. |
| AI hardware | Serialized reserved-Provider job with both mutation gates | Registry, load, preparation, deployment, GPU, and VRAM mutations. |
| Disruptive admin | Explicit maintenance-window gate | Service restarts, provider changes, security, storage, backup/restore, and similar host-wide operations. |

A configured core workflow that is unavailable is a report failure, not a
skip. Skips are limited to optional or case-specific states whose absence does
not block the primary workflow.

## Current matrix

Evidence names are repository-relative. `RO` means read-only, `M` general
mutation, `AI` AI hardware, and `DA` disruptive admin.

### Access, overview, and account

| Skill | Lane | Status | Current evidence | Highest-value missing dimensions |
| --- | --- | --- | --- | --- |
| Open the security entrance and sign in | PR | Partial | `public/authentication/security-entrance.spec.ts` covers the entrance, empty-field validation, deterministic invalid-credential feedback, and an editable retry state; `auth.setup.ts` performs CI authentication | User-facing success assertion, unavailable/wrong entrance, explicit logout, and true idle-session expiry/retry. |
| Change the signed-in user's password | DA | Partial | `read-only/settings/settings-panel.spec.ts` covers confirmation mismatch, cancellation, intercepted server rejection, and secret-safe failure feedback | Successful change, sign-in with the new password, restoration of the original, expired-password flow, and permission behavior on a disposable target. |
| Inspect Overview health and system information | PR | Strong | `read-only/overview/overview-data.spec.ts` maps live identity, logical CPU and memory telemetry, KIS health, Provider/model counts, and reload state to their API responses; covers empty and multi-resource summaries plus chained node/model failure feedback and recovery. `overview.spec.ts` retains section and gauge smoke coverage | Permission-specific role state, GPU gauge paging and API parity, degraded local-node presentation, and stale/out-of-order telemetry responses. |
| Switch Overview network and disk monitoring | PR | Strong | `read-only/overview/overview-monitoring.spec.ts` validates the complete live counter contract without exposing values; deterministic initial and later samples cover exact network totals, zero-rate initialization, nonzero network and disk deltas, view switching, automatic polling, reload/default state, unavailable feedback, retry, and UI/API consistency. `overview.spec.ts` retains the visible-control smoke checks | Permission-denied behavior, counter resets/wraparound, malformed values, delayed/stale polling responses, and selection persistence if the product adopts a saved preference. |
| Edit Panel identity/settings | M | Partial | Alias update, reload, and restoration in `mutating/configuration/config-settings.spec.ts` | Field validation, cancel, failed save/retry, concurrent/stale values, remaining Panel settings. |

### KIS nodes and operations

| Skill | Lane | Status | Current evidence | Highest-value missing dimensions |
| --- | --- | --- | --- | --- |
| Inspect Gateway/Provider nodes and health | PR | Strong | `read-only/ai/kis.spec.ts` maps every live API node and service, refreshes, and covers empty, healthy, degraded/stopped/error/unknown, unavailable/retry, and exact failure-detail states | Permission-specific role state, stream-driven transitions, and stale/out-of-order responses. |
| Filter and select KIS nodes/services | PR | Partial | `read-only/ai/kis.spec.ts` covers the complete service option set and zero/one/all selection without requests | Multi-node independent selections and selection persistence. |
| Start, stop, and restart selected KIS services | DA | Partial | `read-only/ai/kis-service-lifecycle.spec.ts` intercepts the exact selected-service request and covers deterministic failure/retry, refreshed status, and cancellation-safe operations | Live transition/dependent-model effects, permission behavior, partial failure, and recovery on a disposable target. |
| Start a stopped KIS Gateway | DA | Partial | `read-only/ai/kis-service-lifecycle.spec.ts` covers an intercepted start and dependent service refresh | Live health transition, unavailable/retry, dependent-page recovery, and rollback on a disposable target. |
| Perform Clean Restart | DA | Partial | `read-only/ai/kis-service-lifecycle.spec.ts` verifies the data-loss warning, cancel, confirmation, and exact recreate contract with the request intercepted | Real model/data effects, partial failure, and recovery; run only on a disposable target. |
| Add, edit, and remove server SSH credentials | DA | Partial | `read-only/ai/kis-settings-guide.spec.ts` covers required host validation, secret masking, add/edit/reload/delete, and isolated browser cleanup | Connection validation, server-side persistence if adopted, permissions, and unreachable-host feedback. |
| Add/reapply/remove a Provider node | DA | Partial | `read-only/ai/kis-service-lifecycle.spec.ts` covers synthetic preflight, confirmation, exact apply, refreshed inventory, delete, and exact cleanup; the live reapply cancellation regression remains | Live join/health, duplicate/unreachable IP, permission behavior, partial failure, and host cleanup on a disposable target. |
| Configure and persist traffic-control limits | DA | Partial | `read-only/ai/kis-traffic-control.spec.ts` covers all path groups, load current/default, exact apply payload, restart deferral, and load failure/retry with writes intercepted | Numeric boundaries, live nginx restart/recovery, permissions, and persistence on a disposable target. |
| Inspect KIS service logs | PR | Strong | `read-only/ai/kis-service-logs.spec.ts` maps the live selected node/service request and response without exposing credentials or log contents; covers all seven service targets, every tail limit, auto-load, explicit empty output, unavailable feedback, retry, and exact safe log rendering | Permission-specific role state, manual refresh when exposed, live stream transitions, and stale/out-of-order responses. |
| Repair container conflicts/local Provider IP/cache | DA | Partial | `read-only/ai/kis-settings-guide.spec.ts` covers empty/no-op and nonempty conflict scans, exact warning/cancel, intercepted failure/retry/success with exact container IDs, plus local-IP and Provider-cache cancellation | Live local-IP/cache success, service/model effects, permissions, partial failure, rollback, and recovery on a disposable target. |
| Configure KIS storage, database, and queue proxy | DA | Partial | This is the guide's per-instance queue capability. `read-only/ai/kis-settings-guide.spec.ts` maps maximum inflight requests, maximum queued requests, queue/upstream timeouts, storage/database settings, and secret handling, then verifies exact queue updates and restart deferral with writes intercepted | Broader validation/cancel, live persistence, incompatible topology/repair, unavailable dependencies, permissions, and restart recovery. |
| Export and import KIS settings | DA | Partial | `read-only/ai/kis-settings-guide.spec.ts` verifies the sensitive-backup warning context, export download, and malformed-import rejection before submission | Valid round trip, overwrite confirmation/cancel, rollback after partial failure, permissions, and secret restoration on a disposable target. |
| Inspect model-operation history | PR | Strong | `read-only/ai/operation-history.spec.ts` maps every live API row, validates the page request, refreshes, and covers explicit empty, successful/failed multi-record, unavailable/retry, and exact failure-detail states | Permission-specific role state, pagination beyond the first 30 records, filters when exposed, and stale/out-of-order responses. |

### Bundle models and runtime

| Skill | Lane | Status | Current evidence | Highest-value missing dimensions |
| --- | --- | --- | --- | --- |
| Upload a KIS model bundle | AI | Strong | `01-model-bundle-upload.spec.ts` | Invalid/corrupt supported archive, server rejection and retry, cancel in progress, refresh persistence. |
| Import a model bundle from the server | AI | Partial | `read-only/ai/model-server-import.spec.ts` covers empty/relative path blocking, exact directory payload, deterministic server failure/retry, and job-ID feedback with the import intercepted | Missing/unauthorized live path, bundle mode, successful job completion, refresh persistence, permissions, and exact cleanup. |
| Generate a registry configuration | AI | Strong | Five cases in `02-generate-registry.spec.ts` cover numeric boundaries, YAML serialization, create, and exact cleanup | Additional vLLM options, API/preview step validation, Download ZIP, cancel at every step, server failure/retry. |
| Add a version to an existing model | AI | Strong | `03-add-version.spec.ts` covers source persistence, TP constraints, create, coexistence, and cleanup | Duplicate version, cancel, failure/retry, reload persistence, non-default source variants. |
| Browse and inspect Available Models | PR | Strong | `available-models.spec.ts` covers complete live API/UI row mapping, all-version display, headers/actions, explicit empty and multi-item states, deterministic failure/retry, and refresh; load-dialog requirements remain covered in `kis-models.spec.ts` | Permission-denied state, stale/out-of-order refreshes, and API-backed serving-image detail when the endpoint exposes it. |
| Load a model onto a Provider | AI | Strong | `ai-model-operations.spec.ts`: preflight, exact instance, capacity and duplicate guards | Memory-risk warning/Start Anyway, load cancellation, failed request/retry, UI persistence during starting. |
| Inspect and refresh model instances | PR | Strong | `model-instances.spec.ts` maps complete API rows, refreshes, and checks failed-state actions | Empty/multi-provider states, status transitions, stale/out-of-order responses. |
| Stop a running model while keeping it deployable | AI | Partial | `read-only/ai/model-instances.spec.ts` selects one exact current instance but intercepts the stop; covers exact warning/cancel, numeric instance payload, disappearance, and reload persistence without affecting the runtime | Live runtime/GPU release, Ready-to-deploy persistence, failed stop/retry, permissions, and hardware cleanup. |
| Unload a model instance | AI | Strong | Exact-instance unload, cancel, failed-load cleanup, VRAM release | Unload request failure/retry and page refresh during transition. |
| Delete a model/version | AI | Partial | Test-created registry versions are removed through fixture APIs; `available-models.spec.ts` covers the exact warning/cancel plus confirmed asynchronous deletion and reload persistence for a synthetic exact version | Live dependency protection, failed delete/retry, permissions, and exact cleanup of a test-created version through the UI. |
| Verify GPU assignment and VRAM lifecycle | AI | Strong | GPU count, allocation, and release in `ai-model-operations.spec.ts` | Multi-model sharing/risk warning, unavailable metrics, delayed/stale samples. |

### One-Click KIS

Expansion of this section remains deferred while One-Click is unreachable in
the approved environment, but reachability and pipeline-health tests now fail
normally so the report does not present the core workflow as passed or skipped.

| Skill | Lane | Status | Current evidence | Highest-value missing dimensions |
| --- | --- | --- | --- | --- |
| Configure and validate the One-Click service | M | Partial | Address validation and save/reload/restore are covered; read-only reachability and all six health stages require a healthy response and report the current unavailable state as a failure | Failed save/retry, permission state, explicit status refresh, stale/out-of-order health responses, and restoration of service reachability. |
| Save and validate a Hugging Face token | M | None | None | Masking, gated-model feedback, invalid token, cancel, persistence, removal/restoration. |
| Collect one Hugging Face or Ollama model | AI | None | None | Name/URL/tag validation, start/cancel, result selection/save, provider errors, refresh persistence, exact cleanup. |
| Run fuzzy/author scans and select results | AI | None | None | Empty/single/multi results, select-all, duplicates, partial provider failures, retry and cleanup. |
| Browse and delete model candidates | AI | None | None | API/UI mapping, filters, typed confirmation/cancel, keep/delete weights, dependency effects. |
| Configure automatic preparation | AI | None | None | GPU choices, context bounds, concurrency/profile defaults, estimate warnings, cancel and persistence. |
| Configure manual preparation | AI | None | None | Engine/version, memory bounds, explicit GPUs, KV cache, optimization and CUDA graph combinations, validation. |
| Follow preparation progress and inspect failure details | AI | None | None | Download/find/record transitions, browser revisit, technical output, failure/retry, interrupted cleanup. |
| Deploy a prepared configuration | AI | None | Bundle-model Load tests do not cover One-Click Deploy | Ready-only action, capacity recheck, starting/healthy transition, active-model pause effect, failure/retry and cleanup. |
| Try a deployed model and copy API usage | AI | None | None | Text and supported media inputs, reply/model/token fields, send failure/retry, secret-safe copy behavior. |
| Run and repeat Benchmark | AI | None | None | 5/60-minute choices, active-model wait, disabled/package-missing state, progress/results, failed run remains deployable. |
| Stop/delete/release One-Click resources | AI | None | Bundle unload is related but not equivalent | Stop, candidate/configuration/weight dependency rules, orphaned GPU release, exact cleanup, operation history. |

### Monitoring and security

| Skill | Lane | Status | Current evidence | Highest-value missing dimensions |
| --- | --- | --- | --- | --- |
| Use embedded KIS Monitoring | PR | Strong | `read-only/ai/kis-monitoring.spec.ts` checks the exact live dashboard URL, time-range and refresh controls, embedded content, missing `kis_monitor` feedback, and reload recovery | Permission-denied behavior, iframe/network error details, stale dashboard sessions, and cross-browser embedding policy. |
| Inspect current GPU metrics and processes | PR | Strong | `gpu-monitoring.spec.ts` maps live device ordering, all device metrics, VRAM, and per-GPU process cardinality to the API without emitting live process details; deterministic data covers empty and multi-GPU inventories, every displayed metric and process field, and unavailable feedback/retry | Permission-denied behavior, AMD-specific rendering when available, malformed/degraded device fields, and stale/out-of-order responses. |
| Inspect historical GPU metrics | PR | Strong | `gpu-history.spec.ts` maps the live GPU options and every synchronized history array, exact selected-device requests, all six rendered charts, unsupported-metric explanations, refresh/reload, empty time ranges, empty inventory, and both inventory and search failure recovery | Explicit custom-range selection/cancellation, permission-denied behavior, AMD/XPU rendering when available, and stale/out-of-order responses. |
| Configure GPU auto-refresh | PR | Strong | `gpu-monitoring.spec.ts` selects an exposed automatic interval, advances the browser clock, proves a repeated request updates utilization, returns to No refresh, and proves polling stops | Selection persistence after leaving/revisiting, permission-denied behavior, and delayed/stale polling responses. |
| Configure Panel HTTPS and certificate | DA | Partial | `read-only/settings/security-guide.spec.ts` inventories SSL state and certificate choices, opens the HTTPS workflow, cancels it, and verifies no SSL write/state change | Certificate validation/import, safe enable/disable, reconnect, permissions, failure rollback, and recovery on an isolated target. |
| Configure port, entrance, domain, IP authorization, password expiry, and 2FA | DA | Partial | `read-only/settings/security-guide.spec.ts` inventories all controls, opens/cancels every editable restriction, and blocks invalid port/IP/domain values without writes | Lockout-safe persistence, expiry/2FA validation, permissions, server failure/retry, rollback/recovery, and an isolated disposable target. |

### Cron jobs and Script Library

| Skill | Lane | Status | Current evidence | Highest-value missing dimensions |
| --- | --- | --- | --- | --- |
| Create, edit, assign, and delete a shell cron job | M | Partial | Lifecycle, required fields, edit/delete cancel, search and selection | Schedule boundaries/presets, duplicate names, refresh persistence, failed create/update/delete and retry, API parity. |
| Enable, disable, and bulk-update cron jobs | M | Strong | Exact-job enable/disable cancellation and reload persistence in `cron-job-execution.spec.ts`; `cron-job-bulk-status.spec.ts` covers multi-selection, deterministic partial failure, persisted mixed state, targeted retry, bulk recovery, and per-job API parity | Permission-denied state and stale/out-of-order status responses. |
| Run a cron job and inspect its result/history | M | Strong | `cron-job-execution.spec.ts` covers safe success, command failure/edit/retry, trigger failure with no partial record, concurrent-run rejection, empty/single/multi-record history, reload persistence, output download, clear cancel/confirm, and API parity | Record filtering/pagination, permission-denied state, and leaving/reopening the page during a long-running execution. |
| Create, rename, and delete cron groups | M | Partial | Group lifecycle and in-use deletion regression | Duplicate/empty names, cancel edit/delete, refresh, failed request/retry, multi-job dependencies. |
| Create, edit, assign, and delete Script Library entries | M | Partial | Lifecycle, validation, cancel, search/selection, in-use group protection | Duplicate names, refresh persistence, failed mutations/retry, bulk delete, API parity. |
| Use a library script in a cron job | M | Partial | `library-script-integration.spec.ts` covers required selection, deterministic create failure/retry, exact script-ID binding, reload persistence, safe execution, live edit propagation, post-delete failure, and exact cleanup; deletion while referenced is tracked as bug 34 | Fix dependency deletion, then add permission-denied behavior and stale/out-of-order script lookup responses. |

### Files and core system tools

| Skill | Lane | Status | Current evidence | Highest-value missing dimensions |
| --- | --- | --- | --- | --- |
| Browse folders and inspect file metadata | PR | Partial | `file-browser.spec.ts` maps the complete root API listing, search and `/tmp` navigation, unavailable-directory feedback, and disabled recycle-bin state; `bug-file-browser-dev-load.spec.ts` tracks the pending `/dev` listing request; owned lifecycles cover empty, single, multi, and paginated states | Fix the `/dev` load timeout; breadcrumb assertions, sorting, permissions, enabled recycle contents, and stale/out-of-order responses. |
| Upload and download files | M | Partial | `file-browser-file-lifecycle.spec.ts` covers blank validation, preflight, progress lockout, in-progress cancellation with no server artifact, single/multi-file uploads, deterministic total and partial-batch failure, mixed-state reload, targeted retry, a 1 MiB binary retry, exact persistence, and byte-for-byte downloads | Upload overwrite conflict, very large files, and unavailable storage. |
| Compress and decompress files | M | Partial | `file-browser-compression.spec.ts` creates an isolated dummy file, verifies the exact ZIP request and artifact, removes the source, verifies the default extraction destination, and confirms decompression restores the exact file | Multiple files/directories, non-ZIP formats, passwords, replacement conflicts, cancellation, task failure/retry, and custom destinations. |
| Create, rename, move, copy, and delete files/folders | M | Partial | Exact file/folder creation, required-name validation, file and folder rename/delete cancellation, deterministic copy/rename failure and retry, copy/move API semantics, collision cancel/overwrite/rename with byte-level results, reload/search persistence, permanent deletion, and residue audit; `bug-file-browser-favorite-delete.spec.ts` tracks stale Favorites records after deletion; `bug-file-browser-same-path-copy.spec.ts` tracks backend and operation-log failures for same-path copies | Fix favorite consistency across delete/move/rename and handle same-path copies as successful no-ops; recycle-bin restore, permissions, multi-select and partial failure. |
| Inspect the container inventory | PR | Strong | `container-inventory.spec.ts` maps the live inventory request and every row, including the explicit empty state and reload; deterministic states cover multi-item rendering, status and name filters with exact request payloads, unavailable runtime behavior, failure feedback, and recovery. `bug-003-container-status-filter.spec.ts` retains the first-click regression | Permission-denied behavior, pagination/sorting, periodic inventory refresh, malformed records, and stale/out-of-order responses. |
| Inspect container details, resource stats, and logs | PR | Strong | `container-details-logs.spec.ts` maps the live statistics schema and row parity without exposing container values; a reserved synthetic container covers exact CPU/memory rendering, the inspect request and Basic/Network/Volume tabs, safe EventSource log rendering, every fetch/tail/follow/timestamp query, cancellation, and both inspect and stream failure/retry | Permission-denied behavior, stats polling and missing-stat transitions, log download, very large streams, stale/reconnecting streams, and cleanup of test-owned logs in the mutation lane. |
| Start, stop, restart, pause, resume, kill, and delete containers | DA | None | Bulk controls are observed only in disabled state; no lifecycle request is sent and no preexisting container is selected | Unique disposable container fixture, action eligibility, confirmation/cancel, success and transition states, failure/retry, persistence, cross-feature effects, and exact ID-based cleanup. |
| Open and use a local terminal session | PR | Strong | `terminal/terminal-workflow.spec.ts` fully mocks the terminal WebSocket before navigation and covers exact local connection parameters, resize frames, safe command encoding and output rendering, disconnect/reconnect, unavailable local authentication, first and repeated blank AI-helper submissions, closing the last tab, and zero/one-session states. The initial blank helper submission sending `undefined` once is tracked as bug 35 | Permission-denied behavior, multiple simultaneous sessions and batch input, heartbeat latency updates, terminal resizing, stale frames, and browser reload behavior. |
| Connect and manage remote terminal hosts | M | None | The Hosts surface is visible, but no remote connection or stored credential is read or changed | Host/group lifecycle, password/key validation and masking, connection test, connect/disconnect/reconnect, permissions, failure/retry, exact cleanup, and secret-safe evidence. |
| Select and run a terminal Quick Command | PR | Partial | `terminal/terminal-workflow.spec.ts` loads a synthetic command tree, selects an exact nested command through the UI, proves the encoded WebSocket value, and renders a synthetic reply | Empty/single/multi trees, search, unavailable/failure feedback, batch application across sessions, permissions, and stale tree responses. |
| Create, edit, group, and delete terminal Quick Commands | M | Partial | `bug-015-quick-command-validation.spec.ts` covers invalid group-name feedback without submission | Exact group/command lifecycles, duplicate and boundary validation, cancel, persistence, failure/retry, dependencies, permissions, and exact cleanup. |
| Inspect Toolbox quick settings | PR | Strong | `toolbox/toolbox-overview.spec.ts` validates the complete live base contract and scalar UI mapping without exposing values; deterministic data covers DNS, Hosts, Swap, hostname, masked password, NTP, timezone, and server-time rendering, all seven settings-dialog cancel paths, reload, failure feedback, and recovery | Permission-denied behavior, malformed/partial base data, enabled/disabled utility availability, and stale/out-of-order responses. |
| Configure DNS, Hosts, Swap, hostname, password, NTP, and timezone | DA | Partial | `toolbox/toolbox-overview.spec.ts` opens each exact dialog, maps synthetic current values, cancels without submission, and verifies empty-hostname validation; no host setting is changed | Reversible per-setting fixtures, remaining validation boundaries, save/reload/restore, failure/retry, cross-feature effects, permissions, rollback, and exact cleanup. |
| Run Cache clean, Supervisor, Virus scan, FTP, and Fail2ban tools | DA | None | The five tools are inventoried but never invoked | Per-tool input and confirmation, progress/output, no-op states, unavailable dependencies, failure/retry, permissions, cross-feature effects, and cleanup. |
| Restart the panel or server from Toolbox | DA | Partial | `toolbox/toolbox-overview.spec.ts` verifies both typed-confirmation dialogs start disabled and cancels each without sending an action | Exact confirmation validation, transition/reconnect, success, failed restart/retry, dependent-service recovery, permissions, and a maintenance-window target. |
| Synchronize server time | DA | None | The Sync action is inventoried but never invoked | Confirmation if applicable, success and refreshed clock, NTP/timezone consistency, failure/retry, permissions, and rollback. |
| Inspect operation logs | PR | Strong | `read-only/logs/operation-logs.spec.ts` validates the live paged contract and table cardinality without exposing record contents; covers reload, synthetic multi/empty states, exact source/status/node/search payloads, unavailable feedback, retry, and UI/API consistency | Pagination beyond the first page, automatic refresh, permission-denied behavior, record detail when exposed, and stale/out-of-order responses. |
| Inspect login logs | PR | Strong | `read-only/logs/login-logs.spec.ts` validates the live paged contract and table cardinality without exposing records; covers reload, synthetic multi/empty states, exact status/IP search payloads, unavailable feedback, retry, and UI/API consistency | Pagination beyond the first page, automatic refresh, permission-denied behavior, and stale/out-of-order responses. |
| Inspect system logs | PR | Partial | `read-only/logs/system-logs.spec.ts` maps the live date inventory while replacing content reads with safe empty responses; covers Node Monitoring and Panel Service date selection, exact read payloads, synthetic content, reload, multi/empty dates, unavailable feedback, and retry | Follow behavior, read pagination, permission-denied behavior, content-read failure/retry, and stale responses. |
| Inspect task logs | PR | Strong | `read-only/logs/task-logs.spec.ts` validates the live paged contract and table cardinality without exposing task content; covers reload, synthetic multi/empty states, Success/Running request mapping, exact task-ID detail lookup, safe output rendering, unavailable feedback, and retry | Pagination beyond the first page, Failed filter, Follow/download behavior, permission-denied state, detail-read failure/retry, and stale responses. |
| Inspect SSH login logs | PR | Strong | `read-only/logs/ssh-logs.spec.ts` validates the live paged contract and row cardinality without exposing records; deterministic data covers multi/empty states, exact status and search requests, localized row mapping, explicit refresh, unavailable feedback, retry, and UI/API consistency | Pagination beyond the first page, automatic refresh, export behavior, permission-denied behavior, and stale/out-of-order responses. |
| Inspect website logs | PR | Strong | `read-only/logs/website-logs.spec.ts` maps the live site inventory while replacing every content read with a safe empty response; deterministic data covers empty and populated inventories, exact site and access/error log selection, safe rendered content, reload recovery, cleanup cancellation, unavailable feedback, and retry | Follow/download behavior, content-read failure/retry, pagination, permission-denied behavior, and stale responses. |
| Clean panel logs | M | Partial | `read-only/logs/operation-logs.spec.ts` opens the cleanup dialog, cancels it, proves no non-read log request was sent, and confirms rows remain | Exact selection validation, confirmed cleanup of test-owned records on a disposable target, partial failure/retry, persistence, cross-view effects, and audit evidence. |
| Inspect process inventory, details, and connection counts | PR | Strong | `process-inventory.spec.ts` validates the complete live `/api/v2/process/ws` schema and virtualized row identities without emitting process values; deterministic socket snapshots cover multi/empty filtering with exact queries, complete row fields, an exact dummy-PID detail GET, drawer cancellation, and closed-socket reload recovery. `processes.spec.ts` retains combined filters and connection sorting | Status/PID request mapping, non-empty Files/Environment/Network detail tabs, live detail API parity, permission-denied behavior, and stale/out-of-order socket frames. |
| End a process | DA | None | End controls are observed only; the read-only guard blocks any stop request and no test selects or ends a live process | Disposable uniquely identified process fixture, confirmation/cancel, success and disappearance, protected-process denial, failure/retry, audit consistency, and exact PID cleanup. |
| Inspect disk inventory | PR | Strong | `disk.spec.ts` maps every live system partition and displayed storage field to `GET /api/v2/hosts/disks`, reloads it, and covers deterministic empty and multi-partition inventories plus retrieval failure/recovery | Map ordinary/unpartitioned disk sections when exposed, permission-denied behavior, partial/malformed records, and stale responses. |
| Operate on disks and partitions | DA | None | Action cells are observed only and no mount, unmount, format, or other disk request is sent | Disposable storage target, action eligibility, warnings/cancel, success/failure/retry, persistence, dependent file paths, recovery, and exact cleanup. |
| Use system monitoring | PR | Strong | `system-monitoring.spec.ts` maps live load, CPU, memory, disk-I/O, and network series plus option inventories to exact API requests; validates all five nonblank canvases, aggregate and per-chart refresh, reload, deterministic empty results and redraws, and failure/retry | Explicit custom-range validation/cancellation, non-default disk/network selection where exposed, permission-denied behavior, and stale/out-of-order responses. |
| Configure firewall and SSH | DA | Route only | Main navigation and SSH-copy regression | Rule/setting lifecycles, validation, cancel, persistence, lockout-safe rollback, permissions and exact cleanup. |
| Inspect installed Applications | PR | Strong | `read-only/system/applications.spec.ts` validates both live search requests and inventory cardinality without opening a live row; deterministic empty/single/multi data covers running, stopped, and error status, version/port rendering, action eligibility, exact tag/name filters, refresh/reload persistence, failure feedback, and retry. Finding 36 records that `/hosts/apps` remains active and `/apps` redirects to it while Applications is absent from navigation; intended exposure is unconfirmed | Clarify whether the route is supported, internal, retired, or replaced; then align navigation, routing, documentation, and coverage. Also add permission-denied behavior, pagination beyond the first page, stale/out-of-order responses, and safe log/detail drawers when they can be fully intercepted. |

### Apps, MCP, users, backup, and alerts

| Skill | Lane | Status | Current evidence | Highest-value missing dimensions |
| --- | --- | --- | --- | --- |
| Run or switch Kneo Apps | DA | Partial | `read-only/ai/kneo-apps.spec.ts` maps synthetic current/available apps and action eligibility, covers stop cancellation, intercepted start/switch/restart, reload persistence, and switch failure/retry | Live progress, permissions, unavailable dependencies, repair behavior, cross-service effects, and cleanup on a disposable target. |
| Browse and configure MCP tools | M | Route only | Main navigation only | Tool/server lifecycle, validation, connection test, permissions, failure/retry, exact cleanup. |
| Create, edit, authorize, and delete users | DA | None | None | Field validation, roles/permissions, self-protection, login verification, disable/delete, exact cleanup. |
| Configure alert notifications and send a test | M | Route only | Settings navigation and labels only | Channel validation, secret masking, send success/failure/retry, save/cancel, persistence and restoration. |
| Configure backup accounts | M | Route only | Settings navigation and labels only | Account validation/test, secret masking, lifecycle, failure/retry, exact cleanup. |
| Create, restore, and delete snapshots/backups | DA | Route only | Settings navigation and labels only | Progress, cancel where allowed, retention, failed/partial backup, restore verification, cross-feature consistency, cleanup. |
| Inspect About/version information | PR | Strong | `read-only/settings/about-version.spec.ts` maps the live panel and KIS version endpoints to the UI without emitting their values, validates the compiled build identifier, and covers reload consistency, deterministic value changes, absent-value placeholders, KIS unavailable feedback/recovery, permission-denied sign-out, and the absence of update controls in the current build. Panel-version failure suppressing the independent KIS lookup is tracked as bug 37 | Fix independent KIS retrieval; then add stale/out-of-order response coverage if the page gains concurrent refresh and update/upgrade states if controls are exposed in a later build. |

## Ordered implementation backlog

Each backlog item is complete only when its applicable coverage-contract
dimensions are implemented and the matrix row is updated in the same change.

1. **Finish File Browser lifecycle (PR + M):** add upload overwrite handling,
   recycle-bin restore when enabled, permissions, multi-select behavior, very
   large files. Browsing/API mapping, disabled
   recycle state, cardinality and pagination, exact file/folder creation,
   upload progress and in-progress cancellation, single/multi-file upload
   total and partial-batch failure/retry, byte-for-byte download, file/folder rename/delete, copy/move,
   collision cancel/overwrite/rename, deterministic retry, persistence, exact
   cleanup, and residue audit are covered. Stale Favorites after file deletion
   and the `/dev` directory load timeout are tracked product defects.
2. **Finish user-facing model delete (AI):** confirmed synthetic deletion and
   reload persistence now complement the exact warning/cancel checks. Add live
   dependency protection, failure/retry, permissions, and exact cleanup of a
   test-created version through the UI.
3. **One-Click collection and candidate lifecycle (AI, deferred):** Hugging Face and
   Ollama validation, scan result cardinality, selection/save, persistence,
   delete/weight choices, failure/retry, and exact cleanup.
4. **One-Click preparation (AI, deferred):** automatic and manual parameter matrices,
   progress transitions, browser revisit, technical failure details, retry, and
   interrupted-work cleanup.
5. **One-Click deploy, Try it, benchmark, and cleanup (AI, deferred):** capacity recheck,
   healthy deployment, request/response/API command, pause/disabled benchmark
   states, stop/delete/release behavior, history, GPU release, and cleanup.
6. **Finish Provider and service lifecycle (DA):** browser-intercepted tests now
   cover SSH credential lifecycle, add/remove Provider, service stop/retry,
   Gateway start, Clean Restart confirmation, and traffic control. Add live
   transitions, dependent-model behavior, permissions, rollback, and recovery
   on an isolated target.
7. **Finish security, users, alerts, and backups (M + DA):** Security inventory,
   cancellation, validation, password failure, and HTTPS cancellation are now
   covered without writes. Add reversible lockout-safe persistence and rollback,
   then implement users, alerts, backup accounts, and snapshot lifecycles.
8. **Remaining module workflows:** container lifecycle, remote terminal hosts and
    Quick Command management, firewall/SSH, Applications, Kneo
    Apps, MCP, and Toolbox. Container inventory mapping, empty/multi states,
    status/name filtering, unavailable runtime, failure/retry, and reload are
    covered in the PR lane without controlling a live container. Container
    details, CPU/memory statistics, inspect failure recovery, and safe
    EventSource logs now have direct coverage as well. Panel
    operation, login, task, and system-log workflows now have direct coverage;
    current/historical GPU, System Monitoring, process inventory/detail, and
    disk inventory, Overview disk/network monitoring, and SSH/website log
    workflows also have direct API/UI coverage. Their
    empty-state and unavailable-feedback defects remain tracked. Process and
    disk lifecycle actions remain explicitly uncovered and gated.

## Maintenance rule

Every new workflow test must name the skill and dimensions it adds in its test
description or suite, update this matrix, and be assigned to exactly one CI
lane. A route-only check may remain as smoke coverage, but it cannot close a
workflow row.
