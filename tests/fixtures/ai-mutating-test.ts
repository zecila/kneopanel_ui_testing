import {
  test as base,
  expect,
  type APIRequestContext,
  type APIResponse,
} from '@playwright/test';

import {
  modelTargetKey,
  readAiMutationConfig,
  readModelRegistryConfig,
  type AiModelIdentity,
  type AiModelPreflight,
  type AiModelTarget,
  type AiMutationConfig,
  type ModelRegistryConfig,
} from '../helpers/ai-mutation-config';
import { requireExactResourceId } from '../helpers/mutation-safety';

interface ApiEnvelope<T> {
  code: number;
  data: T;
  message: string;
}

interface ItemsData<T> {
  items: T[];
  total?: number;
}

export interface KisInstance {
  id?: unknown;
  instanceId: unknown;
  modelName: string;
  provider: string;
  runtimeProvider?: string;
  status?: string;
  version: string;
}

export interface KisBackgroundJob {
  action: string;
  error?: string;
  fileStatus?: string;
  id: unknown;
  modelName: string;
  progress?: number;
  registrationStatus?: string;
  status: string;
  version: string;
}

interface LoadedModel {
  modelName: string;
  provider?: string;
  runtimeProvider?: string;
  version: string;
}

export interface AvailableModel {
  modelName: string;
  readinessStatus: string;
  version: string;
}

export interface ModelWeightsInfo {
  available: boolean;
  contextWindow?: number;
}

interface PreflightCandidate {
  preflight: AiModelPreflight;
  target: AiModelTarget;
}

interface KisNode {
  advertiseHost?: string;
  ip: string;
  status: string;
}

export interface AiModelAttempt {
  baselineInstanceIds: Set<string>;
  baselineJobIds: Set<string>;
  submittedAt?: number;
  target: AiModelTarget;
  trackedInstanceIds: Set<string>;
}

interface RegistryVersionAttempt {
  identity: AiModelIdentity;
  submittedAt?: number;
}

const API_ROOT = '/api/v2/core/settings/kis';
const FAILED_JOB_STATUSES = new Set(['failed', 'error']);
const SUCCESS_JOB_STATUSES = new Set(['success', 'completed', 'succeeded']);
const TERMINAL_JOB_STATUSES = new Set([
  ...FAILED_JOB_STATUSES,
  ...SUCCESS_JOB_STATUSES,
  'canceled',
  'cancelled',
  'unknown',
]);
const SUBMISSION_VISIBILITY_GRACE_MS = 30_000;

async function delay(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function readEnvelope<T>(response: APIResponse): Promise<T> {
  if (!response.ok()) {
    throw new Error(
      `KIS request failed with HTTP ${response.status()}: ${response.url()}`,
    );
  }

  const envelope = (await response.json()) as ApiEnvelope<T>;
  if (envelope.code !== 200) {
    throw new Error(
      `KIS request failed with code ${envelope.code}: ${envelope.message}`,
    );
  }

  return envelope.data;
}

function instanceId(instance: KisInstance): string {
  return String(requireExactResourceId(instance.instanceId ?? instance.id));
}

function jobId(job: KisBackgroundJob): string {
  return String(requireExactResourceId(job.id));
}

function providerMatches(
  resource: Pick<KisInstance, 'provider' | 'runtimeProvider'> | LoadedModel,
  target: AiModelTarget,
): boolean {
  return (
    resource.provider === target.provider ||
    resource.runtimeProvider === target.provider
  );
}

function instanceMatches(
  instance: KisInstance,
  target: AiModelTarget,
): boolean {
  return (
    instance.modelName === target.modelName &&
    instance.version === target.version &&
    providerMatches(instance, target)
  );
}

function loadedModelMatches(
  model: LoadedModel,
  target: AiModelTarget,
): boolean {
  return (
    model.modelName === target.modelName &&
    model.version === target.version &&
    (!model.provider && !model.runtimeProvider
      ? true
      : providerMatches(model, target))
  );
}

function jobMatches(
  job: KisBackgroundJob,
  target: AiModelTarget,
): boolean {
  return job.modelName === target.modelName && job.version === target.version;
}

function numericInstanceId(instance: KisInstance): number {
  const value = Number(instanceId(instance));
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(
      `KIS cleanup requires a numeric instance ID; received ${instanceId(instance)}.`,
    );
  }
  return value;
}

