# Verified KneoPanel UI bugs

## Verification details

- Date verified: 2026-09-16
- Environment: Approved KneoPanel test environment
- Testing scope: Read-only UI interactions, authorized embedded sign-in and
  session checks, and explicitly authorized dummy cron job, group, and script
  mutations
- Persistent settings or server resources changed: None. All uniquely named test
  jobs, groups, and scripts created during verification were removed. No existing
  jobs, groups, or scripts were modified.

## Logical inconsistencies

These issues cause a control to produce an invalid, unexpected, or unstable
result.

### 20. Deleting an in-use cron group leaves its jobs unassigned

**Location:** Cron Jobs > Cron Job

**Steps to reproduce**

1. Create a Shell cron job named `test_cron` with `/bin/true` as its script.
2. Open Group, create a group named `test_group`, and save it.
3. Edit `test_cron`, assign it to `test_group`, and confirm the change.
4. Verify that the cron-job list displays `test_group` for `test_cron`.
5. Open Group and delete `test_group`.
6. Inspect `test_cron` in the list, open its Edit form, and inspect the Group
   filter.

**Expected result**

The interface should preserve a valid group assignment. It should either block
deletion while cron jobs use the group, as Script Library does, or reassign the
affected jobs to `Default` after deletion.

If unassigned cron jobs are intentionally supported, the Edit form should show
a clear unassigned state and the Group filter should include an option for
finding them.

**Actual result**

The group is deleted even though `test_cron` still uses it. The cron-job list
then displays `-` in the Group column instead of `Default`.

Opening Edit does not display `Default` or a clear unassigned state. It displays
the deleted group's raw numeric ID as the selected value. The ID was `15` during
verification; this value depends on the group record and can differ between
environments.

The Group filter continues to list only defined groups. It does not provide an
`Unassigned` option, so jobs left in this state cannot be isolated through the
group filter.

**Comparison with Script Library**

Attempting to delete a Script Library group while a test script uses it is
blocked with:

`Internal server error: The group is in use and cannot be deleted.`

Confirm whether cron-group deletion is intended to behave differently. If not,
the same in-use protection should be applied consistently to both features.

---

### 21. Script Library group filtering omits System and unassigned scripts

**Location:** Cron Jobs > Script Library

**Steps to reproduce**

1. Open Script Library and observe the built-in scripts assigned to `System`.
2. Open the Group filter and inspect its available options.
3. Open Create and remove the default `Default` group selection.
4. Create a non-interactive test script named `test_script` with `/bin/true` as
   its script content.
5. Inspect the new script's Group column and reopen the Group filter.

**Expected result**

Every group value displayed in the script list should be available as a filter.
The filter should therefore include `System`.

If scripts are allowed to have no group, the filter should also include an
`Unassigned` option. Otherwise, Group should be required and the Create form
should not allow its selection to be cleared.

**Actual result**

Nine built-in scripts displayed `System` in the Group column, but the Group
filter offered only `Default` before custom groups were created. `System` was
not available as a filter option.

The Create form allowed the `Default` group selection to be removed and allowed
the script to be saved. The resulting script had a blank Group column, but the
filter did not offer a blank or `Unassigned` option.

After a custom test group was created, the filter listed `Default` and the
custom group, but it still omitted both `System` and unassigned scripts. Adding
the custom group to a test script retained `Default` as an additional group,
confirming that this field supports multiple selections.

**Notes**

Confirm whether unassigned scripts are intended to be supported. If they are,
they need a visible label and filter option. If they are not, Group should be a
required field. The built-in `System` group should also be filterable even if it
is intentionally excluded from user-managed groups.

---

### 22. Embedded Grafana sign-in loads KneoPanel inside KneoPanel

**Location:** AI > KIS Monitoring > Embedded Grafana dashboard

**Steps to reproduce**

1. Open KIS Monitoring while signed in to KneoPanel.
2. Click the top-right dropdown arrow in the embedded Grafana dashboard twice
   to reveal its top search bar and `Sign in` link.
3. Click `Sign in`.
4. Enter the KneoPanel credentials in the login page shown inside the iframe
   and submit the form.
5. In the nested KneoPanel, open AI > KIS Monitoring and repeat the same steps.

