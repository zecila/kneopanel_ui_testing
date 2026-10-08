# Verified KneoPanel UI bugs

## Verification details

- Date verified: 2026-10-05
- Current panel: `http://10.200.210.152:15088/kneo`
- Testing scope: Authorized model load/stop mutations and read-only correlation
  with KIS instance and background-job APIs
- Persistent settings or server resources changed: None. Every model instance
  used during verification was removed. KIS retained its normal immutable job
  history.

## UI problems

### 28. Stop can be submitted twice while a loading model transitions to Starting

**Location:** AI > KIS Models > Overview > Model Instance Status

**Steps to reproduce**

1. Open KIS Models > Overview and load `testing_model` version
   `kneo350_1_16k_change_params` on Provider `10.200.210.152`.
2. While the instance status is `Loading`, click Stop.
3. Observe the row while the model transitions from `Loading` to `Starting`.
4. If Stop becomes enabled again, click it a second time.
5. In the `Confirm stop` dialog, confirm stopping instance `0`.
6. Wait for the model to disappear, then inspect Background Jobs.

The same terminal error was also verified in Background Jobs after manually
repeating the sequence with `testing_model` version
`kneo350_2_16k_int_params`.

**Expected result**

After the first Stop is submitted, the row should retain a single pending stop
state. Stop should remain disabled while the instance moves through `Loading`,
`Starting`, and `Stopping`, even if a status refresh reports a different
lifecycle phase.

The client should not submit another stop for the same instance. If a duplicate
request nevertheless reaches KIS after the instance has already been removed,
the operation should be treated as an idempotent no-op rather than a failed user
operation.

**Actual result**

The behavior is timing-dependent. Immediate Stop attempts at `Loading (0%)`
canceled the load, completed one unload successfully, and removed the instance
without an error. With later timing, the row transitioned from `Loading` to
`Starting` and Stop became enabled again even though the first stop was still
being processed. A second confirmed Stop could then be submitted for the same
instance.

One automated retry of `kneo350_1_16k_change_params` produced a canceled load
followed by two successful `stop` jobs, proving that duplicate stop submissions
were accepted. Other retries kept Stop disabled during `Starting` or completed
one successful stop, confirming that the duplicate-control state is
intermittent. The two reported red UI messages were not reproduced
automatically for this version.

The manually initiated `kneo350_2_16k_int_params` sequence produced the
terminal job order below:

1. `load` at `2026-10-05T22:22:06Z`: `canceled`
2. `unload` at `2026-10-05T22:22:09Z`: `success`
3. `stop` at `2026-10-05T22:22:18Z`: `failed`

The failed stop recorded:

```text
POST /admin/unload failed: {"detail":{"code":"KIS_UNLOAD_INSTANCE_NOT_FOUND","message":"Requested instance_ids not found","model_name":"testing_model","version":"kneo350_2_16k_int_params","instance_ids":[0]}}
```

This confirms that the desired unload had already succeeded before the later
stop tried to operate on the same instance. The alternate message
`Invalid request parameters: no current instance matches the requested runtime
Provider` remains user-reported; it was not returned during this verification.

**Impact**

The model ultimately unloads, so the verified sequence did not leave a running
instance or block the main workflow. However, the re-enabled control invites a
duplicate action and can display a red error after a successful unload. It also
adds a failed stop to Background Jobs, making a successful user operation look
partially broken and obscuring genuine failures.

**Safety and cleanup**

Automated retries were restricted to the exact
`testing_model / kneo350_1_16k_change_params` target. The instance and
loaded-model APIs both returned no matching records after verification. The
temporary timing probe was removed from the test suite.

**Suggested regression coverage**

Track a pending stop by exact instance ID independently of refreshed lifecycle
status. Verify that only one stop request can be submitted until that operation
reaches a terminal state, and that an already-removed instance does not produce
a user-facing failure for the original successful action.

---

### 29. Numeric model configuration fields accept unsupported-looking characters

**Location:** AI > KIS Models > Overview > Generate Registry and Add Version >
Runtime

**Affected fields**

- GPU Count
- Tensor Parallel Size
- Context Window Length
- Maximum Concurrent Sequences
- GPU Memory Utilization

**Steps to reproduce**

1. Open Generate Registry or Add Version and continue to the Runtime step.
2. Clear one of the affected numeric fields.
3. Type a normal letter such as `a`; observe that it is ignored.
4. Type `e`, `-`, `+`, or `.` by itself; observe that the character can appear
   while the field is focused.
5. Move focus out of the field.
6. Repeat with complete values such as `1e1`, `+1`, `-1`, and `1.5`.

**Expected result**

The positive-integer fields should either accept digits only or immediately
explain any supported alternate numeric syntax. GPU Memory Utilization should
allow the decimal point needed for fractional values, while handling the other
characters consistently and without silently changing the user's entry.

Incomplete or unsupported input should produce a clear validation state rather
than briefly appearing and then disappearing when the field loses focus.