export class AiMutationRegistry {
  private readonly attempts = new Set<AiModelAttempt>();
  private readonly registryVersions = new Map<
    string,
    RegistryVersionAttempt
  >();

  constructor(
    private readonly request: APIRequestContext,
    private readonly headers: Record<string, string>,
    private readonly timeoutMs: number,
  ) {}

  async listInstances(): Promise<KisInstance[]> {
    const data = await readEnvelope<ItemsData<KisInstance>>(
      await this.request.post(`${API_ROOT}/instances`, {
        data: {},
        headers: this.headers,
      }),
    );
    return data?.items ?? [];
  }

  async listJobs(): Promise<KisBackgroundJob[]> {
    const data = await readEnvelope<ItemsData<KisBackgroundJob>>(
      await this.request.post(`${API_ROOT}/model/background/jobs`, {
        data: { page: 1, pageSize: 100 },
        headers: this.headers,
      }),
    );
    return data?.items ?? [];
  }

  async listLoadedModels(): Promise<LoadedModel[]> {
    const data = await readEnvelope<ItemsData<LoadedModel>>(
      await this.request.post(`${API_ROOT}/models/loaded`, {
        data: {},
        headers: this.headers,
      }),
    );
    return data?.items ?? [];
  }

  async listAvailableModels(): Promise<AvailableModel[]> {
    const data = await readEnvelope<ItemsData<AvailableModel>>(
      await this.request.post(`${API_ROOT}/models/available`, {
        data: {},
        headers: this.headers,
      }),
    );
    return data?.items ?? [];
  }

  async inspectWeights(weightsPath: string): Promise<ModelWeightsInfo> {
    return readEnvelope<ModelWeightsInfo>(
      await this.request.post(`${API_ROOT}/model/context-window`, {
        data: { weightsPath },
        headers: this.headers,
      }),
    );
  }

  async prepareRegistryVersion(identity: AiModelIdentity): Promise<void> {
    const isTestCopy =
      identity.modelName.startsWith('kneo_e2e_test_copy_') ||
      identity.version.startsWith('kneo_e2e_test_copy_');
    if (!isTestCopy) {
      throw new Error(
        'Registry workflow cleanup only accepts a model name or version beginning with kneo_e2e_test_copy_.',
      );
    }
    const exists = (await this.listAvailableModels()).some(
      (model) =>
        model.modelName === identity.modelName &&
        model.version === identity.version,
    );
    if (exists) {
      throw new Error(
        `Refusing to overwrite existing registry ${identity.modelName} (${identity.version}).`,
      );
    }
    this.registryVersions.set(this.registryKey(identity), { identity });
  }

  markRegistrySubmitted(identity: AiModelIdentity): void {
    const attempt = this.registryVersions.get(this.registryKey(identity));
    if (!attempt) {
      throw new Error(
        `Registry ${identity.modelName} (${identity.version}) was not prepared for exact cleanup.`,
      );
    }
    attempt.submittedAt = Date.now();
  }

  async waitForRegistryReady(identity: AiModelIdentity): Promise<void> {
    const deadline = Date.now() + this.timeoutMs;
    while (Date.now() < deadline) {
      const model = (await this.listAvailableModels()).find(
        (candidate) =>
          candidate.modelName === identity.modelName &&
          candidate.version === identity.version,
      );
      if (model?.readinessStatus.trim().toLowerCase() === 'ready') {
        return;
      }
      await delay(2_000);
    }
    throw new Error(
      `Timed out waiting for registry ${identity.modelName} (${identity.version}) to become Ready.`,
    );
  }