**Expected result**

Grafana's sign-in action should not load the containing KneoPanel application
inside its own iframe. If separate Grafana authentication is not supported by
the embedding integration, `Sign in` should be hidden or disabled. If it is
supported, the action should lead to the correct Grafana sign-in page instead
of KneoPanel's login page.

**Actual result**

Clicking `Sign in` redirects the embedded dashboard to KneoPanel's login page
on the same server. Submitting valid KneoPanel credentials displays
`Logged in successfully` and replaces Grafana with another complete KneoPanel
interface inside the original panel.

The nested panel includes its own navigation and KIS Monitoring page. The user
confirmed that repeating the workflow there loads a third panel inside the
second one and allows further recursive nesting without an apparent limit.

The user also experienced an intermittent automatic logout twice after loading
a nested panel and navigating in the original outer panel. This workflow may
log the user out with `User not logged in: Session expired`; it does not happen
on every attempt. The initial report also described this message recurring
after otherwise successful attempts to sign back in.

**Scope verified**

Automated browser verification reproduced the embedded KneoPanel login and two
nesting levels. The user independently reproduced further recursive nesting.

Automatic logout remains a user-reported intermittent symptom, not an
automatically reproduced result. Automated observation for 35 seconds,
reopening the normal entrance, and navigation in the outer panel through
Overview, Cron Jobs, Settings, Logs, and Terminals retained an authenticated
session. Follow-up checks included direct navigation to Settings and outer
navigation after a second nesting level, without a session-expired warning.

## UI problems

These issues interfere with using a control or navigating the interface, but
do not directly create an invalid server state.

### 23. Embedded Grafana navigation displays Unauthorized while pages still load

**Location:** AI > KIS Monitoring > Embedded Grafana navigation menu

**Steps to reproduce**

1. Open KIS Monitoring while signed in to KneoPanel.
2. Click the top-left navigation-menu button inside the Grafana dashboard.
3. Observe the warning and the available menu items.
4. Click Home, Starred, Dashboards, Alerting, or Administration.

**Expected result**

The integration should handle unavailable user-specific features without a
generic authorization warning that conflicts with permitted navigation. Menu
items should reflect the access supported by the embedded dashboard.

**Actual result**

Opening the menu displays `Unauthorized`, but the menu remains available and
all five listed destinations load when clicked. The outer KneoPanel session
remains signed in.

The warning coincides with an HTTP `401` response from Grafana's user-preferences
request through the monitoring proxy, rather than a rejection of the clicked
navigation destination.

**Scope verified**

Home, Starred, Dashboards, Alerting, and Administration were opened read-only.
No dashboards, alert rules, contact points, or administrative settings were
changed. Loading these pages does not establish that privileged operations are
allowed, so this finding is not classified as a verified authorization bypass.

## Visual formatting

These issues affect presentation or wording but do not prevent the underlying
feature from operating.

### 24. Processes Connections header clips its label and sort indicator

**Location:** System > Processes > Processes

**Steps to reproduce**

1. Open System > Processes and keep the Processes view selected.
2. Inspect the Connections column header with the sidebar expanded.
3. Click the visible portion of the Connections header to sort the table.
4. Click it again to switch the sort direction and inspect the sort indicator.

**Expected result**

The column should provide enough space to display `Connections` and its sort
indicator. Users should be able to identify the sortable column and see its
active ascending or descending direction.

**Actual result**

The Connections column is too narrow to display the complete label. Its sort
arrow is also outside the visible header area and remains hidden when sorting
is active. Clicking the clipped header still switches the sort direction, but
the user cannot see the arrow indicating the current direction.

**Scope verified**

Reproduced in an English-language desktop browser at viewport widths of 1280,
1440, and 1920 pixels, with the sidebar expanded. Screenshots and header bounds
confirmed the clipping. At 1440 pixels, the header measured about 58 pixels
wide, while the label alone required about 85 pixels; the active 14-pixel sort
icon was positioned beyond the header's right edge and clipped by its hidden
overflow. Successive header clicks changed the underlying sort icon between
downward and upward arrows while the visible indicator remained hidden.

Only navigation, viewport resizing, and table sorting were performed. No
processes were ended or otherwise modified.
