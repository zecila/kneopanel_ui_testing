# Mutation tests

Tests in this directory are deliberately excluded from the default test run.

Place general isolated resource lifecycle coverage in `smoke`. Numbered bug
regressions remain in the directory matching their bug-report category.

Every test added here must:

- run only against a confirmed test environment;
- live in `smoke` for general lifecycles or the matching bug-report category;
- use a resource name returned by `uniqueResourceName()` from
  `tests/helpers/mutation-safety.ts`;
- retain the exact resource ID returned by the server;
- delete only that exact ID in `finally` or fixture teardown;
- verify that the exact test resource no longer exists after cleanup;
- avoid searching by a broad prefix during cleanup;
- run with one worker through `npm run test:mutating`;
- require the explicit environment variable `ALLOW_MUTATIONS=true`.

Do not put read-only navigation coverage in this directory.

## Current lifecycle coverage

The smoke suite covers:

- cron-group create, rename, and delete;
- Script Library create, edit, group assignment, and delete with `/bin/true`;
- shell cron-job create, edit, group assignment, and delete without executing it.
- cron-job and Script Library edit-cancel and delete-cancel behavior;
- cron-job search combinations, row selection, and bulk-action enablement;
- Script Library search combinations, row selection, and bulk-action enablement;
- client-side required-field validation without create requests;
- protection against deleting an in-use Script Library group.

`logical-inconsistencies/bug-020-cron-group-deletion.spec.ts` is marked as an
expected failure while KneoPanel still allows an in-use cron group to be
deleted. An unexpected pass means the defect was fixed and the marker should be
removed.

Mutation tests capture KneoPanel's authenticated CSRF and node headers without
logging or persisting their values. Cleanup runs in reverse dependency order,
uses exact server IDs, and verifies each tracked object is absent. Creation is
refused if the generated exact name already exists, and the final suite audit
fails if any resource with the `kneo-e2e-` prefix remains.
