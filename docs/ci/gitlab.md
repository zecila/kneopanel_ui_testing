# GitLab CI setup and review

The root `.gitlab-ci.yml` is a provider-ready draft. It intentionally leaves
company-specific runner tags and all environment values out of source control.

## Readiness check

After configuring `.env` locally, or the equivalent protected CI/CD variables
on a runner, validate the complete read-only setup with:

```bash
npm ci
npx playwright install chromium firefox webkit
npm run ci:doctor
```

The doctor checks required variables without printing their values, confirms
that all three browser binaries are installed, compares the locked Playwright
version with the GitLab container tag, contacts the configured security
entrance, and runs the real authentication setup in Chromium. Missing mutation
configuration is only a warning unless mutations are explicitly enabled.

## Pipeline behavior

The pipeline runs for schedules, merge requests, and branch pushes. When a
branch already has an open merge request, GitLab creates only the merge-request
pipeline rather than a duplicate branch pipeline.

The developer-facing lanes are intentionally small in number:

1. `typecheck` runs the TypeScript compiler.
2. `smoke-tests` runs 24 tagged critical Chromium checks on every branch and
   merge-request pipeline.
3. `read-only-regression` runs the remaining Chromium read-only checks
   automatically on the default branch and scheduled pipelines. It is also an
   optional manual job in merge-request pipelines.
4. `cross-browser-regression` runs the complete Firefox and WebKit read-only
   suite only in scheduled pipelines, after Chromium regression.
5. `mutation-tests` is an optional manual job on non-scheduled default-branch
   pipelines.

Smoke and Chromium regression are disjoint: the regression command excludes
`@smoke`, so a default-branch pipeline covers every Chromium read-only case once.
The scheduled compatibility lane intentionally repeats all authenticated
read-only behavior in Firefox and WebKit.

## Deployment contract

Before treating these jobs as application merge-request protection, confirm
which KneoPanel build exists at `KNEO_BASE_URL`. A pipeline against a fixed
shared installation validates that environment and the test-suite commit; it
does not prove that an undeployed KneoPanel application commit works.

For application-code merge requests, the owning pipeline should deploy the
exact commit to an isolated or controlled test environment and pass that URL to
this suite. If the project intentionally tests only a shared installation,
describe the jobs as environment regression and record the deployed build in
the pipeline or release process.

The mutation job does not block an otherwise successful pipeline. It has no CI
retries, cannot be interrupted by a newer pipeline, and uses a resource group so
only one mutation job can run at a time. The test runner still requires
`KNEO_BASE_URL` to exactly match `KNEO_APPROVED_MUTATION_TARGET`.

Every browser-test job publishes Playwright HTML diagnostics, the Markdown
summary, and a JUnit report. GitLab can display the JUnit results in its pipeline
and merge-request test views. Artifacts expire after seven days and do not
include the saved authentication state.

## Required CI/CD variables

Configure these under **Settings > CI/CD > Variables**:

| Variable | Used by | Sensitive |
| --- | --- | --- |
| `KNEO_BASE_URL` | Read-only and mutation tests | No, unless the URL itself is confidential |
| `KNEO_SECURITY_ENTRANCE` | Read-only and mutation tests | Yes |
| `KNEO_ADMIN_USERNAME` | Read-only and mutation tests | Yes |
| `KNEO_ADMIN_PASSWORD` | Read-only and mutation tests | Yes |
| `KNEO_APPROVED_MUTATION_TARGET` | Mutation tests only | No, unless the URL itself is confidential |

Mask credentials wherever GitLab accepts their values as masked. Do not add
`ALLOW_MUTATIONS` as a project variable; the manual mutation job sets it only
for that job.

Protected variables are available only to pipelines GitLab considers protected.
The reviewer must confirm whether merge-request pipelines in this project can
receive the four variables needed by the read-only suite. Do not weaken the
protection simply to make a pipeline pass. Use a dedicated, least-privileged
automation account and keep pipelines from untrusted forks or contributors away
from credentials.

## Runner requirements

The selected GitLab Runner must:

- use a Docker-compatible executor, or be adapted to provide Node.js and the
  Playwright Chromium dependencies itself;
- be able to pull `mcr.microsoft.com/playwright:v1.63.0-noble`;
- have network and DNS access to `KNEO_BASE_URL`;
- be allowed to run jobs for this project and its protected branches.

If the company runner requires tags, add its approved tags to `default`, for
example:

```yaml
default:
  tags:
    - company-network
```

The image version is deliberately pinned to the Playwright version in
`package-lock.json`. Update both together.

## Reviewer decisions

Before merging, a GitLab owner should confirm only these deployment-specific
items:

- this is the repository where the pipeline should run;
- the configuration validates and simulates successfully in the project's
  **Build > Pipeline editor > Validate** view;
- the runner type, required tags, and access to the KneoPanel test environment;
- that `npm run ci:doctor` passes on the selected runner;
- whether `KNEO_BASE_URL` contains the exact application build under review or
  is intentionally a shared environment;
- whether the smoke selection and scheduled cross-browser cadence match the
  team's merge policy;
- how trusted merge requests receive the required variables;
- that `kneopanel-test-mutations` is an approved mutation environment and which
  users may start its manual job.

If the GitLab tier supports protected environments, protect
`kneopanel-test-mutations` and restrict who can run jobs against it. The job is
limited to the default branch even before that GitLab-side protection is added.
