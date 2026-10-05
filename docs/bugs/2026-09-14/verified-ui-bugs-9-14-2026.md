# Verified KneoPanel UI bugs

## Verification details

- Date verified: 2026-09-14
- Environment: Approved KneoPanel test environment
- Testing scope: Read-only UI interactions
- Settings or server resources changed: None
- Responsive widths checked where applicable: 1440 px, 1100 px, and 900 px

The following observations are not classified as UI bugs in this report:

- The KIS Gateway and One-Click service failures are environment or backend
  problems. Only the way their error notification obstructs the interface is
  documented below.

## Logical inconsistencies

These issues cause a control to produce an invalid, unexpected, or unstable
result.

### 1. Selected Overview monitoring range resets during live refresh

**Location:** Overview > Monitoring > Network

**Steps to reproduce**

1. Open the Overview page.
2. Wait until the Monitoring graph contains several data points.
3. Drag either timeline handle to select a smaller, valid time range.
4. Release the handle.
5. Wait for the graph's next live update.

**Expected result**

The selected time range remains active while new monitoring data is added.

**Actual result**

The selected range is briefly applied, but the next live update restores the
full default range. During verification, this happened after approximately two
seconds.

**Notes**

Confirm whether resetting the range is intentional. Even if it is intentional,
it makes the range selector difficult to use because a user's selection
disappears almost immediately.

---

### 2. Overview monitoring handles allow an invalid range

**Location:** Overview > Monitoring > Network

**Steps to reproduce**

1. Open the Overview page.
2. Wait until the Monitoring graph contains several data points.
3. Drag the end handle to the left.
4. Continue dragging it past the start handle.
5. Release the handle.

**Expected result**

The end handle cannot move earlier than the start handle. The control should
clamp the handle, safely exchange the handle roles, or otherwise preserve a
valid chronological range.

**Actual result**

The handles can cross or collapse onto the same position. The graph may
temporarily display only one timestamp or no plotted line. The next live update
then restores the default full range.

**Additional observation**

Selecting an extremely small interval can produce a blank graph because the
interval contains only one sample. The interface should either enforce a
minimum range or display a message such as `Not enough data for the selected
range` instead of displaying an unexplained empty graph.

**Comparison with GPU Monitoring**

GPU Monitoring > Historical Records does not reset its selected range during
the same observation period. Its handles preserve chronological order when
dragged across each other. A very narrow GPU range can still appear empty, so
that symptom may be caused by insufficient samples rather than reversed time.

## UI problems

These issues interfere with using a control or navigating the interface, but
do not directly create an invalid server state.

### 3. First container status-filter click is consumed by an unsubmitted search

**Location:** Containers > Containers

**Steps to reproduce**

1. Select `Running`, `Restarting`, or `Exited`.
2. Focus the Search field and type a value, but do not press Enter.
3. Click a different status filter, such as `All`, once.

**Expected result**

The clicked status becomes active immediately, and the entered search text is
applied together with that status.

**Actual result**

The first status-filter click only submits the search under the previously
active status. The clicked status does not become active until it is clicked a
second time.

For example, after selecting `Running`, typing `a`, and clicking `All`, the
first request still contains `state: running` and `Running` remains selected.
A second click sends `state: all` and selects `All`.

**Scope verified**

- Reproduced while starting from `Running`, `Restarting`, and `Exited`.
- Reproduced when the destination was `All`, `Restarting`, or `Exited`.
- Reproduced with both matching text (`a`) and nonmatching text (`lllm`).
- Pressing Enter to submit the search before changing status avoids the issue.

---

### 4. KIS error notification obstructs the KIS Models tabs

**Location:** AI > KIS Models

**Preconditions**

KIS Gateway or One-Click is unavailable and the interface repeatedly displays
the `GET /instances` error notification.

**Steps to reproduce**

1. Open KIS Models while the KIS backend is unavailable.
2. Inspect the tabs at the top of the page.

**Expected result**

The error remains visible without covering navigation controls.

**Actual result**

The error notification is positioned over the KIS Models tab row and obscures
tab labels such as `From Hugging Face`, `Downloaded HF Weights`,
`Preparations`, and `Settings`. This was observed at 1440 px, 1100 px, and
900 px widths.

## Visual formatting

These issues affect presentation or wording but do not prevent the underlying
feature from operating.

### 5. Snapshots navigation label is misspelled

**Location:** Settings navigation

**Steps to reproduce**

1. Open Settings.
2. Inspect the section navigation.

**Expected result**

The navigation label reads `Snapshots`.

**Actual result**

The navigation label reads `Snaphshots`.
