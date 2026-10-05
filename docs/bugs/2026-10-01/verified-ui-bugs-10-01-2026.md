# Verified KneoPanel UI bugs

## Verification details

- Date verified: 2026-10-01
- Current panel: `http://10.200.210.183:15088`
- Previous panel represented in stale records: `10.200.210.238`
- Testing scope: Authenticated read-only API/UI correlation
- Persistent settings or server resources changed: None during this finding

## Logical inconsistencies

### 25. Historical failed load jobs appear as inoperable model instances after upgrade

**Location:** AI > KIS Models > Overview > Model Instance Status

**Steps to reproduce**

1. Open KIS Models > Overview on the upgraded `.183` panel.
2. Compare the Model Instance Status table with
   `POST /api/v2/core/settings/kis/instances` and
   `POST /api/v2/core/settings/kis/models/loaded`.
3. Compare any extra table rows with the `runtimeJobs` returned by
   `POST /api/v2/core/settings/kis/model/background/jobs` using
   `includeRuntimeJobs: true`.
4. Expand `View failure details` and inspect Instance ID and Operation.
5. Click Refresh and repeat the comparison.

**Expected result**

The instance table should show only current model instances. Historical failed
load attempts belong in Operation History. If a failed record intentionally
remains in the instance table, it must have a stable identity and a safe action
to dismiss, retry, or clean it up.

**Actual result**

The current instance and loaded-model APIs both returned zero records, and the
active-job query returned zero jobs. The UI nevertheless displayed two failed
instance rows:

- `gemma_4_e4b_it` / `kneo350_4_128k` / Provider `10.200.210.238`
- `nemotron_3_embed_8b_bf16` /
  `kneo350_512_16k_auto_b4_colo-muse-shared-mps10-embgraph-copy-copy-copy` /
  Provider `10.200.210.238`

Both rows had a blank Instance ID, a blank Operation cell, and no button or
link. Refresh preserved them. Expanding the details showed
`new model instance was not observed as healthy after timeout`.

The rows correlate with historical failed `load` jobs from September 30:

- `f973b53c-d496-40f4-879e-668cfc32fb60` for Gemma
- `d4db0cbc-9036-4baf-ac8d-e986bd3430b7` for Nemotron

The configured KIS nodes on `.183` are `.183` and `.185`; `.238` is not a
configured Provider and is unreachable. The job history also contains repeated
failed Nemotron unload attempts with `KIS_UNLOAD_TARGET_NOT_FOUND`, stating that
no matching running instance exists for the model/version on that Provider.

**Impact**

Historical failures look like current instances after the upgrade, but users
cannot operate or clear them. This conflicts with the empty current-instance
API and can incorrectly suggest that models are loaded on a retired Provider.

**Automated coverage**

`bug-025-stale-model-instances.spec.ts` correlates table rows with current
instances, configured Providers, and failed load jobs. It conditionally records
the reproduced behavior as a known defect and will become an unexpected pass
when stale failed jobs stop appearing as inoperable instances.

---

### 26. Ready models cannot complete GPU memory preflight

**Location:** AI > KIS Models > Overview > Load Model

**Steps to reproduce**

1. Open KIS Models > Overview on `.183`.
2. Click Load.
3. Select any model marked `Ready` and select the local Provider
   `10.200.210.183`.
4. Observe the GPU Requirement section and the Load button.

**Expected result**

KIS should promptly calculate the selected Ready model's GPU requirement and
available Provider capacity. A Ready model with sufficient capacity should be
loadable. If its weights cannot be inspected, the model should not be labeled
Ready, and the UI should preserve a persistent, actionable validation result.

**Actual result**

All six models shown as Ready returned HTTP and application code 200 from
`POST /api/v2/core/settings/kis/model/load/preflight`, but every response set
`canLoad: false` and returned:

- `memoryCapacity.code`: `GPU_MEMORY_UNVERIFIED`
- `memoryCapacity.reason`: `cannot verify weight tensor sizes: cannot read weight header`
- `weightBytes`: `0`

The Provider reported four total and four free GPUs. Depending on the selected
version, KIS calculated one, two, or four required GPUs, but still blocked
loading because memory capacity could not be verified. The UI displayed the
red inline message `GPU memory capacity could not be verified. Loading is
blocked.` and kept the Load button disabled.

Observed preflight times ranged from approximately 10 to 44 seconds. During
that interval the dialog remained in its GPU-requirement checking/placeholder
state, making the operation appear stalled. When changing among several
Nemotron versions in one open dialog, the model selection also intermittently
cleared and the original `Select a model and Provider to check GPU capacity.`
placeholder returned even though the API response contained GPU counts. An
isolated retry preserved the selection and displayed the red blocked state.

Affected Ready entries during verification:

- `gemma_4_e4b_it` / `kneo350_4_128k`
- `gpt_oss_20b_vllm` / `kneo350_20_128k`
- Four `nemotron_3_embed_8b_bf16` versions ending in `copy`, `copy-copy`,
  `copy-copy-copy`, and `copy-copy-copy-copy`

**Impact**

No model advertised as Ready can pass preflight or be loaded on the available
Provider. Users wait without immediate feedback, then receive a validation
error caused by unreadable weight metadata. In the intermittent selector-reset
case, the returned GPU requirement is discarded and the UI gives no durable
explanation of the completed preflight.

**Safety and evidence**

The investigation selected models and the Provider only. It did not click Load
or submit a model-load mutation. Screenshots and structured response data are
stored under
`docs/bugs/2026-10-01/evidence/kis-load-preflight/`.

**Automated coverage**

`bug-026-kis-model-preflight.spec.ts` dynamically selects a real Ready model
and Provider, captures the read-only preflight response, verifies the returned
GPU counts and blocked message, and records `GPU_MEMORY_UNVERIFIED` as a known
defect. The read-only request guard prevents the test from submitting Load.

---

### 27. Cyclic directory symlinks create an endlessly repeated File Browser path

**Location:** System > File Browser > `/bin` > `X11`

**Steps to reproduce**

1. Open System > File Browser.
2. Open the `/bin` entry, which is a symlink to `/usr/bin`.
3. Click the `X11` folder-like entry.
4. Click the `X11` entry again several times.

**Expected result**

File Browser should resolve the directory symlink to its canonical target and
keep the displayed path stable, or detect that the symlink points back to the
directory already being viewed and prevent recursive navigation. It should not
present fictitious nested `X11` directories.

**Actual result**

The `/bin` listing identifies `X11` as a directory symlink with target `/bin`.
Each click issues a successful directory search for a newly appended lexical
path:

- `/bin/X11`
- `/bin/X11/X11`
- `/bin/X11/X11/X11`

Every response shows the same `/bin` contents (1,693 entries), including
another `X11` directory symlink back to the current effective directory. The UI
therefore appears not to change while its path gains another `/X11` segment on
every click. The sequence can be repeated indefinitely.

**Scope check**

This was not reproduced with ordinary directory navigation: opening `/etc` and
then `/etc/apt` requested and displayed two distinct directories normally. The
non-cyclic `/bin -> /usr/bin` symlink also opened its target contents. The
verified defect is therefore scoped to cyclic or self-referential directory
symlinks rather than folders in general.

**Impact**

Users can enter a misleading, unbounded path even though they remain in the
same effective directory. Any later file action may reference a needlessly
expanded alias path, and the UI gives no indication that navigation has looped
back to an already open directory.

**Safety**

Verification used File Browser navigation and read-only directory-search
requests only. No server file or setting was changed.
