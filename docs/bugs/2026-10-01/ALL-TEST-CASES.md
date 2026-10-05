# KneoPanel Playwright Test Cases

- Result: **COMPLETED WITH KNOWN DEFECTS AND ENVIRONMENT SKIPS**
- Target: http://10.200.210.183:15088
- Date: 2026-10-01
- Total cases: 204
- FAIL: 0
- KNOWN DEFECT: 9
- SKIP: 14
- PASS: 181

Statuses reflect the final validated behavior on the .183 KneoPanel version. Each case is grouped by browser project and product feature.

## Results by project and feature

### setup

#### Auth

| Status | Test case | Duration |
| --- | --- | ---: |
| PASS | authenticate as the test administrator | 1.1 s |

### public-read-only

#### Public access > Authentication > Security Entrance

| Status | Test case | Duration |
| --- | --- | ---: |
| PASS | security entrance displays the login form | 786 ms |
| PASS | blocks an unauthenticated protected route without exposing login | 266 ms |
| PASS | validates empty username and password combinations without submitting | 1.9 s |

### read-only

#### Read only > Containers > Bug 003 Container Status Filter

| Status | Test case | Duration |
| --- | --- | ---: |
| SKIP | applies a new container status on the first click after typing search | 1.0 s |

#### Read only > AI > Bug 004 Kis Models Navigation

| Status | Test case | Duration |
| --- | --- | ---: |
| PASS | opens KIS Models without an error notification blocking navigation | 3.7 s |

#### Read only > Script Library > Bug 021 Script Group Filter

| Status | Test case | Duration |
| --- | --- | ---: |
| PASS | offers the built-in System group in the Group filter | 1.6 s |

#### Read only > AI > Bug 025 Stale Model Instances

| Status | Test case | Duration |
| --- | --- | ---: |
| KNOWN DEFECT | does not display historical failed load jobs as inoperable model instances | 5.7 s |

#### Read only > AI > Bug 026 Kis Model Preflight

| Status | Test case | Duration |
| --- | --- | ---: |
| KNOWN DEFECT | calculates GPU requirements for a Ready model without a weight-header error | 16.1 s |

#### Read only > AI > Ai Navigation

| Status | Test case | Duration |
| --- | --- | ---: |
| PASS | AI navigation > opens KIS from the sidebar | 1.3 s |
| PASS | AI navigation > opens KIS Monitoring from the sidebar | 3.2 s |
| PASS | AI navigation > opens GPU Monitoring from the sidebar | 2.6 s |

#### Read only > AI > Gpu Monitoring

| Status | Test case | Duration |
| --- | --- | ---: |
| PASS | GPU Monitoring > displays GPU status columns | 1.5 s |
| PASS | GPU Monitoring > numbers every reported GPU uniquely and consecutively | 1.7 s |
| PASS | GPU Monitoring > reports a valid VRAM utilization ratio for every GPU | 2.3 s |
| PASS | GPU Monitoring > selects an automatic refresh interval and returns to no refresh | 3.2 s |

#### Read only > AI > Kis Models

| Status | Test case | Duration |
| --- | --- | ---: |
| PASS | KIS Models > shows a valid One-Click service configuration without changing it | 3.2 s |
| PASS | KIS Models > reports every One-Click pipeline stage as healthy | 3.2 s |
| PASS | KIS Models > shows model, provider, and GPU requirements before loading | 3.7 s |

#### Read only > AI > Kis Monitoring

| Status | Test case | Duration |
| --- | --- | ---: |
| PASS | loads the embedded KIS monitoring dashboard | 2.7 s |

#### Read only > AI > Kis

| Status | Test case | Duration |
| --- | --- | ---: |
| PASS | KIS > displays the provider node table | 989 ms |
| PASS | KIS > displays node filtering controls | 875 ms |
| PASS | KIS > Provider reapply preflight: opens and cancels confirmation without an internal server error | 7.0 s |

#### Read only > AI > Model Instances

