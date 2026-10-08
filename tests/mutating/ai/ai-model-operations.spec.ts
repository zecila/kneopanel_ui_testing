import type { Locator, Page } from '@playwright/test';

import {
  test,
  expect,
  type AiModelAttempt,
  type AiMutationRegistry,
} from '../../fixtures/ai-mutating-test';
import type {
  AiModelPreflight,
  AiModelTarget,
  AiMutationConfig,
} from '../../helpers/ai-mutation-config';
import {
  cancelUnloadThroughUi,
  openLoadDialog,
  readGpuMemory,
  selectLoadTarget,
  submitLoad,
  unloadModelThroughUi,
  waitForVramIncrease,
  waitForVramRelease,
} from '../../helpers/kis-ai-ui';

async function selectTarget(
  page: Page,
  target: AiModelTarget,
): Promise<{ dialog: Locator; preflight: AiModelPreflight }> {
  const dialog = await openLoadDialog(page);
  const preflight = await selectLoadTarget(page, dialog, target);
  return { dialog, preflight };
}

async function loadTarget(
  page: Page,
  target: AiModelTarget,
  config: AiMutationConfig,
  onSubmit: () => void,
): Promise<AiModelPreflight> {
  const { dialog, preflight } = await selectTarget(page, target);
  expect(preflight.canLoad).toBe(true);
  expect(preflight.alreadyActive).toBe(false);
  expect(preflight.blockedByFailure).toBe(false);
  await submitLoad(page, dialog, config.acknowledgeWarnings, onSubmit);
  return preflight;
}

async function prepareAndLoad(
  page: Page,
  target: AiModelTarget,
  config: AiMutationConfig,
  registry: AiMutationRegistry,
): Promise<{ attempt: AiModelAttempt; preflight: AiModelPreflight }> {
  const attempt = await registry.prepare(target);
  const preflight = await loadTarget(page, target, config, () =>
    registry.markSubmitted(attempt),
  );
  return { attempt, preflight };
}

async function discoverLoadTarget(
  registry: AiMutationRegistry,
  config: AiMutationConfig,
): Promise<AiModelTarget> {
  return registry.discoverLoadTarget(
    config.provider,
    config.failure ? [config.failure] : [],
  );
}