  async waitForNewJob(
    baselineJobIds: Set<string>,
    predicate: (job: KisBackgroundJob) => boolean,
  ): Promise<KisBackgroundJob> {
    const deadline = Date.now() + this.timeoutMs;
    while (Date.now() < deadline) {
      const job = (await this.listJobs()).find(
        (candidate) =>
          !baselineJobIds.has(jobId(candidate)) && predicate(candidate),
      );
      if (job) {
        const status = job.status.trim().toLowerCase();
        if (FAILED_JOB_STATUSES.has(status)) {
          throw new Error(
            `KIS background job ${jobId(job)} failed: ${job.error ?? 'no error detail returned'}.`,
          );
        }
        if (SUCCESS_JOB_STATUSES.has(status)) {
          return job;
        }
      }
      await delay(2_000);
    }
    throw new Error('Timed out waiting for the exact KIS background job.');
  }

  async deleteRegistryVersion(identity: AiModelIdentity): Promise<void> {
    const exactInstances = (await this.listInstances()).filter(
      (instance) =>
        instance.modelName === identity.modelName &&
        instance.version === identity.version,
    );
    if (exactInstances.length > 0) {
      throw new Error(
        `Refusing to delete loaded registry ${identity.modelName} (${identity.version}).`,
      );
    }

    let stillExists = await this.registryVersionExists(identity);
    const attempt = this.registryVersions.get(this.registryKey(identity));
    const visibilityDeadline = attempt?.submittedAt
      ? attempt.submittedAt + SUBMISSION_VISIBILITY_GRACE_MS
      : 0;
    while (!stillExists && Date.now() < visibilityDeadline) {
      await delay(2_000);
      stillExists = await this.registryVersionExists(identity);
    }
    if (stillExists) {
      await readEnvelope<unknown>(
        await this.request.post(`${API_ROOT}/model/delete`, {
          data: {
            async: true,
            modelName: identity.modelName,
            version: identity.version,
          },
          headers: this.headers,
        }),
      );
    }

    const deadline = Date.now() + this.timeoutMs;
    while (Date.now() < deadline) {
      const exists = await this.registryVersionExists(identity);
      if (!exists) {
        this.registryVersions.delete(this.registryKey(identity));
        return;
      }
      await delay(2_000);
    }
    throw new Error(
      `Exact registry cleanup timed out for ${identity.modelName} (${identity.version}).`,
    );
  }

  async preflight(target: AiModelTarget): Promise<AiModelPreflight> {
    return readEnvelope<AiModelPreflight>(
      await this.request.post(`${API_ROOT}/model/load/preflight`, {
        data: target,
        headers: this.headers,
      }),
    );
  }

  async listProviders(preferredProvider?: string): Promise<string[]> {
    if (preferredProvider) {
      return [preferredProvider];
    }

    const data = await readEnvelope<ItemsData<KisNode>>(
      await this.request.get(`${API_ROOT}/nodes`, { headers: this.headers }),
    );
    const providers = new Set<string>();
    for (const node of data?.items ?? []) {
      if (node.status.trim().toLowerCase() !== 'running') {
        continue;
      }
      if (node.ip?.trim()) {
        providers.add(node.ip.trim());
      }
    }

    if (providers.size === 0) {
      throw new Error(
        'KIS did not report a running Provider. Set KNEO_AI_PROVIDER only when automatic discovery cannot identify one.',
      );
    }
    return [...providers];
  }

  async discoverLoadTarget(
    preferredProvider?: string,
    excludedTargets: AiModelIdentity[] = [],
  ): Promise<AiModelTarget> {
    let best: PreflightCandidate | undefined;
    let failures = 0;

    for (const provider of await this.listProviders(preferredProvider)) {
      for (const target of await this.readyTargets(provider, excludedTargets)) {
        let preflight: AiModelPreflight;
        try {
          preflight = await this.preflight(target);
        } catch {
          failures += 1;
          continue;
        }

        if (!this.isEligible(preflight)) {
          continue;
        }

        if (
          !best ||
          preflight.requiredGpuCount < best.preflight.requiredGpuCount
        ) {
          best = { preflight, target };
        }
        if (preflight.requiredGpuCount === 1) {
          return target;
        }
      }
    }

    if (!best) {
      throw new Error(
        `No Ready, inactive model fits the Provider's current free GPU capacity without a VRAM warning (${failures} preflight failures).`,
      );
    }

    return best.target;
  }