| Status | Test case | Duration |
| --- | --- | ---: |
| PASS | AI > KIS Models > Model instances > Status and refresh > API/UI mapping: displays each current instance record in one complete status row | 3.1 s |
| PASS | AI > KIS Models > Model instances > Status and refresh > Refresh: reloads the instance table from the API without mutation | 3.1 s |
| SKIP | AI > KIS Models > Model instances > Status and refresh > Failed-state recovery: exposes failure details and an enabled unload action | 2.7 s |

#### Read only > Cron Jobs > Cron Controls

| Status | Test case | Duration |
| --- | --- | ---: |
| PASS | Cron Jobs controls > keeps bulk actions disabled until a job is selected | 985 ms |
| PASS | Cron Jobs controls > opens and backs out of cron creation without submitting | 1.7 s |
| PASS | Cron Jobs controls > opens, starts, and cancels group creation | 2.5 s |
| PASS | Cron Jobs controls > switches to Script Library and cancels script creation | 2.4 s |

#### Read only > Navigation > Module Navigation

| Status | Test case | Duration |
| --- | --- | ---: |
| PASS | Main module navigation > opens Containers | 1.3 s |
| PASS | Main module navigation > opens Terminals | 1.5 s |
| PASS | Main module navigation > opens Toolbox | 1.4 s |
| PASS | Main module navigation > opens Logs | 1.5 s |
| PASS | Main module navigation > opens System > File Browser | 2.9 s |
| PASS | Main module navigation > opens System > Monitoring | 1.6 s |
| PASS | Main module navigation > opens System > Firewall | 1.6 s |
| PASS | Main module navigation > opens System > SSH Settings | 1.4 s |
| PASS | Main module navigation > opens AI > Kneo Apps | 1.3 s |
| PASS | Main module navigation > opens AI > MCP | 1.5 s |

#### Read only > Overview

| Status | Test case | Duration |
| --- | --- | ---: |
| PASS | Overview > displays the main dashboard sections | 1.1 s |
| PASS | Overview > displays the main system load status | 2.1 s |
| PASS | Overview > displays the KIS summary categories | 1.3 s |
| PASS | Overview > displays the system information fields | 1.2 s |
| PASS | Overview > shows Network monitoring by default | 1.2 s |
| PASS | Overview > switches between Disk I/O and Network monitoring | 1.5 s |
| PASS | Overview > remains authenticated after refreshing | 1.4 s |

#### Read only > Settings > Settings Navigation

| Status | Test case | Duration |
| --- | --- | ---: |
| PASS | Settings > opens the Panel settings page from the sidebar | 1.3 s |
| PASS | Security > opens the Security settings from the Settings page | 1.5 s |
| PASS | Alert Notification > opens the Alert Notification settings from the Settings page | 1.6 s |
| PASS | Backup accounts > opens the Backup accounts settings from the Settings page | 1.9 s |
| PASS | Snapshots > opens the Snapshots settings from the Settings page | 1.6 s |
| PASS | About > opens the About page from the Settings page | 1.5 s |

#### Read only > Settings > Settings Panel

| Status | Test case | Duration |
| --- | --- | ---: |
| PASS | opens the Panel user settings dialog | 2.3 s |

#### Read only > System > Disk

| Status | Test case | Duration |
| --- | --- | ---: |
| PASS | displays mounted disk information | 1.0 s |

#### Read only > System > Processes

| Status | Test case | Duration |
| --- | --- | ---: |
| PASS | Processes > combines and clears process filters | 3.7 s |
| PASS | Processes > opens and closes process details without ending it | 3.0 s |
| PASS | Processes > cycles the Connections sort direction | 2.4 s |

#### Read only > System > System Navigation

| Status | Test case | Duration |
| --- | --- | ---: |
| PASS | System navigation > opens Processes from the sidebar | 2.4 s |
| PASS | System navigation > opens Disk from the sidebar | 1.4 s |

#### Read only > Terminal > Bug 015 Quick Command Validation

