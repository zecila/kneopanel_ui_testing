# Verified KneoPanel UI bugs

## Verification details

- Dates verified: 2026-09-14 and 2026-09-15
- Environment: Approved KneoPanel test environment
- Testing scope: Read-only UI interactions and explicitly authorized dummy-file
  mutations
- Persistent settings or server resources changed: None. Dummy files named
  `test_file` and `test_file_new` were removed after verification, and the
  recycle bin was left empty.

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

---

### 3. Current-file version history does not honor the selected file

**Location:** System > File Browser > File tools > Version history

**Steps to reproduce**

1. Select an existing file in File Browser.
2. Open File tools > Version history.
3. Switch from `All files` to `Current file`.

**Expected result**

The `Current file` tab displays only history records belonging to the selected
file. If the file has no history, the tab displays an empty state.

**Actual result**

When no file-history records were available, switching to `Current file`
displayed `Internal server error: Bad request: <no value>` even though a file
was selected.

After history records had been created for `test_file`, the same workflow no
longer displayed the error, but selecting an unrelated existing file displayed
all historical records for `test_file`. The tab became visibly active, but its
history request returned the unrelated records instead of filtering by the
selected file.

**Additional observation**

The history lookup appears to be path-based rather than tied to the identity of
the current file instance. A newly created `/test_file` inherited records from
previously deleted files that had used the same path.

---

### 4. Moving a favorited file leaves a stale favorite path

**Location:** System > File Browser > Favorites

**Steps to reproduce**

1. Create `/test_file`.
2. Add it to Favorites.
3. Move it to `/home/test_file`.
4. Open Favorites and select the original `test_file` entry.

**Expected result**

The favorite follows the moved file and points to `/home/test_file`. The moved
file remains visibly favorited in the file listing.

**Actual result**

The favorite remains associated with `/test_file`. Selecting either the stale
favorite name or its file icon displays `Internal server error: The target path
does not exist!`.

The favorite state is associated with the saved path rather than the moved
file. This permits separate favorite records for the old and new paths, and
moving the file back to its original path makes the old favorite appear valid
again.

---

### 5. Renaming a favorited file leaves a stale favorite name and path

**Location:** System > File Browser > Favorites

**Steps to reproduce**

1. Create and favorite `/test_file`.
2. Open the file's More menu and select Rename.
3. Rename it to `test_file_new`.
4. Open Favorites.

**Expected result**

The favorite is updated to the new name and path, and `test_file_new` remains
visibly favorited in the file listing.

**Actual result**

Favorites still shows `test_file` at `/test_file`. Selecting that entry displays
`Internal server error: The target path does not exist!`, while the renamed
`test_file_new` row has an empty favorite star.

Renaming the file back to `test_file` makes the stale favorite valid and the
favorite star filled again, confirming that the record tracks the old path
rather than the file.

---

### 6. Restoring duplicate recycled paths silently loses one file

**Location:** System > File Browser > Recycle bin

**Steps to reproduce**

1. Create `/test_file`, save `test file 1` in it, and delete it to the recycle
   bin.
2. Create another `/test_file`, save `test file 2` in it, and delete it to the
   recycle bin.
3. Select both recycled `test_file` entries.
4. Click Reduction and confirm the restore.

**Expected result**

The interface warns that both files have the same destination and asks how to
resolve the conflict. It should not report that both files were restored unless
both contents remain accessible.

**Actual result**

The confirmation lists both files but gives no collision warning. The UI sends
two independent restore requests, both return success, and the recycle bin is
then empty. Only one `/test_file` exists at the original path afterward, so one
file has silently overwritten the other.

Which content survives is likely determined by request ordering and should not
be treated as deterministic.

---

## UI problems

These issues interfere with using a control or navigating the interface, but
do not directly create an invalid server state.

### 7. Empty-field login validation does not update after a language change

**Location:** Login page

**Steps to reproduce**

1. Select Traditional Chinese as the login-page language.
2. Submit the form with the username and password fields empty.
3. Confirm that the validation messages are displayed in Traditional Chinese.
4. Change the language to Japanese while the validation messages are visible.

**Expected result**

The existing validation messages are translated to the newly selected language,
or are cleared so that the next validation uses that language.

**Actual result**

The page heading and the `Username` and `Password` field labels change to
Japanese, but the validation messages remain `請輸入使用者名稱` and
`請輸入密碼`. The same stale-message behavior was also reproduced by submitting
the empty form in English and then switching to Traditional Chinese.

### 8. First container status-filter click is consumed by an unsubmitted search

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

### 9. KIS error notification obstructs the KIS Models tabs

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

---

### 10. Root directory size calculations hang or fail on transient `/proc` entries

**Location:** System > File Browser > Root directory

**Affected controls**

- The `Calculate` button in the toolbar, next to the root-directory size.
- The `Calculate` button in the footer, next to `DirectorySize`.

**Steps to reproduce**

1. Open the root directory in File Browser.
2. Click either root-level `Calculate` button.
3. Wait for the calculation to finish.

**Expected result**

The root size is calculated within a reasonable time. Files that disappear
while `/proc` is being scanned are skipped or handled without failing the whole
operation.

**Actual result**

The toolbar calculation remained pending for more than 30 seconds during
verification. The footer calculation eventually returned to its idle state and
displayed an error similar to:

`Internal server error: lstat /proc/<pid>/fd/<descriptor>: no such file or directory`

The file descriptor number is transient and can differ between attempts.
Calculating individual non-root directories completed normally.

---

### 11. Favoriting a file clears calculated directory sizes

**Location:** System > File Browser

**Steps to reproduce**

