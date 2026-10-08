# Test organization

Tests are organized first by safety scope and then by KneoPanel product area.
Bug type and discovery date belong in the linked dated report, not in the test
directory name.

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
    |-- ai/
    |-- cleanup/
    |-- configuration/
    |-- cron-jobs/
    |-- scripts/
    `-- validation/
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
read-only/scripts/bug-021-system-group-filter.spec.ts
mutating/scripts/bug-021-unassigned-script.spec.ts
```

Add a Playwright annotation pointing to the dated report that defines the
expected and actual behavior:

```ts
test.info().annotations.push({
  type: 'bug-report',
  description:
    'docs/bugs/2026-09-16/verified-ui-bugs-9-16-2026.md#21-script-library-group-filtering-omits-system-and-unassigned-scripts',
});
```

Do not number general smoke coverage as though it reproduced a documented bug.

## CI lanes

Tag only fast, read-only checks of critical deployment behavior with `@smoke`.
The smoke set covers entrance availability, authenticated overview and refresh,
primary navigation, KIS node health, container inventory, and deployed version
identity. Keep detailed validation, simulated failures, edge states, and
historical regressions out of this tag.

The ordinary CI commands are intentionally disjoint:

```text
npm run test:ci:smoke          # tagged Chromium checks
npm run test:ci:regression     # remaining Chromium read-only checks
npm run test:ci:cross-browser  # complete Firefox and WebKit read-only checks
```

Every new critical workflow should contribute at most one representative smoke
check. Its deeper cases belong to the regression lane.

## Safety scopes

The default `npm test` command runs only public and read-only projects. Requests
that may mutate application state are blocked by the read-only fixture.

Mutating tests are excluded unless `ALLOW_MUTATIONS=true` and must be run through
`npm run test:mutating`. Follow `mutating/README.md` for resource naming and
cleanup requirements.

AI model mutations are a third, narrower scope. They are excluded from both
commands above and require `ALLOW_AI_MUTATIONS=true`, an approved Provider test
window, and `npm run test:ai-mutating`. See `mutating/ai/README.md`.

Run the model upload, registry generation, Add Version, and hard parameter
validation group with `npm run test:model-config`. The `:upload`, `:generate`,
and `:add-version` variants run one independently isolated stage; `:fast` runs
the complete group without a fallback binary upload. The default group copies
an existing model into an explicitly named test version when one is available.
It uses the local placeholder archive only when the model list and placeholder
weights are both empty, and cleanup removes only test-prefixed registry
versions.

Use `npm run test:all` for a single sequential run of every configured browser
and safety scope. The command requires both mutation gates and an exact approved
target. Its HTML, Markdown, and JUnit reports group results by project, feature
directory, suite, and descriptive test case so reviewers can find related
coverage such as model-instance status, lifecycle, GPU, and VRAM cases.