| Status | Test case | Duration |
| --- | --- | ---: |
| KNOWN DEFECT | shows the complete invalid quick-command group message | 2.0 s |

#### Read only > Settings > Bug 017 Unauthorized Copy

| Status | Test case | Duration |
| --- | --- | ---: |
| PASS | uses grammatically correct Unauthorized setting copy | 976 ms |

#### Read only > System > Bug 018 Ssh Port Copy

| Status | Test case | Duration |
| --- | --- | ---: |
| PASS | uses grammatically correct SSH port copy | 913 ms |

#### Read only > System > Bug 024 Process Connections Header

| Status | Test case | Duration |
| --- | --- | ---: |
| KNOWN DEFECT | fits the Connections label and active sort indicator | 1.1 s |

### read-only-firefox

#### Read only > Containers > Bug 003 Container Status Filter

| Status | Test case | Duration |
| --- | --- | ---: |
| SKIP | applies a new container status on the first click after typing search | 2.8 s |

#### Read only > AI > Bug 004 Kis Models Navigation

| Status | Test case | Duration |
| --- | --- | ---: |
| PASS | opens KIS Models without an error notification blocking navigation | 6.7 s |

#### Read only > Script Library > Bug 021 Script Group Filter

| Status | Test case | Duration |
| --- | --- | ---: |
| PASS | offers the built-in System group in the Group filter | 2.5 s |

#### Read only > AI > Bug 025 Stale Model Instances

| Status | Test case | Duration |
| --- | --- | ---: |
| KNOWN DEFECT | does not display historical failed load jobs as inoperable model instances | 7.6 s |

#### Read only > AI > Bug 026 Kis Model Preflight

| Status | Test case | Duration |
| --- | --- | ---: |
| SKIP | calculates GPU requirements for a Ready model without a weight-header error | 5.5 s |

#### Read only > AI > Ai Navigation

| Status | Test case | Duration |
| --- | --- | ---: |
| PASS | AI navigation > opens KIS from the sidebar | 2.1 s |
| PASS | AI navigation > opens KIS Monitoring from the sidebar | 4.3 s |
| PASS | AI navigation > opens GPU Monitoring from the sidebar | 3.2 s |

#### Read only > AI > Gpu Monitoring

| Status | Test case | Duration |
| --- | --- | ---: |
| PASS | GPU Monitoring > displays GPU status columns | 2.2 s |
| PASS | GPU Monitoring > numbers every reported GPU uniquely and consecutively | 2.1 s |
| PASS | GPU Monitoring > reports a valid VRAM utilization ratio for every GPU | 4.3 s |
| PASS | GPU Monitoring > selects an automatic refresh interval and returns to no refresh | 3.8 s |

#### Read only > AI > Kis Models

| Status | Test case | Duration |
| --- | --- | ---: |
| PASS | KIS Models > shows a valid One-Click service configuration without changing it | 3.7 s |
| PASS | KIS Models > reports every One-Click pipeline stage as healthy | 4.1 s |
| PASS | KIS Models > shows model, provider, and GPU requirements before loading | 4.6 s |

#### Read only > AI > Kis Monitoring

| Status | Test case | Duration |
| --- | --- | ---: |
| PASS | loads the embedded KIS monitoring dashboard | 3.3 s |

#### Read only > AI > Kis

| Status | Test case | Duration |
| --- | --- | ---: |
| PASS | KIS > displays the provider node table | 1.4 s |
| PASS | KIS > displays node filtering controls | 1.4 s |
| PASS | KIS > Provider reapply preflight: opens and cancels confirmation without an internal server error | 7.2 s |

#### Read only > AI > Model Instances

| Status | Test case | Duration |
| --- | --- | ---: |
| PASS | AI > KIS Models > Model instances > Status and refresh > API/UI mapping: displays each current instance record in one complete status row | 3.9 s |
| PASS | AI > KIS Models > Model instances > Status and refresh > Refresh: reloads the instance table from the API without mutation | 4.3 s |
| SKIP | AI > KIS Models > Model instances > Status and refresh > Failed-state recovery: exposes failure details and an enabled unload action | 3.5 s |

