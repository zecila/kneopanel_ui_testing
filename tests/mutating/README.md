# Mutation tests

Tests in this directory are deliberately excluded from the default test run.

Every test added here must:

- run only against a confirmed test environment;
- use a resource name returned by `uniqueResourceName()`;
- retain the exact resource ID returned by the server;
- delete only that exact ID in `finally` or fixture teardown;
- avoid searching by a broad prefix during cleanup;
- run with one worker through `npm run test:mutating`;
- require the explicit environment variable `ALLOW_MUTATIONS=true`.

Do not put read-only navigation coverage in this directory.
