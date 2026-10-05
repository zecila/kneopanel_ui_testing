# KneoPanel End-to-End Test Report

## Test Scope

| Field | Value |
| --- | --- |
| Test date | 2026-10-01 |
| KneoPanel target | `http://10.200.210.183:15088` |
| Security entrance | `/kneo` |
| Framework | Playwright |
| Browsers | Chromium, Firefox, WebKit |
| Test manifest | 204 cases in 38 files |
| Execution | Sequential, one worker |
| TypeScript validation | Passed |
| Mutation cleanup audit | Passed |

No credentials are included in this report.

## Final Result

| Status | Cases | Meaning |
| --- | ---: | --- |
| PASS | **181** | The expected behavior was verified on the current KneoPanel version. |
| KNOWN DEFECT | **9** | The test reproduced a documented product defect. |
| SKIP | **14** | The environment did not contain the state or resources required to execute the assertion. |
| FAIL | **0** | No unclassified product assertion failures remain. |
| Total | **204** | Every manifest case has a documented outcome. |

The complete case-by-case list is in
[`ALL-TEST-CASES.md`](ALL-TEST-CASES.md). It groups every case by browser,
project, and product feature and includes its status and duration.

This is behavioral test coverage, not source-code coverage. A formal claim of
95% code or skill-range coverage cannot be calculated without an agreed
coverage denominator and application instrumentation.

## Coverage Summary

| Product area | Behavior covered | Outcome |
| --- | --- | --- |
| Authentication | Login form, protected routes, credential validation, session refresh | Passed |
| Main navigation | Containers, Terminals, Toolbox, Logs, System, Settings, and AI destinations | Passed in all three browsers |
| One-Click KIS | Current configuration, pipeline health, model/provider/GPU requirements | Configuration and health passed; model-load preflight defect reproduced |
| Configuration settings | Dynamic One-Click address persistence and Panel alias update/restoration | Passed |
| GPU monitoring | Status columns, unique consecutive GPU numbers, refresh control | Passed in all three browsers |
| VRAM monitoring | Used/total VRAM validation for every GPU and API comparison | Passed in all three browsers |
| Model-instance status | Current API/UI mapping, refresh, failure-state contract, stale-row regression | Mapping and refresh passed; one defect reproduced; data-dependent case skipped |
| Model lifecycle | Load/unload, GPU assignment, VRAM allocation/release, capacity guard, duplicate prevention, failure recovery | Defined but skipped because the required model states were unavailable |
| Cron jobs | Create, edit, assign, search, selection, validation, deletion, and cleanup | Passed |
| Script Library | Create, edit, assign, search, protection, deletion, and cleanup | Passed |
| System and Settings | Disk, processes, sorting/details, Panel, Security, Alerts, Backup, Snapshots, About | Passed |
| Provider configuration | Safe Reapply preflight, confirmation, cancel, and error-notification check | Passed in all three browsers |

## Current-Version UI Validation

The following behaviors were verified against the current `.183` interface:

- Overview displays Load, CPU, Memory, storage, and GPU status gauges directly.
- KIS Models navigation completes and exposes its model-management tabs.
- The SSH port explanation uses the correct text: “Specify the port that SSH
  service listens on.”
- Cron-group deletion requires confirmation. Deleting an in-use group moves
  its scheduled jobs to the Default group, and ordinary group deletion
  completes successfully.
- All basic navigation cases pass in Chromium, Firefox, and WebKit.

## Model Instance Coverage

Model-instance cases are grouped under
`AI > KIS Models > Model instances` in the complete case list.

### Status and refresh

- API/UI mapping requires every current `/instances` record to appear in one
  complete row with model, version, provider, status, identity, and operation
  data. It passed in all three browsers.
- Refresh requires a new instance API request without submitting a mutation.
  It passed in all three browsers.
- The failed-current-instance contract requires failure details and an enabled
  exact-instance Unload action. It skipped in all three browsers because the
  current instance API contained no failed instance.
- The stale historical-instance regression reproduced in all three browsers.

### Lifecycle and resources

The suite contains explicit cases for:

1. Dynamic load, cancel, exact-instance unload, and cleanup.
2. Assignment of the GPU count returned by preflight.
3. VRAM increase while loaded and release after unload.
4. Rejection when Provider capacity is insufficient.
5. Prevention of a duplicate active-model load.
6. Unload of a failed instance before retrying it.

Cases 1-5 skipped because `.183` did not provide a Ready, inactive model that
passed the Provider's GPU/VRAM preflight. The later Bug 026 investigation found
that every Ready model was blocked because its weight header could not be read.
No model-load mutation was submitted. Case 6 skipped because no dedicated failure
model/version pair was available. These are visible coverage gaps and should
be rerun when an eligible model and a controlled failure model are available.

## Known Defects