#### Read only > Cron Jobs > Cron Controls

| Status | Test case | Duration |
| --- | --- | ---: |
| PASS | Cron Jobs controls > keeps bulk actions disabled until a job is selected | 1.7 s |
| PASS | Cron Jobs controls > opens and backs out of cron creation without submitting | 2.6 s |
| PASS | Cron Jobs controls > opens, starts, and cancels group creation | 2.5 s |
| PASS | Cron Jobs controls > switches to Script Library and cancels script creation | 3.2 s |

#### Read only > Navigation > Module Navigation

| Status | Test case | Duration |
| --- | --- | ---: |
| PASS | Main module navigation > opens Containers | 1.8 s |
| PASS | Main module navigation > opens Terminals | 2.2 s |
| PASS | Main module navigation > opens Toolbox | 2.2 s |
| PASS | Main module navigation > opens Logs | 2.1 s |
| PASS | Main module navigation > opens System > File Browser | 5.0 s |
| PASS | Main module navigation > opens System > Monitoring | 2.6 s |
| PASS | Main module navigation > opens System > Firewall | 2.2 s |
| PASS | Main module navigation > opens System > SSH Settings | 2.2 s |
| PASS | Main module navigation > opens AI > Kneo Apps | 2.0 s |
| PASS | Main module navigation > opens AI > MCP | 2.2 s |

#### Read only > Overview

| Status | Test case | Duration |
| --- | --- | ---: |
| PASS | Overview > displays the main dashboard sections | 1.7 s |
| PASS | Overview > displays the main system load status | 3.8 s |
| PASS | Overview > displays the KIS summary categories | 2.7 s |
| PASS | Overview > displays the system information fields | 2.1 s |
| PASS | Overview > shows Network monitoring by default | 1.7 s |
| PASS | Overview > switches between Disk I/O and Network monitoring | 2.1 s |
| PASS | Overview > remains authenticated after refreshing | 2.2 s |

#### Read only > Settings > Settings Navigation

| Status | Test case | Duration |
| --- | --- | ---: |
| PASS | Settings > opens the Panel settings page from the sidebar | 2.0 s |
| PASS | Security > opens the Security settings from the Settings page | 2.3 s |
| PASS | Alert Notification > opens the Alert Notification settings from the Settings page | 2.3 s |
| PASS | Backup accounts > opens the Backup accounts settings from the Settings page | 2.3 s |
| PASS | Snapshots > opens the Snapshots settings from the Settings page | 3.1 s |
| PASS | About > opens the About page from the Settings page | 2.1 s |

#### Read only > Settings > Settings Panel

| Status | Test case | Duration |
| --- | --- | ---: |
| PASS | opens the Panel user settings dialog | 2.2 s |

#### Read only > System > Disk

| Status | Test case | Duration |
| --- | --- | ---: |
| PASS | displays mounted disk information | 1.5 s |

#### Read only > System > Processes

| Status | Test case | Duration |
| --- | --- | ---: |
| PASS | Processes > combines and clears process filters | 4.0 s |
| PASS | Processes > opens and closes process details without ending it | 3.7 s |
| PASS | Processes > cycles the Connections sort direction | 3.3 s |

#### Read only > System > System Navigation

| Status | Test case | Duration |
| --- | --- | ---: |
| PASS | System navigation > opens Processes from the sidebar | 3.1 s |
| PASS | System navigation > opens Disk from the sidebar | 2.6 s |

#### Read only > Terminal > Bug 015 Quick Command Validation

| Status | Test case | Duration |
| --- | --- | ---: |
| KNOWN DEFECT | shows the complete invalid quick-command group message | 2.8 s |

#### Read only > Settings > Bug 017 Unauthorized Copy

