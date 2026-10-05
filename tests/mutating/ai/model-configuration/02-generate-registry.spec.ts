import { randomUUID } from 'node:crypto';

import type { Locator, Page } from '@playwright/test';

import { test, expect } from '../../../fixtures/ai-mutating-test';
import {
  configPreview,
  createRegistryVersionThroughUi,
  detectedContextLimit,
  fillNumericField,
  fillRegistryModelStep,
  goToPreviewStep,
  goToRuntimeStep,
  openGenerateRegistry,
  registryField,
  resolveModelTestTemplate,
} from '../../../helpers/kis-model-registry-ui';

function uniqueModelName(purpose: string): string {
  return `kneo_e2e_test_copy_${purpose}_${Date.now()}_${randomUUID().slice(0, 8)}`;
}

async function openConfiguredGenerator(
  page: Page,
  weightsPath: string,
): Promise<Locator> {
  const dialog = await openGenerateRegistry(page);
  await fillRegistryModelStep(
    dialog,
    {
      modelName: uniqueModelName('validation'),
      version: 'validation_only_not_submitted',
    },
    weightsPath,
  );
  await goToRuntimeStep(dialog);
  return dialog;
}

async function expectIntegerRejection(
  dialog: Locator,
  label: string,
): Promise<void> {
  await registryField(dialog, label).fill('1.5');
  await dialog.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(
    dialog.getByText('Enter a supported positive integer.', { exact: true }),
  ).toBeVisible();
}

test.describe('AI > KIS Models > Model workflow > 2. Generate Registry', () => {
  test.beforeEach(async ({ aiConfig }, testInfo) => {
    testInfo.setTimeout(aiConfig.operationTimeoutMs * 3 + 60_000);
  });

  test('1. validates GPU Count boundaries and integer input', async ({
    aiConfig,
    aiRegistry,
    modelRegistryConfig,
    page,
  }) => {
    const template = await resolveModelTestTemplate(
      page,
      aiRegistry,
      modelRegistryConfig,
      aiConfig.operationTimeoutMs * 2,
    );
    const dialog = await openConfiguredGenerator(
      page,
      template.weightsPath,
    );
    const input = registryField(dialog, 'GPU Count');
    await expect(input).toHaveAttribute('min', '1');
    await expect(input).toHaveAttribute('max', '64');
    expect(await fillNumericField(dialog, 'GPU Count', 0)).toBe('1');
    expect(await fillNumericField(dialog, 'GPU Count', 65)).toBe('64');
    await expectIntegerRejection(dialog, 'GPU Count');
  });

  test('2. validates Context Window Length against detected model metadata', async ({
    aiConfig,
    aiRegistry,
    modelRegistryConfig,
    page,
  }) => {
    const template = await resolveModelTestTemplate(
      page,
      aiRegistry,
      modelRegistryConfig,
      aiConfig.operationTimeoutMs * 2,
    );
    const dialog = await openConfiguredGenerator(
      page,
      template.weightsPath,
    );
    const limit = await detectedContextLimit(dialog);
    const input = registryField(dialog, 'Context Window Length');
    await expect(input).toHaveAttribute('min', '1');
    await expect(input).toHaveAttribute('max', String(limit));
    expect(await fillNumericField(dialog, 'Context Window Length', 0)).toBe(
      '1',
    );
    expect(
      await fillNumericField(dialog, 'Context Window Length', limit + 1),
    ).toBe(String(limit));
    await expectIntegerRejection(dialog, 'Context Window Length');
  });

  test('3. validates Maximum Concurrent Sequences as a positive integer', async ({
    aiConfig,
    aiRegistry,
    modelRegistryConfig,
    page,
  }) => {
    const template = await resolveModelTestTemplate(
      page,
      aiRegistry,
      modelRegistryConfig,
      aiConfig.operationTimeoutMs * 2,
    );
    const dialog = await openConfiguredGenerator(
      page,
      template.weightsPath,
    );
    const input = registryField(dialog, 'Maximum Concurrent Sequences');
    await expect(input).toHaveAttribute('min', '1');
    expect(
      await fillNumericField(dialog, 'Maximum Concurrent Sequences', 0),
    ).toBe('1');
    expect(
      await fillNumericField(dialog, 'Maximum Concurrent Sequences', 1024),
    ).toBe('1024');
    await expectIntegerRejection(dialog, 'Maximum Concurrent Sequences');
  });

  test('4. validates GPU Memory Utilization and serializes an accepted value', async ({
    aiConfig,
    aiRegistry,
    modelRegistryConfig,
    page,
  }) => {
    const template = await resolveModelTestTemplate(
      page,
      aiRegistry,
      modelRegistryConfig,
      aiConfig.operationTimeoutMs * 2,
    );
    const identity = {
      modelName: uniqueModelName('validation'),
      version: 'vram_preview_not_submitted',
    };
    const dialog = await openGenerateRegistry(page);
    await fillRegistryModelStep(
      dialog,
      identity,
      template.weightsPath,
    );
    await goToRuntimeStep(dialog);
    const input = registryField(dialog, 'GPU Memory Utilization');
    await expect(input).toHaveAttribute('min', '0.01');
    await expect(input).toHaveAttribute('max', '1');
    expect(
      await fillNumericField(dialog, 'GPU Memory Utilization', 0),
    ).toBe('0.01');
    expect(
      await fillNumericField(dialog, 'GPU Memory Utilization', 1.01),
    ).toBe('1.00');
    await fillNumericField(dialog, 'GPU Memory Utilization', 0.75);
    await goToPreviewStep(dialog);
    expect(await configPreview(dialog, identity)).toContain(
      'gpu-memory-utilization: 0.75',
    );
  });

  test('5. creates one Ready registry version and removes that exact version', async ({
    aiConfig,
    aiRegistry,
    modelRegistryConfig,
    page,
  }) => {
    const template = await resolveModelTestTemplate(
      page,
      aiRegistry,
      modelRegistryConfig,
      aiConfig.operationTimeoutMs * 2,
    );
    const identity = {
      modelName: uniqueModelName('generate'),
      version: 'copied_runtime_parameters',
    };

    try {
      const created = await createRegistryVersionThroughUi(
        page,
        aiRegistry,
        identity,
        template.weightsPath,
        {
          contextWindow: template.runtime.contextWindow,
          gpuCount: template.runtime.gpuCount,
          gpuMemoryUtilization: template.runtime.gpuMemoryUtilization,
          maxConcurrentSequences: template.runtime.maxConcurrentSequences,
        },
      );
      expect(created.configYaml).toContain(
        `tensor-parallel-size: ${created.runtime.gpuCount}`,
      );
      expect(created.configYaml).toContain(
        `gpu-memory-utilization: ${created.runtime.gpuMemoryUtilization}`,
      );
      expect(created.configYaml).toContain(
        `max-model-len: ${created.runtime.contextWindow}`,
      );
      expect(created.configYaml).toContain(
        `max-num-seqs: ${created.runtime.maxConcurrentSequences}`,
      );
    } finally {
      await aiRegistry.deleteRegistryVersion(identity);
    }
  });
});
