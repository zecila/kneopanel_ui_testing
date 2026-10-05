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
- shell cron-job create, edit, group assignment, and delete without executing it.
- cron-job and Script Library edit-cancel and delete-cancel behavior;
- cron-job search combinations, row selection, and bulk-action enablement;
- Script Library search combinations, row selection, and bulk-action enablement;
- client-side required-field validation without create requests;
- protection against deleting an in-use Script Library group.
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