| Status | Test case | Duration |
| --- | --- | ---: |
| PASS | uses grammatically correct Unauthorized setting copy | 2.5 s |

#### Read only > System > Bug 018 Ssh Port Copy

| Status | Test case | Duration |
| --- | --- | ---: |
| PASS | uses grammatically correct SSH port copy | 1.4 s |

#### Read only > System > Bug 024 Process Connections Header

| Status | Test case | Duration |
| --- | --- | ---: |
| KNOWN DEFECT | fits the Connections label and active sort indicator | 3.9 s |

### read-only-webkit

#### Read only > Containers > Bug 003 Container Status Filter

| Status | Test case | Duration |
| --- | --- | ---: |
| SKIP | applies a new container status on the first click after typing search | 1.8 s |

#### Read only > AI > Bug 004 Kis Models Navigation

| Status | Test case | Duration |
| --- | --- | ---: |
| PASS | opens KIS Models without an error notification blocking navigation | 7.1 s |

#### Read only > Script Library > Bug 021 Script Group Filter

| Status | Test case | Duration |
| --- | --- | ---: |
| PASS | offers the built-in System group in the Group filter | 3.7 s |

#### Read only > AI > Bug 025 Stale Model Instances

| Status | Test case | Duration |
| --- | --- | ---: |
| KNOWN DEFECT | does not display historical failed load jobs as inoperable model instances | 7.9 s |

#### Read only > AI > Bug 026 Kis Model Preflight

| Status | Test case | Duration |
| --- | --- | ---: |
| SKIP | calculates GPU requirements for a Ready model without a weight-header error | 6.5 s |

#### Read only > AI > Ai Navigation

| Status | Test case | Duration |
| --- | --- | ---: |
| PASS | AI navigation > opens KIS from the sidebar | 4.3 s |
| PASS | AI navigation > opens KIS Monitoring from the sidebar | 10.2 s |
| PASS | AI navigation > opens GPU Monitoring from the sidebar | 5.7 s |

#### Read only > AI > Gpu Monitoring

| Status | Test case | Duration |
| --- | --- | ---: |
| PASS | GPU Monitoring > displays GPU status columns | 2.9 s |
| PASS | GPU Monitoring > numbers every reported GPU uniquely and consecutively | 2.6 s |
| PASS | GPU Monitoring > reports a valid VRAM utilization ratio for every GPU | 4.0 s |
| PASS | GPU Monitoring > selects an automatic refresh interval and returns to no refresh | 4.4 s |

#### Read only > AI > Kis Models

| Status | Test case | Duration |
| --- | --- | ---: |
| PASS | KIS Models > shows a valid One-Click service configuration without changing it | 5.0 s |
| PASS | KIS Models > reports every One-Click pipeline stage as healthy | 6.1 s |
| PASS | KIS Models > shows model, provider, and GPU requirements before loading | 6.0 s |

#### Read only > AI > Kis Monitoring

| Status | Test case | Duration |
| --- | --- | ---: |
| PASS | loads the embedded KIS monitoring dashboard | 5.7 s |

#### Read only > AI > Kis

| Status | Test case | Duration |
| --- | --- | ---: |
| PASS | KIS > displays the provider node table | 1.9 s |
| PASS | KIS > displays node filtering controls | 2.0 s |
| PASS | KIS > Provider reapply preflight: opens and cancels confirmation without an internal server error | 8.5 s |

#### Read only > AI > Model Instances

| Status | Test case | Duration |
| --- | --- | ---: |
| PASS | AI > KIS Models > Model instances > Status and refresh > API/UI mapping: displays each current instance record in one complete status row | 5.1 s |
| PASS | AI > KIS Models > Model instances > Status and refresh > Refresh: reloads the instance table from the API without mutation | 5.0 s |
| SKIP | AI > KIS Models > Model instances > Status and refresh > Failed-state recovery: exposes failure details and an enabled unload action | 4.1 s |

#### Read only > Cron Jobs > Cron Controls