1. Open a non-root directory containing a file and at least one subdirectory.
2. Calculate the total `DirectorySize` shown in the footer.
3. Calculate an individual subdirectory's size.
4. Favorite the file.

**Expected result**

Favoriting a file changes only its favorite state. Previously calculated size
values remain visible.

**Actual result**

Favoriting the file refreshes the listing and discards calculated directory
sizes. During verification, both the footer's numeric `DirectorySize` and an
individual subdirectory's calculated size changed back to `Calculate`.

The user must calculate both values again after each favorite-state change.

---

### 12. Clicking `.1panel_clash` incorrectly treats it as the recycle bin

**Location:** System > File Browser > Root directory

**Steps to reproduce**

1. Open the root directory in File Browser.
2. Click the `.1panel_clash` folder name.
3. Enter `.1panel_clash` directly in the address bar and press Enter.

**Expected result**

Clicking the folder and entering its path directly both open the same directory.

**Actual result**

Clicking the folder displays `Click the "Recycle Bin" button to open the recycle
bin directory` and does not open it. Entering `.1panel_clash` in the address bar
opens the directory normally and displays its `files` and `info` subdirectories.

---

### 13. Settings documentation controls open a missing page

**Locations:**

- Settings > Alert Notification > Settings > Notification Method Configuration
- Settings > Backup Accounts

**Steps to reproduce**

1. Open Alert Notification settings and click `Documentation` beneath
   `Configure alert notification channels to receive panel message push`.
2. Open Backup Accounts and click `Documentation` beneath the S3 compatibility
   explanation.

**Expected result**

Each control opens the relevant section of the KneoPanel user manual.

**Actual result**

Both controls target the same missing Settings page in the user manual, using
section fragments `#3` and `#4`, respectively. The page returns `404 Not Found`,
although the documentation site's root page is available.

**Scope verified**

The Email notification `Test` action was not run. No email method was configured,
and the dialog requires external SMTP credentials and a recipient before a test
message can be sent.

---

### 14. Quick Commands group validation text is clipped

**Location:** Terminal > Quick commands > Group > Create group

**Steps to reproduce**

1. Open the Create group form.
2. Enter an invalid group name containing a space, such as `test group`.
3. Move focus out of the field to trigger validation.

**Expected result**

The complete validation message wraps onto additional lines, and the form row
expands enough to keep it readable.

**Actual result**

Only the first line of the following message is visible; its remaining text is
clipped by the next form row:

`This field must start with non-special characters and must consist of English,
Chinese, numbers, ".", "-", and "_" characters with a length of 1-128.`

The complete message remains present in the page DOM, but its container does not
provide enough visible height. Verification triggered client-side validation by
moving focus and did not create a group.

---

### 15. Container network tag values cannot be read in full

**Location:** Containers > Networks

**Steps to reproduce**

1. Open the Networks page.
2. Inspect a network whose Tags column contains a long configuration-hash tag.
3. Hover over a long tag and click `Expand...`.

**Expected result**

Long tag values can be read in full through wrapping, horizontal space, a
tooltip, or the expanded view.

**Actual result**

The long `com.docker.compose.config-hash=...` tag is clipped by the Tags cell's
hidden overflow. The tag has no tooltip or other accessible full-value label.
Clicking `Expand...` adds another tag but leaves the long hash clipped.

This was reproduced at 1440 px, 1100 px, and 900 px viewport widths. At 1440 px,
the Tags cell was 252 px wide while its content required approximately 631 px.

## Visual formatting

These issues affect presentation or wording but do not prevent the underlying
feature from operating.

### 16. Snapshots navigation label is misspelled

**Location:** Settings navigation

**Steps to reproduce**

1. Open Settings.
2. Inspect the section navigation.

**Expected result**

The navigation label reads `Snapshots`.

**Actual result**

The navigation label reads `Snaphshots`.

---

### 17. Unauthorized setting explanation contains a typo

**Location:** Settings > Security > Unauthorized setting > Settings

**Steps to reproduce**

1. Open Security settings.
2. Open the Unauthorized setting dialog.
3. Read the explanatory text.

**Expected result**

The sentence says `this response can hide panel characteristics`.

**Actual result**

The sentence says `this response can hid panel characteristic`.

---

### 18. SSH port explanation contains a typo

**Location:** System > SSH Settings > Configurations > Basic > Port

**Steps to reproduce**

1. Open SSH Settings.
2. Open Configurations and inspect the Port explanation under Basic.

**Expected result**

The explanation says `Specify the port that SSH service listens on.`

**Actual result**

The explanation says `Specific the port that SSH service listens on.`

---

### 19. Overview monitoring labels overlap at narrower viewport widths

**Location:** Overview > Monitoring > Network and Disk I/O

**Steps to reproduce**

1. Open Overview and wait for the Monitoring charts to load.
2. Resize the viewport to approximately 1100 px wide.
3. Inspect the Network chart's metrics, legend, and unit label.
4. Switch the monitoring chart to Disk I/O and inspect the same area.

**Expected result**

The summary metrics, chart legend, and unit label occupy separate readable areas
at supported viewport widths.

**Actual result**

The summary metrics wrap into the chart canvas. In Network, the `Up` and `Down`
legend and `(KB/s)` unit label intersect the `Total sent` and `Total received`
metrics. In Disk I/O, the `Read` and `Write` legend and `(MB/s)` unit label
intersect the `I/O operations` and `I/O latency` metrics.

The overlap was reproduced at 1100 px and remained present at 900 px. Network's
labels did not overlap at 1440 px, indicating that this is a responsive-layout
problem.
