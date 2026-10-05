# AI mutation tests

This suite performs real KIS model operations and is excluded from both the
default read-only suite and the dummy-resource mutation suite. Run it only
during an approved Provider test window.

The suite covers:

1. model load and UI unload;
2. automatic GPU assignment;
3. VRAM allocation and release;
4. insufficient GPU capacity handling;
5. duplicate-load prevention;
6. failed-load cleanup and recovery.

The `model-configuration/` group separately covers the registry workflow:

1. archive input validation and optional real bundle upload;
2. Generate Registry with GPU, context, sequence, and VRAM boundaries;
3. generated `config.yaml` values;
4. Add Version source-value persistence and the hard `TP <= GPU Count` rule;
5. creation of two exact versions followed by exact-version cleanup.

These cases deliberately exclude soft runtime-capacity assumptions. They do not
claim that a configuration will fit a particular model or Provider; load,
assignment, and live VRAM behavior remain in `ai-model-operations.spec.ts`.

For cases 1, 2, 3, and 5, the suite evaluates the current Ready model list and
selects an inactive candidate with the fewest required GPUs. The candidate must
fit the Provider's current free GPU count, complete the capacity check, and
produce no context-window or projected VRAM warning. Case 4 uses that Ready
selection but mocks the browser's preflight response to require one more GPU
than the Provider's reported total. It verifies the disabled action and that no
load request occurs, so this edge case remains deterministic without consuming
the whole Provider.

Provider selection is dynamic: the suite discovers running KIS nodes and checks
Ready models against each Provider's live preflight response. Set
`KNEO_AI_PROVIDER` only to override that discovery. Case 6 is optional because
it still requires a test-only Ready model/version that passes preflight and is
known to fail without damaging shared services. Set both failure-model values
to enable it; otherwise Playwright records that one case as skipped. Because
background-job responses do not identify a Provider, do not run concurrent
model operations during this suite.

Every submitted load is recorded against the instance list that existed before
the test. Cleanup sends `instanceIds` only for new exact instances and verifies
that those IDs disappear. It refuses a broad model-level cleanup when KIS does
not return an exact instance ID.

Use `npm run test:ai-mutating` or `npm run test:ai-mutating:ui`. Both commands
require the general mutation gate, the additional AI gate, and an exact approved
target URL. Provider and failure-model values are optional. UI Mode does not
load anything until a test is started.

The workflow is split into independently runnable stage files. Each command
still uses the same mutation gates, approved-target check, one worker, and exact
cleanup:

```bash
npm run test:model-config              # upload, generate, then add-version
npm run test:model-config:fast         # same group, skipping the binary transfer
npm run test:model-config:upload       # upload cases only
npm run test:model-config:generate     # Generate Registry cases only
npm run test:model-config:add-version  # Add Version case only
```

Append Playwright's title filter to run one case inside a stage, for example:

```bash
npm run test:model-config:generate -- -g "GPU Count"
```

The fixture is selected dynamically for every target. When Available Models is
not empty, the suite reads one existing model through Add Version and creates a
uniquely named `kneo_e2e_test_copy_...` registry/version from it. The source is
never submitted, changed, or deleted. When the list is empty, the suite checks
the configured placeholder weights and uploads the local archive only if those
weights are also absent. Add Version then creates a test-owned source registry
so the stage remains independently runnable.

`KNEO_MODEL_CONFIG_WEIGHTS_PATH` defaults to `qwen2_5_0_5b_instruct`.
`KNEO_MODEL_CONFIG_ARCHIVE` is normally unnecessary: the runner automatically
finds an archive named after the weights path, using any supported archive
extension, in either the repository root or its parent. Set it only to override
that discovery. Teardown deletes all and only registry versions whose model or
version has the `kneo_e2e_test_copy_` prefix. Uploaded placeholder weights and
pre-existing source models are not deleted.