| Status | Test case | Duration |
| --- | --- | ---: |
| PASS | Cron Jobs controls > keeps bulk actions disabled until a job is selected | 2.2 s |
| PASS | Cron Jobs controls > opens and backs out of cron creation without submitting | 4.4 s |
| PASS | Cron Jobs controls > opens, starts, and cancels group creation | 4.3 s |
| PASS | Cron Jobs controls > switches to Script Library and cancels script creation | 5.1 s |

#### Read only > Navigation > Module Navigation

| Status | Test case | Duration |
| --- | --- | ---: |
| PASS | Main module navigation > opens Containers | 3.6 s |
| PASS | Main module navigation > opens Terminals | 4.9 s |
| PASS | Main module navigation > opens Toolbox | 4.1 s |
| PASS | Main module navigation > opens Logs | 4.3 s |
| PASS | Main module navigation > opens System > File Browser | 5.3 s |
| PASS | Main module navigation > opens System > Monitoring | 5.1 s |
| PASS | Main module navigation > opens System > Firewall | 4.3 s |
| PASS | Main module navigation > opens System > SSH Settings | 4.5 s |
| PASS | Main module navigation > opens AI > Kneo Apps | 3.9 s |
| PASS | Main module navigation > opens AI > MCP | 4.8 s |

#### Read only > Overview

| Status | Test case | Duration |
| --- | --- | ---: |
| PASS | Overview > displays the main dashboard sections | 2.5 s |
| PASS | Overview > displays the main system load status | 4.1 s |
| PASS | Overview > displays the KIS summary categories | 2.4 s |
| PASS | Overview > displays the system information fields | 2.6 s |
| PASS | Overview > shows Network monitoring by default | 4.1 s |
| PASS | Overview > switches between Disk I/O and Network monitoring | 5.1 s |
| PASS | Overview > remains authenticated after refreshing | 2.6 s |

#### Read only > Settings > Settings Navigation

| Status | Test case | Duration |
| --- | --- | ---: |
| PASS | Settings > opens the Panel settings page from the sidebar | 3.3 s |
| PASS | Security > opens the Security settings from the Settings page | 3.8 s |
| PASS | Alert Notification > opens the Alert Notification settings from the Settings page | 3.9 s |
| PASS | Backup accounts > opens the Backup accounts settings from the Settings page | 4.0 s |
| PASS | Snapshots > opens the Snapshots settings from the Settings page | 4.0 s |
| PASS | About > opens the About page from the Settings page | 3.8 s |

#### Read only > Settings > Settings Panel

| Status | Test case | Duration |
| --- | --- | ---: |
| PASS | opens the Panel user settings dialog | 3.3 s |

#### Read only > System > Disk

| Status | Test case | Duration |
| --- | --- | ---: |
| PASS | displays mounted disk information | 2.2 s |

#### Read only > System > Processes

| Status | Test case | Duration |
| --- | --- | ---: |
| PASS | Processes > combines and clears process filters | 5.7 s |
| PASS | Processes > opens and closes process details without ending it | 4.4 s |
| PASS | Processes > cycles the Connections sort direction | 3.6 s |

#### Read only > System > System Navigation

| Status | Test case | Duration |
| --- | --- | ---: |
| PASS | System navigation > opens Processes from the sidebar | 5.4 s |
| PASS | System navigation > opens Disk from the sidebar | 4.4 s |

#### Read only > Terminal > Bug 015 Quick Command Validation

| Status | Test case | Duration |
| --- | --- | ---: |
| PASS | shows the complete invalid quick-command group message | 4.5 s |

#### Read only > Settings > Bug 017 Unauthorized Copy

| Status | Test case | Duration |
| --- | --- | ---: |
| PASS | uses grammatically correct Unauthorized setting copy | 2.6 s |

#### Read only > System > Bug 018 Ssh Port Copy

| Status | Test case | Duration |
| --- | --- | ---: |
| PASS | uses grammatically correct SSH port copy | 2.0 s |