| Defect | Result |
| --- | --- |
| Bug 015: quick-command validation text is clipped | Reproduced in Chromium and Firefox; not reproduced in WebKit |
| Bug 024: Processes Connections label/sort indicator is clipped | Reproduced in Chromium, Firefox, and WebKit |
| Bug 025: historical failed load jobs appear as current inoperable model instances | Reproduced in Chromium, Firefox, and WebKit |
| Bug 026: Ready models cannot complete GPU memory preflight | Reproduced in Chromium; the six-model investigation confirmed every Ready entry is affected |

## Skipped Cases

| Case | Executions | Reason |
| --- | ---: | --- |
| Container status first-click regression | 3 | No suitable configured container state was present. |
| Current failed-instance details and Unload action | 3 | `/instances` contained no failed current instance. |
| Model lifecycle cases 1-5 | 5 | No eligible Ready, inactive model fit current Provider GPU/VRAM capacity. |
| Failed-instance unload and retry | 1 | No controlled failure model/version pair was available. |
| Bug 026 cross-browser rerun | 2 | Firefox and WebKit had no selectable model after another model began serving on GPUs 0-3. Chromium reproduced the defect. |

## Investigated Issue 1: KIS Provider Internal Server Error

The supplied screenshot from the previous `.238` environment showed an Apply
failure for SSH target `kneox@10.200.210.185:22`. It reported a missing KIS
manifest and an incomplete Provider stop.

On `.183`, Provider `10.200.210.185` initially reported a different error:
permission denied while reading the Provider `.env`. KIS reported zero loaded
models, zero instances, and zero active jobs, although the Provider process was
still running.

With explicit approval, Apply was submitted once. The endpoint returned HTTP
and application code 200 with `providerStarted: true`. The node changed to
`running`, `kis_provider` became healthy, its error cleared, and heartbeats
resumed on port 8081. The Provider gateway changed from `kis-postgres` to
`10.200.210.183`. The original missing-manifest internal server error did not
recur.

No model or test resource was created. The automated suite performs only the
safe Reapply preflight and cancel workflow. That regression passed in all three
browsers.

Evidence is stored in
`evidence/kis-provider-apply/`.

## Investigated Issue 2: Stale Failed Model Instances

The reported post-upgrade issue reproduced on `.183`. The Overview table showed
two Failed rows assigned to the retired `.238` Provider:

- `gemma_4_e4b_it` / `kneo350_4_128k`
- `nemotron_3_embed_8b_bf16` /
  `kneo350_512_16k_auto_b4_colo-muse-shared-mps10-embgraph-copy-copy-copy`

The current instance and loaded-model APIs were empty, and there were no active
jobs. The rows came from historical failed load jobs:

- Gemma: `f973b53c-d496-40f4-879e-668cfc32fb60`
- Nemotron: `d4db0cbc-9036-4baf-ac8d-e986bd3430b7`

Both rows had blank instance IDs and Operation cells, exposed historical
timeout details, and persisted after Refresh. Historical Nemotron unload
attempts reported `KIS_UNLOAD_TARGET_NOT_FOUND`, consistent with there being no
current instance to operate.

Evidence, screenshots, and API/UI correlation data are stored in
`evidence/model-instances/`.

## Investigated Issue 3: Ready Models Fail GPU Memory Preflight

The reported long-running GPU Requirement check and red error were reproduced
on `.183`. All six entries presented as Ready were checked against the local
Provider. Each preflight eventually returned HTTP and application code 200,
calculated a requirement of one, two, or four GPUs, and reported four total and
four free Provider GPUs. Every result nevertheless set `canLoad: false` with:

- `GPU_MEMORY_UNVERIFIED`
- `cannot verify weight tensor sizes: cannot read weight header`
- `weightBytes: 0`

The UI then displayed `GPU memory capacity could not be verified. Loading is
blocked.` in red and kept Load disabled. Responses took approximately 10 to 44
seconds. During rapid sequential checks, some Nemotron selections also reset
to the original “Select a model and Provider” placeholder after the response.

The permanent regression dynamically selects a real model and Provider,
captures the preflight response, and verifies the blocked UI state. Chromium
reproduced the defect in the final targeted run. Firefox and WebKit skipped
because `qwen3_asr_1_7b` had begun serving on GPUs 0-3 and the UI consequently
offered no selectable model. These are environment skips, not passes or
failures. No Load request was submitted at any point.

Screenshots and structured response evidence are stored in
`evidence/kis-load-preflight/`.

## Reviewer Conclusion

The requested configuration, GPU numbering, VRAM utilization, and current
model-instance status coverage passes on the current KneoPanel version across
Chromium, Firefox, and WebKit. One-Click KIS configuration and health checks
pass, but the newly verified model-load preflight defect currently prevents
Ready models from being loaded. All ordinary navigation cases also pass.

Four documented UI defects remain reproducible. Live model lifecycle coverage
is implemented but remains unexecuted because the target lacks an eligible
model state; Bug 026 explains the current preflight block. The stale
post-upgrade model rows are a confirmed product defect. The previous Provider
internal server error did not reproduce on `.183`, and the current safe
Provider preflight passes.
