import { existsSync } from 'node:fs';
import path from 'node:path';

export interface AiModelTarget {
  modelName: string;
  version: string;
  provider: string;
}

export interface AiModelIdentity {
  modelName: string;
  version: string;
}

export interface AiModelPreflight {
  alreadyActive: boolean;
  blockedByFailure: boolean;
  canLoad: boolean;
  contextWindowWarning?: unknown;
  freeGpuCount: number;
  gpuCapacityCheckSkipped?: boolean;
  gpuMemoryWarning?: {
    projectedUtilizationPercent: number;
  };
  requiredGpuCount: number;
  totalGpuCount: number;
}

export interface AiMutationConfig {
  acknowledgeWarnings: boolean;
  failure?: AiModelIdentity;
  minimumVramDeltaMiB: number;
  operationTimeoutMs: number;
  provider?: string;
  vramReleaseToleranceMiB: number;
}

export interface ModelRegistryConfig {
  archivePath?: string;
  weightsPath: string;
}

function optionalValue(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

function readPositiveNumber(name: string, fallback: number): number {
  const rawValue = process.env[name]?.trim();
  const value = rawValue ? Number(rawValue) : fallback;

  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number.`);
  }

  return value;
}

function readNonNegativeNumber(name: string, fallback: number): number {
  const rawValue = process.env[name]?.trim();
  const value = rawValue ? Number(rawValue) : fallback;

  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be zero or a positive number.`);
  }

  return value;
}

export function readAiMutationConfig(): AiMutationConfig {
  const provider = optionalValue('KNEO_AI_PROVIDER');
  const failureModel = optionalValue('KNEO_AI_FAILURE_MODEL');
  const failureVersion = optionalValue('KNEO_AI_FAILURE_VERSION');

  if (Boolean(failureModel) !== Boolean(failureVersion)) {
    throw new Error(
      'Set both KNEO_AI_FAILURE_MODEL and KNEO_AI_FAILURE_VERSION, or leave both unset.',
    );
  }

  return {
    acknowledgeWarnings:
      process.env.KNEO_AI_ACKNOWLEDGE_WARNINGS?.trim() === 'true',
    failure:
      failureModel && failureVersion
        ? { modelName: failureModel, version: failureVersion }
        : undefined,
    minimumVramDeltaMiB: readPositiveNumber(
      'KNEO_AI_MIN_VRAM_DELTA_MIB',
      1,
    ),
    operationTimeoutMs: readPositiveNumber(
      'KNEO_AI_OPERATION_TIMEOUT_MS',
      900_000,
    ),
    provider,
    vramReleaseToleranceMiB: readNonNegativeNumber(
      'KNEO_AI_VRAM_RELEASE_TOLERANCE_MIB',
      128,
    ),
  };
}

export function readModelRegistryConfig(): ModelRegistryConfig {
  const configuredArchive = optionalValue('KNEO_MODEL_CONFIG_ARCHIVE');
  const skipUpload =
    process.env.KNEO_MODEL_CONFIG_SKIP_UPLOAD?.trim() === 'true';
  const weightsPath =
    optionalValue('KNEO_MODEL_CONFIG_WEIGHTS_PATH') ??
    'qwen2_5_0_5b_instruct';
  const archiveNames = ['.tgz', '.tar.gz', '.tar', '.zip', '.gz'].map(
    (extension) => `${weightsPath}${extension}`,
  );
  const discoveredArchive = [process.cwd(), path.resolve(process.cwd(), '..')]
    .flatMap((directory) =>
      archiveNames.map((archiveName) => path.resolve(directory, archiveName)),
    )
    .find((candidate) => existsSync(candidate));
  return {
    archivePath: skipUpload
      ? undefined
      : configuredArchive
        ? path.resolve(configuredArchive)
        : discoveredArchive,
    weightsPath,
  };
}

export function modelTargetKey(target: AiModelTarget): string {
  return `${target.modelName}::${target.version}::${target.provider}`;
}