  async resolveLoadTarget(
    identity: AiModelIdentity,
    preferredProvider?: string,
  ): Promise<AiModelTarget> {
    for (const provider of await this.listProviders(preferredProvider)) {
      const target = { ...identity, provider };
      const preflight = await this.preflight(target).catch(() => undefined);
      if (preflight && this.isEligible(preflight)) {
        return target;
      }
    }

    throw new Error(
      `The configured failure model ${identity.modelName} (${identity.version}) is not loadable on any discovered Provider.`,
    );
  }

  async prepare(target: AiModelTarget): Promise<AiModelAttempt> {
    const [instances, jobs, loadedModels] = await Promise.all([
      this.listInstances(),
      this.listJobs(),
      this.listLoadedModels(),
    ]);
    const exactInstances = instances.filter((item) =>
      instanceMatches(item, target),
    );
    const exactLoadedModels = loadedModels.filter((item) =>
      loadedModelMatches(item, target),
    );

    if (exactInstances.length > 0 || exactLoadedModels.length > 0) {
      throw new Error(
        `Refusing to use ${modelTargetKey(target)} because it is already loaded. AI test targets must be idle.`,
      );
    }

    const attempt: AiModelAttempt = {
      baselineInstanceIds: new Set(instances.map(instanceId)),
      baselineJobIds: new Set(jobs.map(jobId)),
      target,
      trackedInstanceIds: new Set(),
    };
    this.attempts.add(attempt);
    return attempt;
  }

  async waitForLoaded(attempt: AiModelAttempt): Promise<KisInstance[]> {
    const deadline = Date.now() + this.timeoutMs;

    while (Date.now() < deadline) {
      const [instances, loadedModels, jobs] = await Promise.all([
        this.listInstances(),
        this.listLoadedModels(),
        this.listJobs(),
      ]);
      const created = this.captureNewInstances(attempt, instances);
      const failedJob = this.newJobs(attempt, jobs).find((job) =>
        FAILED_JOB_STATUSES.has(job.status.toLowerCase()),
      );
      if (failedJob) {
        throw new Error(
          `Model load failed in KIS background job ${jobId(failedJob)}.`,
        );
      }
      if (
        created.length > 0 &&
        loadedModels.some((model) => loadedModelMatches(model, attempt.target))
      ) {
        return created;
      }
      await delay(5_000);
    }

    throw new Error(
      `Timed out waiting for ${modelTargetKey(attempt.target)} to load.`,
    );
  }

  markSubmitted(attempt: AiModelAttempt): void {
    attempt.submittedAt = Date.now();
  }

  async waitForFailed(attempt: AiModelAttempt): Promise<KisBackgroundJob> {
    const deadline = Date.now() + this.timeoutMs;

    while (Date.now() < deadline) {
      const [instances, jobs] = await Promise.all([
        this.listInstances(),
        this.listJobs(),
      ]);
      this.captureNewInstances(attempt, instances);
      const failedJob = this.newJobs(attempt, jobs).find((job) =>
        FAILED_JOB_STATUSES.has(job.status.toLowerCase()),
      );
      if (failedJob) {
        return failedJob;
      }

      const unexpectedTerminalJob = this.newJobs(attempt, jobs).find((job) =>
        TERMINAL_JOB_STATUSES.has(job.status.toLowerCase()),
      );
      if (unexpectedTerminalJob) {
        throw new Error(
          `Expected the approved failure target to fail, but job ${jobId(unexpectedTerminalJob)} ended with status ${unexpectedTerminalJob.status}.`,
        );
      }
      await delay(5_000);
    }

    throw new Error(
      `Timed out waiting for ${modelTargetKey(attempt.target)} to fail.`,
    );
  }

