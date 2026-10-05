import path from 'node:path';

import { expect, type Locator, type Page } from '@playwright/test';

import type {
  AiMutationRegistry,
  AvailableModel,
} from '../fixtures/ai-mutating-test';
import type {
  AiModelIdentity,
  ModelRegistryConfig,
} from './ai-mutation-config';

const API_ROOT = '/api/v2/core/settings/kis';

export interface RuntimeValues {
  contextWindow: number;
  gpuCount: number;
  gpuMemoryUtilization: number;
  maxConcurrentSequences: number;
  tensorParallelSize?: number;
}

export interface CreatedRegistryVersion {
  configYaml: string;
  contextLimit: number;
  runtime: RuntimeValues;
}

export interface RegistryTemplate {
  contextLimit?: number;
  runtime: RuntimeValues;
  source?: AiModelIdentity;
  weightsPath: string;
}

let cachedTemplate: RegistryTemplate | undefined;

export function findReusableModel(
  models: AvailableModel[],
): AiModelIdentity | undefined {
  return (
    models.find(
      (model) =>
        model.readinessStatus.trim().toLowerCase() === 'ready' &&
        model.modelName.trim() &&
        model.version.trim() &&
        model.version.trim() !== '-',
    ) ??
    models.find(
      (model) =>
        model.modelName.trim() &&
        model.version.trim() &&
        model.version.trim() !== '-',
    )
  );
}

export function registryField(dialog: Locator, label: string): Locator {
  return dialog
    .locator('.el-form-item')
    .filter({ hasText: label })
    .first()
    .locator('input');
}

