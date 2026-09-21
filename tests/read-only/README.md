# Read-only tests

Place numbered regression tests in the directory matching their bug-report
category. Keep general page-loading and navigation checks in `smoke`.

All tests in this scope must import the guarded fixture from
`tests/fixtures/read-only-test.ts`. If a finding requires creating, editing,
deleting, executing, enabling, or disabling a server object, it belongs under
`tests/mutating` instead.

Behavior tests should assert the result of a control interaction, such as the
active tab, filtered rows, sort order, drawer state, or disabled bulk actions.
Avoid tests that only prove a button is visible when a safe outcome can also be
verified.

Use `test.fail()` for a reproduced, documented defect whose fix should produce
an unexpected pass. Use a runtime `test.skip()` only when the environment lacks
an explicit prerequisite, such as a configured container runtime.