  async unloadExactInstances(attempt: AiModelAttempt): Promise<void> {
    const current = await this.listInstances();
    const created = this.captureNewInstances(attempt, current);

    if (created.length === 0 && attempt.trackedInstanceIds.size === 0) {
      throw new Error(
        `No exact instance ID was returned for ${modelTargetKey(attempt.target)}; refusing broad cleanup.`,
      );
    }

    const byId = new Map(current.map((item) => [instanceId(item), item]));
    for (const id of attempt.trackedInstanceIds) {
      const instance = byId.get(id);
      if (!instance) {
        continue;
      }
      const provider = instance.runtimeProvider?.trim() || instance.provider;
      await readEnvelope<unknown>(
        await this.request.post(`${API_ROOT}/model/unload`, {
          data: {
            instanceIds: [numericInstanceId(instance)],
            modelName: instance.modelName,
            provider,
            version: instance.version,
          },
          headers: this.headers,
        }),
      );
    }

    await this.confirmRemoved(attempt);
  }

  async confirmRemoved(attempt: AiModelAttempt): Promise<void> {
    const deadline = Date.now() + this.timeoutMs;

    while (Date.now() < deadline) {
      const instances = await this.listInstances();
      const remaining = instances.filter((item) =>
        attempt.trackedInstanceIds.has(instanceId(item)),
      );
      if (remaining.length === 0) {
        this.attempts.delete(attempt);
        return;
      }
      await delay(5_000);
    }

    throw new Error(
      `Exact KIS instance cleanup timed out for ${modelTargetKey(attempt.target)}.`,
    );
  }

  async cleanup(): Promise<void> {
    const failures: string[] = [];

    for (const attempt of [...this.attempts]) {
      try {
        await this.waitUntilAttemptCanBeCleaned(attempt);
        const [current, loadedModels] = await Promise.all([
          this.listInstances(),
          this.listLoadedModels(),
        ]);
        this.captureNewInstances(attempt, current);
        if (attempt.trackedInstanceIds.size > 0) {
          await this.unloadExactInstances(attempt);
        } else if (
          loadedModels.some((model) =>
            loadedModelMatches(model, attempt.target),
          )
        ) {
          throw new Error(
            'The target is loaded, but KIS did not return an exact instance ID; refusing broad cleanup.',
          );
        } else {
          this.attempts.delete(attempt);
        }
      } catch (error) {
        failures.push(`${modelTargetKey(attempt.target)}: ${String(error)}`);
      }
    }

    for (const attempt of [...this.registryVersions.values()].reverse()) {
      const { identity } = attempt;
      try {
        await this.deleteRegistryVersion(identity);
      } catch (error) {
        failures.push(
          `${identity.modelName}::${identity.version}: ${String(error)}`,
        );
      }
    }

    if (failures.length > 0) {
      throw new Error(`AI mutation cleanup failed:\n${failures.join('\n')}`);
    }
  }

  private captureNewInstances(
    attempt: AiModelAttempt,
    instances: KisInstance[],
  ): KisInstance[] {
    const created = instances.filter(
      (item) =>
        instanceMatches(item, attempt.target) &&
        !attempt.baselineInstanceIds.has(instanceId(item)),
    );
    for (const instance of created) {
      attempt.trackedInstanceIds.add(instanceId(instance));
    }
    return created;
  }

  private newJobs(
    attempt: AiModelAttempt,
    jobs: KisBackgroundJob[],
  ): KisBackgroundJob[] {
    return jobs.filter(
      (job) =>
        jobMatches(job, attempt.target) &&
        !attempt.baselineJobIds.has(jobId(job)),
    );
  }

