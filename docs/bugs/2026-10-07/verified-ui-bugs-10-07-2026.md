# Verified KneoPanel UI bugs

## Verification details

- Date verified: 2026-10-07
- Testing scope: Script Library dependency lifecycle, local terminal input,
  installed Applications navigation, and About version retrieval
- Persistent settings or existing resources changed: None. Verification used one
  uniquely named dummy script and one uniquely named dummy cron job, then
  removed both exact server IDs. Remaining verification was read-only or used
  browser-side synthetic responses.

## Logical inconsistencies

### 34. A Script Library entry can be deleted while a cron job still references it

**Location:** Cron Jobs > Script Library

**Steps to reproduce**

1. Open Cron Jobs > Script Library and click Create.
2. Create a disposable entry named `bug34_test_script` with this script:

   ```sh
   /bin/echo bug34-before
   ```

3. Return to Cron Job and click Create.
4. Name the job `bug34_test_job`.
5. In the Script section, select Script Library, choose
   `bug34_test_script`, and confirm creation.
6. Find `bug34_test_job`, click Run, and open Records.
7. Confirm that the execution succeeded and its output contains
   `bug34-before`, then return to the job list.
8. Open Script Library, delete `bug34_test_script`, and confirm deletion while
   `bug34_test_job` still exists.
9. Return to Cron Job and run `bug34_test_job` again.
10. Inspect the notification and Records. The run either returns an immediate
    error or creates a record whose status is not Success.
11. Delete `bug34_test_job` after verification. The library entry should
    already be absent.

**Expected result**

Deletion should be blocked while a cron job references the library entry, with
feedback identifying the dependency. Alternatively, the user should be offered
an explicit reassignment or cascade operation that cannot silently leave an
unusable job.

**Actual result**

The Script Library entry is deleted successfully even though the cron job still
references its ID. The job remains visible, but a subsequent manual execution
does not succeed: it either reports an error immediately or creates a
non-Success execution record.

The same workflow proves that this is not snapshot behavior: editing the
library entry before deletion changes the next cron execution output. The job
therefore depends on the live entry that deletion removes.

**Impact**

Users can leave enabled cron jobs with dangling script references. Later runs
fail without the deletion action explaining which scheduled jobs will be
affected.

**Safety and cleanup**

Manual verification should use only the disposable names and harmless
`/bin/echo` command above. Delete the cron job after reproducing the failure.
Automated verification used unique names, captured the exact script and
cron-job IDs, deleted only those IDs, verified their absence, and did not
inspect or modify any preexisting job, script, process, or container.

**Automated coverage**

`library-script-integration.spec.ts` covers required selection, deterministic
create failure and retry, API ID binding, reload persistence, execution, edit
propagation, dependency deletion, post-delete failure, and exact cleanup. The
dependency defect is conditional: blocking deletion makes the test pass
normally, while successful deletion is recorded as an expected failure after
cleanup.

---

### 35. First blank submission in the AI helper input sends `undefined`

**Location:** Terminals > Localhost

**Steps to reproduce**

1. Open a local terminal session.
2. Locate the separate input with the `>` placeholder directly beneath the
   **AI Assistant** button. This is not the terminal command line inside the
   terminal emulator.
3. Leave this `>` input empty and press Enter once.
4. Observe `undefined: command not found` in the terminal output.
5. Leave the same `>` input empty and press Enter again.
6. Confirm that the second and subsequent blank submissions do nothing.

**Expected result**

Every blank submission in the `>` helper input, including the first one after
opening the terminal, should be ignored. No command should be sent to the
terminal session.

**Actual result**

The first blank Enter sends a `cmd` frame whose decoded data is the literal
string `undefined\n`. The shell responds with `undefined: command not found`.

This occurs only once. After the initial submission, pressing Enter while the
same field remains empty sends no additional command, which is the expected
baseline behavior. The one-time result is consistent with the field beginning
in an uninitialized `undefined` state and becoming an empty string after its
first interaction.

**Impact**

The first use of the helper input produces unintended shell activity and
confusing command-not-found output instead of acting as a no-op. Later blank
submissions behave correctly.

**Safety**

The regression installs a browser-side WebSocket mock before the terminal page
loads. The captured frame never reaches KneoPanel or a host shell.

**Automated coverage**