test.describe('AI > KIS Models > Model instances > Lifecycle and resources', () => {
  test.beforeEach(async ({ aiConfig }, testInfo) => {
    testInfo.setTimeout(aiConfig.operationTimeoutMs * 3 + 60_000);
  });

  test('1. Load/unload lifecycle: loads a dynamic model, cancels once, then unloads its exact instance', async ({
    aiConfig,
    aiRegistry,
    page,
  }) => {
    const target = await discoverLoadTarget(aiRegistry, aiConfig);
    const { attempt } = await prepareAndLoad(
      page,
      target,
      aiConfig,
      aiRegistry,
    );
    const instances = await aiRegistry.waitForLoaded(attempt);
    expect(instances).not.toHaveLength(0);

    const loadedTarget = {
      ...target,
      provider:
        instances[0].runtimeProvider?.trim() || instances[0].provider,
    };
    const instanceId = String(instances[0].instanceId ?? instances[0].id);
    await cancelUnloadThroughUi(page, loadedTarget, instanceId);
    expect(
      (await aiRegistry.listInstances()).some(
        (instance) => String(instance.instanceId ?? instance.id) === instanceId,
      ),
    ).toBe(true);

    await unloadModelThroughUi(page, loadedTarget, instanceId);
    await aiRegistry.confirmRemoved(attempt);
  });

  test('2. GPU assignment: uses exactly the preflight-required number of GPUs', async ({
    aiConfig,
    aiRegistry,
    page,
  }) => {
    const baseline = await readGpuMemory(page);
    const target = await discoverLoadTarget(aiRegistry, aiConfig);
    const { attempt, preflight } = await prepareAndLoad(
      page,
      target,
      aiConfig,
      aiRegistry,
    );
    await aiRegistry.waitForLoaded(attempt);
    expect(preflight.requiredGpuCount).toBeGreaterThan(0);

    const assigned = await waitForVramIncrease(
      page,
      baseline,
      preflight.requiredGpuCount,
      aiConfig.minimumVramDeltaMiB,
      aiConfig.operationTimeoutMs,
    );
    const availableGpuIndices = new Set(baseline.map((reading) => reading.index));
    expect(new Set(assigned.map((reading) => reading.index)).size).toBe(
      preflight.requiredGpuCount,
    );
    expect(
      assigned.every((reading) => availableGpuIndices.has(reading.index)),
    ).toBe(true);
  });

  test('3. VRAM lifecycle: allocates memory while loaded and releases it after unload', async ({
    aiConfig,
    aiRegistry,
    page,
  }) => {
    const baseline = await readGpuMemory(page);
    const target = await discoverLoadTarget(aiRegistry, aiConfig);
    const { attempt, preflight } = await prepareAndLoad(
      page,
      target,
      aiConfig,
      aiRegistry,
    );
    await aiRegistry.waitForLoaded(attempt);
    expect(preflight.requiredGpuCount).toBeGreaterThan(0);

    const assigned = await waitForVramIncrease(
      page,
      baseline,
      preflight.requiredGpuCount,
      aiConfig.minimumVramDeltaMiB,
      aiConfig.operationTimeoutMs,
    );
    await aiRegistry.unloadExactInstances(attempt);
    await waitForVramRelease(
      page,
      baseline,
      assigned.map((reading) => reading.index),
      aiConfig.vramReleaseToleranceMiB,
      aiConfig.operationTimeoutMs,
    );
  });

  test('4. Capacity guard: blocks loading when the provider has insufficient GPUs', async ({
    aiConfig,
    aiRegistry,
    page,
  }) => {
    const target = await discoverLoadTarget(aiRegistry, aiConfig);
    const actualPreflight = await aiRegistry.preflight(target);
    const requiredGpuCount = actualPreflight.totalGpuCount + 1;
    await aiRegistry.prepare(target);
    let loadRequestCount = 0;
    page.on('request', (request) => {
      if (
        request.method() === 'POST' &&
        new URL(request.url()).pathname.endsWith(
          '/core/settings/kis/model/load',
        )
      ) {
        loadRequestCount += 1;
      }
    });

    await page.route(
      '**/api/v2/core/settings/kis/model/load/preflight',
      async (route) => {
        await route.fulfill({
          body: JSON.stringify({
            code: 200,
            data: {
              alreadyActive: false,
              blockedByFailure: false,
              canLoad: false,
              freeGpuCount: actualPreflight.freeGpuCount,
              gpuCapacityCheckSkipped: false,
              requiredGpuCount,
              totalGpuCount: actualPreflight.totalGpuCount,
            },
            message: '',
          }),
          contentType: 'application/json',
          status: 200,
        });
      },
    );

    try {
      const { dialog, preflight } = await selectTarget(page, target);

      expect(preflight.requiredGpuCount).toBeGreaterThan(
        preflight.totalGpuCount,
      );
      expect(preflight.canLoad).toBe(false);
      await expect(
        dialog.getByText(
          `This model requires ${preflight.requiredGpuCount} GPU(s), but this Provider has only ${preflight.totalGpuCount}.`,
          { exact: true },
        ),
      ).toBeVisible();
      await expect(
        dialog.getByRole('button', { name: 'Load', exact: true }),
      ).toBeDisabled();
      expect(loadRequestCount).toBe(0);
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    } finally {
      await page.unroute(
        '**/api/v2/core/settings/kis/model/load/preflight',
      );
    }
  });

  test('5. Duplicate prevention: blocks a second load of an active model', async ({
    aiConfig,
    aiRegistry,
    page,
  }) => {
    const target = await discoverLoadTarget(aiRegistry, aiConfig);
    const { attempt } = await prepareAndLoad(
      page,
      target,
      aiConfig,
      aiRegistry,
    );
    await aiRegistry.waitForLoaded(attempt);

    const { dialog, preflight } = await selectTarget(page, target);
    expect(preflight.alreadyActive).toBe(true);
    await expect(
      dialog.getByText(
        'This model is already active on the selected Provider.',
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      dialog.getByRole('button', { name: 'Load', exact: true }),
    ).toBeDisabled();
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  });

  test('6. Failure recovery: unloads a failed instance before retrying the model', async ({
    aiConfig,
    aiRegistry,
    page,
  }) => {
    test.skip(
      !aiConfig.failure,
      'Set the optional KNEO_AI_FAILURE_MODEL and KNEO_AI_FAILURE_VERSION to run failure recovery.',
    );
    if (!aiConfig.failure) {
      return;
    }
    const failureTarget = await aiRegistry.resolveLoadTarget(
      aiConfig.failure,
      aiConfig.provider,
    );
    const { attempt } = await prepareAndLoad(
      page,
      failureTarget,
      aiConfig,
      aiRegistry,
    );
    const failedJob = await aiRegistry.waitForFailed(attempt);
    expect(['error', 'failed']).toContain(failedJob.status.toLowerCase());

    const blocked = await selectTarget(page, failureTarget);
    expect(blocked.preflight.blockedByFailure).toBe(true);
    await expect(
      blocked.dialog.getByText(
        'An existing instance failed. Unload it before loading this model again.',
        { exact: true },
      ),
    ).toBeVisible();
    await blocked.dialog
      .getByRole('button', { name: 'Cancel', exact: true })
      .click();

    await aiRegistry.unloadExactInstances(attempt);

    const recovered = await selectTarget(page, failureTarget);
    expect(recovered.preflight.blockedByFailure).toBe(false);
    expect(recovered.preflight.canLoad).toBe(true);
    await expect(
      recovered.dialog.getByRole('button', { name: 'Load', exact: true }),
    ).toBeEnabled();
    await recovered.dialog
      .getByRole('button', { name: 'Cancel', exact: true })
      .click();
  });
});
