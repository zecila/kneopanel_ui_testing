# Mutation tests

Tests in this directory are deliberately excluded from the default test run.

Group mutation tests by KneoPanel product area. Numbered regressions live
beside the lifecycle coverage for the same area.

Every resource lifecycle test added here must:

- run only against a confirmed test environment;
- live in the directory for the KneoPanel area they exercise;
- use a resource name returned by `uniqueResourceName()` from
  `tests/helpers/mutation-safety.ts`;
- retain the exact resource ID returned by the server;
- delete only that exact ID in `finally` or fixture teardown;
- verify that the exact test resource no longer exists after cleanup;
- avoid searching by a broad prefix during cleanup;
- run with one worker through `npm run test:mutating`;
- require the explicit environment variable `ALLOW_MUTATIONS=true`.

Reversible configuration tests must capture the original value before changing
it, register a fixture-level fallback restoration, restore the value in a
`finally` block, and verify the restored value through the UI.

Do not put read-only navigation coverage in this directory.

Use `npm run test:mutating:ui` to inspect or run the suite interactively. The
command applies the same permission and approved-target checks, refreshes
authentication, and hides the setup dependency from the UI test tree. Running
one test still creates real dummy resources. If a UI run is interrupted, check
for remaining `kneo-e2e-` resources before continuing.

## Current lifecycle coverage

The mutation suite covers:

- cron-group create, rename, and delete;
- Script Library create, edit, group assignment, and delete with `/bin/true`;
- Script Library selection in a cron job, create failure/retry, exact API
  binding, reload persistence, safe execution, live edit propagation,
  dependency deletion regression, and exact cleanup;
- shell cron-job create, edit, group assignment, and delete;
- exact-job enable/disable with cancellation and reload persistence;
- bulk cron status updates with deterministic partial failure, persisted mixed
  state, targeted retry, full recovery, and per-job API assertions;
- safe manual execution, trigger failure/retry, concurrent-run rejection,
  successful and failed records, and edit/retry recovery;
- cron output download, clear cancellation/confirmation, empty/single/multi
  history, and cleared-state persistence;
- exact-path File Browser folder creation, empty-state persistence, and cleanup;
- file upload cancellation and validation, byte-for-byte download, rename
  failure/retry and persistence, delete cancellation, and permanent deletion;
- multi-file upload failure, confirmed cancellation, reload/reselect retry,
  per-file success responses, persistence, and byte-for-byte downloads;
- partial-batch upload persistence and targeted retry of only the missing file;
- upload progress lockout, confirmed in-progress cancellation with no artifact,
  and a 1 MiB binary retry with byte-for-byte download verification;
- exact file creation, folder rename/delete, copy failure/retry, copy/move
  payloads, collision cancel/overwrite/rename with content verification,
  cardinality, and paginated persistence;
- exact ZIP creation and default-destination decompression, including removal
  and restoration of the archived source file;
- cron-job and Script Library edit-cancel and delete-cancel behavior;
- cron-job search combinations, row selection, and bulk-action enablement;
- Script Library search combinations, row selection, and bulk-action enablement;
- client-side required-field validation without create requests;
- stale-Favorite behavior after exact permanent file deletion, with exact
  favorite cleanup;
- same-directory copy collision behavior for unchanged Rename and Overwrite,
  including exact request payloads, source preservation, and failed operation
  logs;
- protection against deleting an in-use Script Library group;
- One-Click address validation, save, and reload using the discovered address;
- Panel alias update, reload, and verified restoration.

`cron-jobs/bug-020-cron-group-deletion.spec.ts` conditionally
records an expected failure only after it observes the documented orphaned-job
state. Blocking deletion or reassigning the job to `Default` both pass.

Mutation tests capture KneoPanel's authenticated CSRF and node headers without
logging or persisting their values. Cleanup runs in reverse dependency order,
uses exact server IDs, and verifies each tracked object is absent. Creation is
refused if the generated exact name already exists, and the final suite audit
fails if any resource with the `kneo-e2e-` prefix remains.
