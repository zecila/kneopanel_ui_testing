import { randomUUID } from 'node:crypto';

import { test, expect } from '../../../fixtures/ai-mutating-test';
import {
  configPreview,
  createRegistryVersionThroughUi,
  discoverExistingRegistryTemplate,
  findReusableModel,
  fillNumericField,
  fillRuntimeStep,
  goToPreflightStep,
  goToPreviewStep,
  goToRuntimeStep,
  openAddVersion,
  registryField,
  resolveModelTestTemplate,
  submitRegistryUpload,
} from '../../../helpers/kis-model-registry-ui';

test.describe('AI > KIS Models > Model workflow > 3. Add Version', () => {
  test.beforeEach(async ({ aiConfig }, testInfo) => {
    testInfo.setTimeout(aiConfig.operationTimeoutMs * 4 + 60_000);
  });

  test('1. preserves source values, validates TP, creates a changed version, and cleans up', async ({
    aiConfig,
    aiRegistry,
    modelRegistryConfig,
    page,
  }) => {
    const existingModels = await aiRegistry.listAvailableModels();
    const reusableModel = findReusableModel(existingModels);
    let template =
      reusableModel
        ? await discoverExistingRegistryTemplate(page, reusableModel)
        : await resolveModelTestTemplate(
            page,
            aiRegistry,
            modelRegistryConfig,
            aiConfig.operationTimeoutMs * 2,
          );
    let source = template.source;
    let sourceOwnedByTest = false;

    if (!source) {
      source = {
        modelName: `kneo_e2e_test_copy_source_${Date.now()}_${randomUUID().slice(0, 8)}`,
        version: 'placeholder_source',
      };
      const sourceResult = await createRegistryVersionThroughUi(
        page,
        aiRegistry,
        source,
        template.weightsPath,
        template.runtime,
      );
      sourceOwnedByTest = true;
      template = {
        ...template,
        contextLimit: sourceResult.contextLimit,
        runtime: sourceResult.runtime,
        source,
      };
    }

    const added = {
      modelName: source.modelName,
      version: `kneo_e2e_test_copy_gpu1_tp1_${Date.now()}_${randomUUID().slice(0, 8)}`,
    };

    await aiRegistry.prepareRegistryVersion(added);
    try {
      const dialog = await openAddVersion(page, source);
      await registryField(dialog, 'New Version Directory Name').fill(
        added.version,
      );
      await goToRuntimeStep(dialog);
      await expect(registryField(dialog, 'GPU Count')).toHaveValue(
        String(template.runtime.gpuCount),
      );
      await expect(registryField(dialog, 'Tensor Parallel Size')).toHaveValue(
        String(template.runtime.tensorParallelSize ?? template.runtime.gpuCount),
      );
      await expect(registryField(dialog, 'GPU Memory Utilization')).toHaveValue(
        String(template.runtime.gpuMemoryUtilization),
      );
      await expect(registryField(dialog, 'Tensor Parallel Size')).toHaveAttribute(
        'min',
        '1',
      );
      await expect(registryField(dialog, 'Tensor Parallel Size')).toHaveAttribute(
        'max',
        String(template.runtime.gpuCount),
      );

      expect(await fillNumericField(dialog, 'Tensor Parallel Size', 0)).toBe(
        '1',
      );
      await registryField(dialog, 'Tensor Parallel Size').fill('1.5');
      await dialog.getByRole('button', { name: 'Next', exact: true }).click();
      await expect(
        dialog.getByText('Enter a supported positive integer.', { exact: true }),
      ).toBeVisible();

      await fillNumericField(dialog, 'GPU Count', 2);
      await fillNumericField(dialog, 'Tensor Parallel Size', 2);
      await fillNumericField(dialog, 'GPU Count', 1);
      await dialog.getByRole('button', { name: 'Next', exact: true }).click();
      await expect(
        dialog.getByText('Tensor Parallel Size cannot exceed GPU Count.', {
          exact: true,
        }),
      ).toBeVisible();

      await fillRuntimeStep(dialog, {
        contextWindow: Math.min(2048, template.contextLimit ?? 2048),
        gpuCount: 1,
        gpuMemoryUtilization: 0.65,
        maxConcurrentSequences: 4,
        tensorParallelSize: 1,
      });
      await goToPreviewStep(dialog);
      const yaml = await configPreview(dialog, added);
      expect(yaml).toContain('tensor-parallel-size: 1');
      expect(yaml).toContain('gpu-memory-utilization: 0.65');
      expect(yaml).toContain(
        `max-model-len: ${Math.min(2048, template.contextLimit ?? 2048)}`,
      );
      expect(yaml).toContain('max-num-seqs: 4');

      await goToPreflightStep(dialog);
      const baselineJobIds = new Set(
        (await aiRegistry.listJobs()).map((job) => String(job.id)),
      );
      aiRegistry.markRegistrySubmitted(added);
      await submitRegistryUpload(page, dialog);
      await aiRegistry.waitForNewJob(
        baselineJobIds,
        (job) =>
          job.action.trim().toLowerCase() === 'upload' &&
          job.modelName === added.modelName,
      );
      await aiRegistry.waitForRegistryReady(added);

      const exactVersions = (await aiRegistry.listAvailableModels()).filter(
        (model) =>
          model.modelName === source.modelName &&
          [source.version, added.version].includes(model.version),
      );
      expect(exactVersions.map((model) => model.version).sort()).toEqual(
        [source.version, added.version].sort(),
      );
    } finally {
      await aiRegistry.deleteRegistryVersion(added);
      if (sourceOwnedByTest) {
        await aiRegistry.deleteRegistryVersion(source);
      }
    }
  });
});