export async function openGenerateRegistry(page: Page): Promise<Locator> {
  await page.goto('/ai/kis-models/overview');
  await page
    .getByRole('button', { name: 'Generate Registry', exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Generate KIS Registry' });
  await expect(dialog).toBeVisible();
  return dialog;
}

export async function fillRegistryModelStep(
  dialog: Locator,
  identity: AiModelIdentity,
  weightsPath: string,
): Promise<void> {
  await registryField(dialog, 'Model Name').fill(identity.modelName);
  await registryField(dialog, 'New Version Directory Name').fill(
    identity.version,
  );
  await registryField(dialog, 'weights_path').fill(weightsPath);
}

export async function goToRuntimeStep(dialog: Locator): Promise<void> {
  await dialog.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(dialog.getByText('GPU Count', { exact: true })).toBeVisible();
  await expect(
    dialog.getByText('GPU Memory Utilization', { exact: true }),
  ).toBeVisible();
}

export async function fillNumericField(
  dialog: Locator,
  label: string,
  value: number | string,
): Promise<string> {
  const input = registryField(dialog, label);
  await input.fill(String(value));
  await input.press('Tab');
  return input.inputValue();
}

export async function fillRuntimeStep(
  dialog: Locator,
  values: RuntimeValues,
): Promise<void> {
  await fillNumericField(dialog, 'GPU Count', values.gpuCount);
  if (values.tensorParallelSize !== undefined) {
    await fillNumericField(
      dialog,
      'Tensor Parallel Size',
      values.tensorParallelSize,
    );
  }
  await fillNumericField(
    dialog,
    'Context Window Length',
    values.contextWindow,
  );
  await fillNumericField(
    dialog,
    'Maximum Concurrent Sequences',
    values.maxConcurrentSequences,
  );
  await fillNumericField(
    dialog,
    'GPU Memory Utilization',
    values.gpuMemoryUtilization,
  );
}

export async function detectedContextLimit(dialog: Locator): Promise<number> {
  const text = await dialog
    .getByText(/Model config context window: \d+/)
    .innerText();
  const match = text.match(/(\d+)/);
  if (!match) {
    throw new Error(`Could not parse the detected context limit from: ${text}`);
  }
  return Number(match[1]);
}

export async function goToPreviewStep(dialog: Locator): Promise<void> {
  await dialog.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(dialog.getByText('Generated Files', { exact: true })).toBeVisible();
}

export async function configPreview(
  dialog: Locator,
  identity: AiModelIdentity,
): Promise<string> {
  await dialog
    .getByRole('button', {
      name: `registry/${identity.modelName}/${identity.version}/config.yaml`,
      exact: true,
    })
    .click();
  return dialog.locator('.file-preview pre').innerText();
}

export async function goToPreflightStep(dialog: Locator): Promise<void> {
  await dialog.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(
    dialog.getByText('Provider Prerequisites', { exact: true }),
  ).toBeVisible();
}

export async function submitRegistryUpload(
  page: Page,
  dialog: Locator,
): Promise<void> {
  const prerequisites = [
    'The Docker image is available on the target Provider.',
    'The required weights directory exists in KIS storage.',
  ];
  for (const prerequisite of prerequisites) {
    const checkbox = dialog
      .locator('.el-checkbox')
      .filter({ hasText: prerequisite });
    await expect(checkbox).toBeVisible();
    await checkbox.click();
    await expect(checkbox.locator('input[type="checkbox"]')).toBeChecked();
  }

  const responsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === `${API_ROOT}/model/upload`,
  );
  await dialog
    .getByRole('button', { name: 'Upload Directly', exact: true })
    .click();
  const response = await responsePromise;
  expect(response.ok()).toBe(true);
  const envelope = (await response.json()) as { code?: number; message?: string };
  expect(envelope.code, envelope.message).toBe(200);
  await expect(
    dialog.getByRole('button', { name: 'Upload Directly', exact: true }),
  ).toBeDisabled();
}

export async function createRegistryVersionThroughUi(
  page: Page,
  registry: AiMutationRegistry,
  identity: AiModelIdentity,
  weightsPath: string,
  requestedRuntime: RuntimeValues,
): Promise<CreatedRegistryVersion> {
  await registry.prepareRegistryVersion(identity);
  const dialog = await openGenerateRegistry(page);
  await fillRegistryModelStep(dialog, identity, weightsPath);
  await goToRuntimeStep(dialog);
  const contextLimit = await detectedContextLimit(dialog);
  const runtime = {
    ...requestedRuntime,
    contextWindow: Math.min(requestedRuntime.contextWindow, contextLimit),
  };
  await fillRuntimeStep(dialog, runtime);
  await goToPreviewStep(dialog);
  const configYaml = await configPreview(dialog, identity);
  await goToPreflightStep(dialog);
  await expect(dialog).toContainText(`Expected path: weights/${weightsPath}/`);

  const baselineJobIds = new Set(
    (await registry.listJobs()).map((job) => String(job.id)),
  );
  registry.markRegistrySubmitted(identity);
  await submitRegistryUpload(page, dialog);
  await registry.waitForNewJob(
    baselineJobIds,
    (job) =>
      job.action.trim().toLowerCase() === 'upload' &&
      job.modelName === identity.modelName,
  );
  await registry.waitForRegistryReady(identity);
  return { configYaml, contextLimit, runtime };
}

async function availableModelRow(
  page: Page,
  identity: AiModelIdentity,
): Promise<Locator> {
  await expect(
    page.getByRole('button', { name: 'Add Version', exact: true }).first(),
  ).toBeVisible({ timeout: 15_000 });
  const rows = page.locator('.el-table__row').filter({
    has: page.getByRole('button', { name: 'Add Version', exact: true }),
  });
  for (let index = 0; index < (await rows.count()); index += 1) {
    const row = rows.nth(index);
    const cells = row.locator('td');
    if (
      (await cells.nth(0).innerText()).trim() === identity.modelName &&
      (await cells.nth(1).innerText()).trim() === identity.version
    ) {
      return row;
    }
  }
  throw new Error(
    `Could not find Available Models row for ${identity.modelName} (${identity.version}).`,
  );
}

export async function openAddVersion(
  page: Page,
  source: AiModelIdentity,
): Promise<Locator> {
  await page.goto('/ai/kis-models/overview');
  const row = await availableModelRow(page, source);
  await row.getByRole('button', { name: 'Add Version', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Add Registry Version' });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByText(`Creating a new version from ${source.version}`),
  ).toBeVisible();
  return dialog;
}

export async function openUploadDialog(page: Page): Promise<Locator> {
  await page.goto('/ai/kis-models/overview');
  await page.getByRole('button', { name: 'Upload', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Upload Model' });
  await expect(dialog).toBeVisible();
  return dialog;
}

export async function uploadModelBundleThroughUi(
  page: Page,
  registry: AiMutationRegistry,
  archivePath: string,
  expectedModelName: string,
  timeoutMs: number,
): Promise<void> {
  const baselineJobIds = new Set(
    (await registry.listJobs()).map((job) => String(job.id)),
  );
  const dialog = await openUploadDialog(page);
  await dialog.locator('input[type="file"]').setInputFiles(archivePath);
  await expect(dialog.getByText(path.basename(archivePath))).toBeVisible();
  const uploadButton = dialog.getByRole('button', {
    name: 'Upload',
    exact: true,
  });
  await expect(uploadButton).toBeEnabled();

  const responsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === `${API_ROOT}/model/upload`,
    { timeout: timeoutMs },
  );
  await uploadButton.click({ timeout: timeoutMs });
  const response = await responsePromise;
  expect(response.ok()).toBe(true);
  const envelope = (await response.json()) as {
    code?: number;
    message?: string;
  };
  expect(envelope.code, envelope.message).toBe(200);
  await registry.waitForNewJob(
    baselineJobIds,
    (job) =>
      job.action.trim().toLowerCase() === 'upload' &&
      job.modelName === expectedModelName,
  );
}

export async function discoverExistingRegistryTemplate(
  page: Page,
  preferredSource?: AiModelIdentity,
): Promise<RegistryTemplate> {
  await page.goto('/ai/kis-models/overview');
  let source = preferredSource;
  let dialog: Locator;
  if (source) {
    dialog = await openAddVersion(page, source);
  } else {
    const addVersion = page
      .getByRole('button', { name: 'Add Version', exact: true })
      .first();
    await expect(addVersion).toBeVisible({ timeout: 15_000 });
    const row = addVersion.locator('xpath=ancestor::tr');
    const cells = row.locator('td');
    source = {
      modelName: (await cells.nth(0).innerText()).trim(),
      version: (await cells.nth(1).innerText()).trim(),
    };
    await addVersion.click();
    dialog = page.getByRole('dialog', { name: 'Add Registry Version' });
    await expect(dialog).toBeVisible();
  }
  const weightsInput = registryField(dialog, 'weights_path');
  await expect(weightsInput).not.toHaveValue('');
  const weightsPath = await weightsInput.inputValue();
  await registryField(dialog, 'New Version Directory Name').fill(
    `kneo_e2e_inspection_${Date.now()}`,
  );
  await goToRuntimeStep(dialog);
  const numberValue = async (label: string): Promise<number> =>
    Number(await registryField(dialog, label).inputValue());
  const contextLimit = await detectedContextLimit(dialog).catch(() => undefined);
  const runtime = {
    contextWindow: await numberValue('Context Window Length'),
    gpuCount: await numberValue('GPU Count'),
    gpuMemoryUtilization: await numberValue('GPU Memory Utilization'),
    maxConcurrentSequences: await numberValue('Maximum Concurrent Sequences'),
    tensorParallelSize: await numberValue('Tensor Parallel Size'),
  };
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  return { contextLimit, runtime, source, weightsPath };
}

export async function resolveModelTestTemplate(
  page: Page,
  registry: AiMutationRegistry,
  config: ModelRegistryConfig,
  timeoutMs: number,
): Promise<RegistryTemplate> {
  if (cachedTemplate) return cachedTemplate;

  const existingModels = await registry.listAvailableModels();
  const reusableModel = findReusableModel(existingModels);
  if (reusableModel) {
    cachedTemplate = await discoverExistingRegistryTemplate(page, reusableModel);
    return cachedTemplate;
  }

  let weights = await registry.inspectWeights(config.weightsPath);
  if (!weights.available) {
    if (!config.archivePath) {
      throw new Error(
        'The model list and placeholder weights are empty. Set KNEO_MODEL_CONFIG_ARCHIVE to the test bundle before running this stage.',
      );
    }
    await uploadModelBundleThroughUi(
      page,
      registry,
      config.archivePath,
      config.weightsPath,
      timeoutMs,
    );
    weights = await registry.inspectWeights(config.weightsPath);
  }
  if (!weights.available) {
    throw new Error(
      `Placeholder weights ${config.weightsPath} are still unavailable after upload.`,
    );
  }

  cachedTemplate = {
    contextLimit: weights.contextWindow,
    runtime: {
      contextWindow: Math.min(4096, weights.contextWindow ?? 4096),
      gpuCount: 1,
      gpuMemoryUtilization: 0.75,
      maxConcurrentSequences: 1,
    },
    weightsPath: config.weightsPath,
  };
  return cachedTemplate;
}