`terminal-workflow.spec.ts` identifies the separate `>` input by its
placeholder, verifies it appears empty, captures and decodes the first
synthetic socket frame, and confirms that a second blank Enter sends nothing
additional. The test conditionally expects failure for the one-time
`undefined\n` command. Sending no frame on either submission makes it pass
normally.

## Product intent findings

### 36. Applications route remains active without a navigation entry (intent unclear)

**Location:** System navigation and direct `/hosts/apps` route

**How it was found**

The installed Applications workflow appeared during coverage inventory based
on the October 2026 Quick Start material. It was not discovered through the
current sidebar. Opening `/hosts/apps` directly showed a functioning page, so
the route and its read-only inventory behavior were examined separately from
navigation.

**Steps to reproduce**

1. Sign in as the test administrator.
2. Expand **System** in the sidebar.
3. Confirm that no **Applications** item is present.
4. Enter `/hosts/apps` directly in the browser address bar.
5. Confirm that the page loads **Quick access**, an installed-app inventory,
   and its total.
6. Enter the legacy `/apps` path and confirm that it redirects to
   `/hosts/apps`.

**Product intent to clarify**

The current behavior alone does not establish a defect. Confirm which of these
states is intended:

- If installed Applications remains a supported user workflow, it should have
  a discoverable navigation entry or another documented interface entry point.
- If the workflow was deliberately retired, replaced, or made internal, the
  still-active direct route and legacy redirect should be reviewed, and
  documentation should identify the replacement rather than implying that the
  page remains user-facing.

**Confirmed current state**

System includes File Browser, Monitoring, Firewall, Processes, SSH Settings,
and Disk, but not Applications. The `/hosts/apps` route and its installed-app
inventory remain available when opened directly, and legacy `/apps` routes
redirect to it.

**Relationship to AI > Kneo Apps**

The visible **AI > Kneo Apps** entry is a different surface, not another link
to `/hosts/apps`:

- Kneo Apps opens `/ai/apps`, identifies itself as **Kneo Apps**, exposes
  **Refresh** and **Available Apps**, and invokes the Kneo-specific
  `/api/v2/kneo-apps/rescan` workflow.
- Applications opens `/hosts/apps` and uses the general installed-application
  APIs under `/api/v2/apps`, including installed inventory, tags, status,
  version, port, and application lifecycle controls.
- Navigating to `/hosts/apps` does not redirect to `/ai/apps`; both routes
  remain independently active.

Kneo Apps could still be the intended product-level replacement for the older
Applications workflow, but the current route behavior does not establish that.
Product or design confirmation is needed before treating either the missing
navigation entry or the active legacy surface as unintended.

**Impact**

If the page is still supported, users cannot discover it through the panel's
primary navigation. If it is intentionally retired or internal, leaving the
route active creates ambiguity for documentation, testing, and direct-link
users. Product intent is required before classifying either behavior as wrong.

**Safety**

Verification expanded the navigation and opened only the read-only inventory
route. No live application card or lifecycle action was selected. Detailed
card behavior uses reserved synthetic applications and intercepted responses.

**Automated coverage**

`system/applications.spec.ts` records the current state without classifying it
as a known defect: the exact Applications menu item is absent, `/hosts/apps`
loads the inventory, and `/apps` redirects to the canonical route. The test and
this finding should be revised once the intended exposure or replacement is
confirmed.

---

### 37. The Change Password dialog intermittently omits the New password field

**Location:** Settings > Panel > Panel password > Settings

**Steps to reproduce**

1. Sign in and open Settings > Panel.
2. Click **Settings** beside **Panel password**.
3. Repeat the workflow in a fresh browser context if all three password fields
   appear on the first attempt.
4. Observe that some dialog renders include **Original password** and
   **Confirm password**, but no **New password** field.

**Expected result**

The dialog should always render Original password, New password, and Confirm
password so the password change can be completed and validated.

**Actual result**

Two of three repeated automated runs omitted New password. The third rendered
all three fields and completed the validation and intercepted failure-feedback
workflow normally.

**Impact**

When the field is absent, users cannot enter a replacement password and the
core password-change workflow is unusable.

**Safety**

The automated test routes the password-update endpoint to a synthetic failure
inside the browser. It never submits a password change to KneoPanel and does
not modify the current user.

**Automated coverage**

`settings/settings-panel.spec.ts` detects the missing field immediately and
records it as a conditional known defect. When all fields render, the same test
checks mismatched-confirmation validation and failed-update feedback against
the intercepted endpoint.
