# Test organization

Tests are organized first by safety scope and then by the category used in the
dated reports under `docs/bugs`.

```text
tests/
|-- public/                         # Unauthenticated checks
|-- read-only/
|   |-- logical-inconsistencies/    # Numbered bug regressions
|   |-- ui-problems/                # Numbered bug regressions
|   |-- visual-formatting/          # Numbered bug regressions
|   `-- smoke/                      # General navigation and page checks
`-- mutating/
    |-- smoke/                      # Isolated create/edit/delete lifecycles
    |-- logical-inconsistencies/    # Numbered tests that create test objects
    |-- ui-problems/                # Numbered tests that create test objects
    `-- visual-formatting/          # Numbered tests that create test objects
```

## Naming numbered regressions

Name regression files after the stable number and title in the bug report:

```text
bug-020-cron-group-deletion.spec.ts
bug-021-script-library-group-filtering.spec.ts
```

If one finding has independently useful read-only and mutating coverage, split
it across both scopes while retaining the same number:

```text
read-only/logical-inconsistencies/bug-021-system-group-filter.spec.ts
mutating/logical-inconsistencies/bug-021-unassigned-script.spec.ts
```

Add a Playwright annotation pointing to the dated report that defines the
expected and actual behavior:

```ts
test.info().annotations.push({
  type: 'bug-report',
  description: 'docs/bugs/verified-ui-bugs-9-16-2026.md#21',
});
```

Do not number general smoke coverage as though it reproduced a documented bug.

## Safety scopes

The default `npm test` command runs only public and read-only projects. Requests
that may mutate application state are blocked by the read-only fixture.

Mutating tests are excluded unless `ALLOW_MUTATIONS=true` and must be run through
`npm run test:mutating`. Follow `mutating/README.md` for resource naming and
cleanup requirements.