  private async waitUntilAttemptCanBeCleaned(
    attempt: AiModelAttempt,
  ): Promise<void> {
    const deadline = Date.now() + this.timeoutMs;

    while (Date.now() < deadline) {
      const [instances, jobs] = await Promise.all([
        this.listInstances(),
        this.listJobs(),
      ]);
      this.captureNewInstances(attempt, instances);
      const newJobs = this.newJobs(attempt, jobs);
      const hasActiveJob = newJobs.some(
        (job) => !TERMINAL_JOB_STATUSES.has(job.status.toLowerCase()),
      );
      const submissionMayNotBeVisibleYet =
        attempt.submittedAt !== undefined &&
        attempt.trackedInstanceIds.size === 0 &&
        Date.now() - attempt.submittedAt < SUBMISSION_VISIBILITY_GRACE_MS;
      if (submissionMayNotBeVisibleYet) {
        await delay(2_000);
        continue;
      }
      if (!hasActiveJob) {
        return;
      }
      await delay(5_000);
    }

    throw new Error('A KIS background job was still active at cleanup timeout.');
  }

  private async readyTargets(
    provider: string,
    excludedTargets: AiModelIdentity[] = [],
  ): Promise<AiModelTarget[]> {
    const excluded = new Set(
      excludedTargets.map((target) => `${target.modelName}::${target.version}`),
    );
    const unique = new Map<string, AiModelTarget>();

    for (const model of await this.listAvailableModels()) {
      if (
        model.readinessStatus.trim().toLowerCase() !== 'ready' ||
        !model.modelName.trim() ||
        !model.version.trim() ||
        model.version.trim() === '-'
      ) {
        continue;
      }

      const target = {
        modelName: model.modelName.trim(),
        provider,
        version: model.version.trim(),
      };
      const key = modelTargetKey(target);
      const identityKey = `${target.modelName}::${target.version}`;
      if (!excluded.has(identityKey)) {
        unique.set(key, target);
      }
    }

    return [...unique.values()].sort((left, right) =>
      modelTargetKey(left).localeCompare(modelTargetKey(right)),
    );
  }

  private isEligible(preflight: AiModelPreflight): boolean {
    return (
      preflight.canLoad &&
      !preflight.alreadyActive &&
      !preflight.blockedByFailure &&
      !preflight.contextWindowWarning &&
      preflight.gpuCapacityCheckSkipped === false &&
      !preflight.gpuMemoryWarning &&
      preflight.requiredGpuCount > 0 &&
      preflight.requiredGpuCount <= preflight.freeGpuCount
    );
  }

  private registryKey(identity: AiModelIdentity): string {
    return `${identity.modelName}::${identity.version}`;
  }

  private async registryVersionExists(
    identity: AiModelIdentity,
  ): Promise<boolean> {
    return (await this.listAvailableModels()).some(
      (model) =>
        model.modelName === identity.modelName &&
        model.version === identity.version,
    );
  }
}

interface AiMutatingFixtures {
  aiConfig: AiMutationConfig;
  aiRegistry: AiMutationRegistry;
  modelRegistryConfig: ModelRegistryConfig;
}

export const test = base.extend<AiMutatingFixtures>({
  aiConfig: async ({}, use) => {
    await use(readAiMutationConfig());
  },
  modelRegistryConfig: async ({}, use) => {
    await use(readModelRegistryConfig());
  },
  aiRegistry: async ({ aiConfig, context, page }, use, testInfo) => {
    const authenticatedRequest = page.waitForRequest(
      (request) =>
        request.method() === 'POST' &&
        new URL(request.url()).pathname === `${API_ROOT}/instances`,
    );
    await page.goto('/ai/kis-models/overview');
    const browserRequest = await authenticatedRequest;
    const browserHeaders = await browserRequest.allHeaders();
    const csrfToken = browserHeaders['x-csrf-token'];
    const currentNode = browserHeaders.currentnode;

    if (!csrfToken || !currentNode) {
      throw new Error(
        'Could not capture KneoPanel CSRF and node headers for AI mutation cleanup.',
      );
    }

    const registry = new AiMutationRegistry(
      context.request,
      {
        currentnode: currentNode,
        'x-csrf-token': csrfToken,
      },
      aiConfig.operationTimeoutMs,
    );
    await use(registry);
    try {
      await registry.cleanup();
    } catch (error) {
      testInfo.expectedStatus = 'passed';
      throw error;
    }
  },
});

export { expect };