#### Read only > System > Bug 024 Process Connections Header

| Status | Test case | Duration |
| --- | --- | ---: |
| KNOWN DEFECT | fits the Connections label and active sort indicator | 3.6 s |

### mutating

#### Mutations > Cron Jobs > Bug 020 Cron Group Deletion

| Status | Test case | Duration |
| --- | --- | ---: |
| PASS | preserves a valid job assignment when deleting an in-use group | 7.3 s |

#### Mutations > Configuration > Config Settings

| Status | Test case | Duration |
| --- | --- | ---: |
| PASS | validates and persists the discovered One-Click address | 2.1 s |
| PASS | updates the Panel alias and restores its original value | 7.8 s |

#### Mutations > Cron Jobs > Cron Job Button Behavior

| Status | Test case | Duration |
| --- | --- | ---: |
| PASS | cancels cron edits and deletion before confirming deletion | 8.2 s |

#### Mutations > Cron Jobs > Cron Job Lifecycle

| Status | Test case | Duration |
| --- | --- | ---: |
| PASS | creates, edits, assigns, and deletes a shell cron job | 8.0 s |

#### Mutations > Cron Jobs > Cron Job Search And Selection

| Status | Test case | Duration |
| --- | --- | ---: |
| PASS | searches different jobs and enables bulk actions only after selection | 6.2 s |

#### Mutations > Validation > Form Validation

| Status | Test case | Duration |
| --- | --- | ---: |
| PASS | rejects incomplete cron creation without sending a create request | 1.8 s |
| PASS | rejects incomplete script creation without sending a create request | 2.5 s |

#### Mutations > Cron Jobs > Group Lifecycle

| Status | Test case | Duration |
| --- | --- | ---: |
| PASS | creates, renames, and deletes a cron group | 3.4 s |

#### Mutations > Script Library > Script Group Protection

| Status | Test case | Duration |
| --- | --- | ---: |
| PASS | blocks deletion of an assigned script group until its script is removed | 8.7 s |

#### Mutations > Script Library > Script Library Button Behavior

| Status | Test case | Duration |
| --- | --- | ---: |
| PASS | cancels script edits and deletion before confirming deletion | 7.0 s |

#### Mutations > Script Library > Script Library Lifecycle

| Status | Test case | Duration |
| --- | --- | ---: |
| PASS | creates, edits, assigns, and deletes a script-library entry | 7.5 s |

#### Mutations > Script Library > Script Search And Selection

| Status | Test case | Duration |
| --- | --- | ---: |
| PASS | searches different scripts and enables bulk deletion after selection | 6.6 s |

#### Mutations > Cleanup > Residue Audit

| Status | Test case | Duration |
| --- | --- | ---: |
| PASS | leaves no Playwright mutation resources behind | 1.1 s |

### ai-mutating

#### Mutations > AI > Ai Model Operations

| Status | Test case | Duration |
| --- | --- | ---: |
| SKIP | AI > KIS Models > Model instances > Lifecycle and resources > 1. Load/unload lifecycle: loads a dynamic model, cancels once, then unloads its exact instance | 127.8 s |
| SKIP | AI > KIS Models > Model instances > Lifecycle and resources > 2. GPU assignment: uses exactly the preflight-required number of GPUs | 132.7 s |
| SKIP | AI > KIS Models > Model instances > Lifecycle and resources > 3. VRAM lifecycle: allocates memory while loaded and releases it after unload | 129.1 s |
| SKIP | AI > KIS Models > Model instances > Lifecycle and resources > 4. Capacity guard: blocks loading when the provider has insufficient GPUs | 124.2 s |
| SKIP | AI > KIS Models > Model instances > Lifecycle and resources > 5. Duplicate prevention: blocks a second load of an active model | 126.5 s |
| SKIP | AI > KIS Models > Model instances > Lifecycle and resources > 6. Failure recovery: unloads a failed instance before retrying the model | 2.8 s |
