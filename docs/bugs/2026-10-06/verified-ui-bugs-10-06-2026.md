# Verified KneoPanel UI bugs

## Verification details

- Date verified: 2026-10-06
- Current panel: `http://10.200.210.152:15088/kneo`
- Testing scope: File Browser read-only navigation and exact-path disposable
  file lifecycles
- Persistent settings or server resources changed: None. File mutations use
  unique `/tmp/kneo-e2e-*` paths and are removed after verification.

## Logical inconsistencies

### 31. Deleting a favorited file leaves a stale favorite path

**Location:** System > File Browser > Favorites

**Steps to reproduce**

1. Create a uniquely named disposable file in `/tmp`.
2. Open the file's More menu and select Add to Favorites.
3. Open Favorites and confirm that the exact file is listed.
4. Close Favorites and permanently delete the file.
5. Open Favorites again.
6. Click the stale file name.
7. Reopen Favorites and click Open for the same entry.

**Expected result**

Deleting a file should remove its favorite record in the same operation, or the
Favorites list should omit records whose paths no longer exist. No action for a
deleted file should remain available.

**Actual result**

The permanent file deletion returned HTTP and application code 200, and an
exact-path lookup confirmed that the file was absent. Its path nevertheless
remained listed in Favorites.

Clicking the stale file name displayed:

```text
Internal server error: The target path does not exist!
```

Reopening Favorites and clicking Open displayed:

```text
Resource does not exist
```

The favorite had to be removed separately through Delete > Confirm. This is the
same path-based consistency problem previously documented for moved and renamed
favorites as bugs 7 and 8 on 2026-09-15, but deletion is a separate lifecycle
operation and was independently reproduced here.

**Impact**

Favorites accumulates dead entries after normal file deletion. Those entries
look actionable but lead only to conflicting error messages, leaving users to
remove each record manually after the underlying file is already gone.

**Safety and cleanup**

Verification used one uniquely named file under `/tmp`. The test permanently
deleted that exact file, removed the exact stale favorite through the UI, and
confirmed that neither test resource remained. No existing file or favorite
was changed.

**Automated coverage**

`bug-file-browser-favorite-delete.spec.ts` reproduces the create, favorite,
permanent delete, stale-name, and stale-Open sequence. Cleanup removes the exact
favorite before the condition is recorded as a known defect. If deletion starts
removing the favorite automatically, the test passes normally.


## UI problems

### 32. Opening `/dev` hangs until the request times out

**Location:** System > File Browser > Root directory > dev

**Steps to reproduce**

1. Open System > File Browser.
2. In the Root directory listing, locate `dev`.
3. Click Open.
4. Observe the loading overlay and the pending `/api/v2/files/search` request.
5. Continue waiting until the UI reports `Request timed out, try again later`.

**Expected result**

The `/dev` listing should load within a reasonable time. If device entries
cannot be listed safely, the request should fail within a bounded time and the
UI should return to an interactive state with actionable feedback.

**Actual result**

Opening `/dev` leaves the page behind a loading overlay for several minutes.
The breadcrumb changes to `dev`, but the disabled root listing remains visible
and the user cannot interact with the File Browser. The interface eventually
reports `Request timed out, try again later`.

The browser sends `POST /api/v2/files/search` with `path: /dev`. No response was
received during a five-minute automated observation, which places the delay
before response rendering rather than in rendering a returned directory list.
In manual verification, the request eventually reached the visible timeout
message instead of listing `/dev`.

Comparison measurements from the same authenticated browser session were:

| Directory | Items | API response | Visible in UI |
| --- | ---: | ---: | ---: |
| `/tmp` | 199 | 3.157 s | 3.762 s |
| `/etc` | 263 | 0.891 s | 3.025 s |
| `/dev` | Unknown | No response within 300 s | Still blocked |

The comparison directories returned hundreds of entries normally, so the
problem is specific to the `/dev` request rather than general File Browser
performance.

**Impact**

The File Browser becomes unusable for several minutes after a normal root
directory action. The eventual generic timeout does not explain why `/dev`
cannot be listed or offer a quicker recovery path.

**Safety**

Verification used File Browser navigation and the read-only directory-search
request only. No server file, setting, or persistent resource was changed.

**Automated coverage**

`bug-file-browser-dev-load.spec.ts` verifies that the UI sends the exact
read-only `/dev` listing request and allows 30 seconds for a response. The
request timeout is conditionally recorded as a known defect. A successful
response will become an unexpected pass and prompt removal of the defect
marker.

---

### 33. Same-directory copy exposes backend errors and records failed operations

**Location:** System > File Browser > Copy/Paste collision dialog

**Steps to reproduce**

1. Create a disposable folder and file.
2. Copy the file and paste it into the same folder without changing directories.
3. In the collision dialog, select Rename, enter the original unchanged file
   name, and click Confirm.
4. Repeat the same-directory copy and paste.
5. In the collision dialog, select Overwrite existing files and click Confirm.

**Expected result**

The collision dialog should recognize that the source and destination resolve
to the same live file. Confirming Rename with the unchanged name should make no
change: one file should remain with its current contents. Confirming Overwrite
should likewise be treated as a successful replacement/no-op, because replacing
a file with itself produces the same file and contents. Neither choice should
show an internal backend error or create a Failed operation-log entry.

Copy stores the source pathname rather than a snapshot of its bytes. If the
file is edited after Copy but before Paste, that pathname points to the edited
file at confirmation time; there is no earlier clipboard version to restore.
The same-path result should therefore retain the current edited contents.

**Actual result**

Rename allows the unchanged name and submits a copy request with the same
source and destination. The UI then displays:

```text
Internal server error: The file or folder already exists!
```

Overwrite also submits the source path as its own destination and displays:

```text
Internal server error: stderr: cp: '<file path>' and '<file path>' are the same file , err: exit status 1
```

The exact request payloads differed only in the collision choice: Rename sent
`cover: false` and the unchanged `name`, while Overwrite sent `cover: true`.
Both used the current directory as `newPath` and the file in that directory as
the only `oldPaths` entry. The original file remained present and only one row
with that name existed after each failed operation.

Logs > Panel Logs > Operation Logs contained two matching entries with status
`Failed`, preserving both internal error messages after the transient UI
notifications disappeared.

Copying a file into a different directory that already contains the same name
is not affected. Existing regression coverage confirms that choosing Overwrite
in that case replaces the destination successfully, and choosing Rename with a
unique name creates the renamed copy.

**Impact**

This is a low-impact edge case and did not cause data loss in verification.
However, it exposes implementation-level server errors for a harmless action
and adds misleading Failed records to the operation log. The raw `cp` error is
particularly confusing because the dialog presents Overwrite as a valid
resolution.

**Safety and cleanup**

Verification used one uniquely named directory and file under `/tmp`. Both
failed operations left the source present, and fixture teardown permanently
removed the exact test directory and its contents.

**Automated coverage**

`bug-file-browser-same-path-copy.spec.ts` reproduces both collision choices,
asserts their exact source/destination payloads and visible errors, confirms
that the original file remains singular, and verifies the two matching Failed
operation-log records. The behavior is conditionally marked as a known defect
so handling the actions without backend or log failures will prompt regression
review.