**Actual result**

All five controls are native HTML `input[type="number"]` elements. Chromium
therefore reserves `e`, `+`, `-`, and `.` for exponent, sign, and decimal
notation. A normal letter such as `a` is ignored immediately, but each reserved
character can enter the field's temporary editing buffer. During that state the
browser reports `validity.badInput: true` and exposes an empty numeric value.
Moving focus away silently clears the character and resets `badInput`.

Complete forms are handled differently:

- `1e1` is accepted and normalized to `10` in the positive-integer fields.
- `+1` is normalized to `1`.
- `-1` is clamped to the minimum value `1` in the positive-integer fields.
- `1.5` remains visible in the integer fields but has a native step mismatch
  because those fields use `step="1"`; continuing to the next step displays the
  application's existing positive-integer validation error.
- GPU Memory Utilization legitimately supports decimals. Values below `0.01`
  or above `1` are clamped to those configured bounds on blur.

The behavior was reproduced in both Generate Registry and Add Version for all
affected fields.

**Impact**

No invalid registry was saved during verification, and the existing boundary
and integer checks still prevent an invalid submitted configuration. The issue
is therefore minor and limited to input clarity and consistency. Users can see
characters that appear permitted even though incomplete forms disappear
silently, while exponent notation is accepted without being an advertised
input format.

**Safety**

Verification inspected browser values, input constraints, and validity state
only. Both dialogs were canceled before Preview or Upload, and no registry,
model instance, or server setting was created or changed.

**Suggested regression coverage**

Decide whether scientific notation and explicit signs are supported input
formats. If they are not, filter them consistently while preserving `.` for
GPU Memory Utilization. If native number-input behavior is retained, provide a
visible validation state for incomplete input and continue asserting integer
step validity before Preview.

---

### 30. Virus Scan briefly exposes controls for absent ClamAV services

**Location:** Toolbox > Virus scan

**Steps to reproduce**

1. Open Toolbox and select any section other than Virus scan, such as Cache
   clean.
2. Select Virus scan.
3. During the first fraction of a second, observe the ClamAV and FreshClam
   service cards before the empty-state panel replaces them.
4. Repeat the tab switch and quickly click Settings on the transient ClamAV
   card.
5. Observe the new section beneath the empty-state panel.
6. Switch among Clam AV daemon, FreshClam, Clam AV daemon logs, and FreshClam
   logs.

**Expected result**

Virus Scan should show a loading state until service detection completes. It
should not render service status or action controls before confirming that the
corresponding service exists.

When neither service exists, only the installation guidance should remain.
Settings and log requests should not be reachable, and the client should not
request a file or resource without the identifier required by the API.

**Actual result**

After switching to Virus scan, the previous section remains visible at the
instant of the click. At approximately 25 ms, the page renders these service
cards:

- ClamAV: `Enabled`, blank Version, and Stop, Restart, Settings, and Hide
  signature updater service actions.
- FreshClam: `Disabled`, blank Version, and Start and Restart actions.

The cards were still present at 300 ms and had been replaced by approximately
600 ms with:

`The ClamAV service was not detected. Please install it quickly using the
script library first!`

The read-only `POST /api/v2/toolbox/clam/base` response confirms that both
services are absent:

```text
version: -
isActive: false
isExist: false
freshVersion: -
freshIsActive: false
freshIsExist: false
```

Clicking the transient Settings button before it disappears leaves the normal
empty-state message visible but mounts an additional detail section beneath it.
That section contains Back, Clam AV daemon, FreshClam, Clam AV daemon logs,
FreshClam logs, and, on the configuration views, Save.

The configuration and log contents are empty. Opening the detail section and
switching among its tabs repeatedly sends
`POST /api/v2/toolbox/clam/file/search`. The server responds with HTTP 200 but
application code 500:

```text
Internal server error: Requested resource not found: <no value>
```

The same message appears as a red UI notification and can be displayed more
than once concurrently. `POST /api/v2/toolbox/clam/search` returned an empty
result, while `POST /api/v2/toolbox/clam/base` continued to report that neither
service exists.

**Impact**

The stale cards briefly report a service state that contradicts the completed
detection result and expose Start, Stop, Restart, Settings, and visibility
actions for nonexistent services. The short Settings race then leaves an
incoherent page containing both “service not detected” and service-detail
controls, while routine tab navigation produces internal-server-error
notifications.

No service action was submitted during verification, so the practical impact
observed here is UI confusion and avoidable error/log traffic rather than a
changed service state.

**Safety**

Verification used navigation plus the read-only device, service-status,
configuration-search, and log-search requests. Start, Stop, Restart, Hide,
Save, and installation actions were not clicked. No server setting, service,
file, or persistent resource was changed.

**Suggested regression coverage**

Render a loading placeholder until `clam/base` completes, then derive all
service cards and actions from its `isExist` values. If both services are
absent, ensure the detail section cannot mount and assert that no
`clam/file/search` request is sent without a concrete resource value.
