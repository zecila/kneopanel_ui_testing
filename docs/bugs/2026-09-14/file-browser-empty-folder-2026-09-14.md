# File Browser empty-folder test result

## Summary

- Date: 2026-09-14
- Environment: KneoPanel test server at `http://10.200.210.233:15088`
- Area: System > File Browser
- Result: Passed
- Cleanup: Passed; no dummy folder remains

## Purpose

Confirm that an administrator can create, see, and delete an empty test folder
through the File Browser without changing any existing file or directory.

## Safety boundaries

- The test used `/tmp`, not an application or user-data directory.
- The folder had a unique `kneo-e2e-` name.
- No existing row or bulk action was selected.
- Creation was permitted only when the request named the exact test path and
  declared the item as a directory.
- Deletion was permitted only when the request named the same exact path,
  declared the item as a directory, and requested permanent deletion.
- Permanent deletion was used so the test artifact was not left in the recycle
  bin.

## Dummy resource

- Name: `kneo-e2e-empty-folder-20260914-0c9bb64d`
- Exact path: `/tmp/kneo-e2e-empty-folder-20260914-0c9bb64d`

For a filesystem item, the exact absolute path is its cleanup identifier.

## Procedure

1. Authenticate using credentials from the ignored local `.env` file.
2. Open System > File Browser at `/tmp`.
3. Select Create > Folder.
4. Enter the unique dummy folder name.
5. Confirm creation.
6. Verify that exactly one table row contains the exact folder name.
7. Open that row's More menu and select Delete.
8. Select permanent deletion so the folder is not moved to the recycle bin.
9. Confirm deletion.
10. Search for the exact folder name and verify that no matching row remains.

## Results

| Check | Result |
| --- | --- |
| Folder creation response | HTTP 200 |
| Exact folder visible after creation | Passed |
| Delete request targeted only the exact folder | Passed |
| Folder deletion response | HTTP 200 |
| Exact folder absent after deletion | Passed |
| Unexpected write requests | None |

## Request safeguards observed

The create operation used:

```text
POST /api/v2/files
path = /tmp/kneo-e2e-empty-folder-20260914-0c9bb64d
isDir = true
```

The cleanup operation used:

```text
POST /api/v2/files/del
path = /tmp/kneo-e2e-empty-folder-20260914-0c9bb64d
isDir = true
forceDelete = true
```

Credentials, cookies, and response bodies are intentionally omitted.

## Automation note

The row action contains two nested elements with the accessible name `More`.
An unscoped role locator therefore matches both elements. The automation must
first locate the table row by the exact folder name, then target that row's
`.fu-table-operations__dropdown-trigger` element.

The first cleanup attempt stopped at this locator ambiguity before sending a
delete request. The locator was corrected, the exact delete payload was checked,
and the folder was then removed successfully.
