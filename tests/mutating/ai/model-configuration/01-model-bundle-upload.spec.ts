import { existsSync } from 'node:fs';

import { test, expect } from '../../../fixtures/ai-mutating-test';
import {
  findReusableModel,
  openUploadDialog,
  uploadModelBundleThroughUi,
} from '../../../helpers/kis-model-registry-ui';

const API_ROOT = '/api/v2/core/settings/kis';

test.describe('AI > KIS Models > Model workflow > 1. Upload bundle', () => {
  test.beforeEach(async ({ aiConfig }, testInfo) => {
    testInfo.setTimeout(aiConfig.operationTimeoutMs * 2 + 60_000);
  });

  test('1. accepts supported archive types and blocks an empty upload without a request', async ({
    page,
  }) => {
    const dialog = await openUploadDialog(page);
    const fileInput = dialog.locator('input[type="file"]');
    await expect(fileInput).toHaveAttribute(
      'accept',
      '.zip,.tar,.tar.gz,.tgz,.gz',
    );

    let uploadRequests = 0;
    const countUpload = (request: { method(): string; url(): string }) => {
      if (
        request.method() === 'POST' &&
        new URL(request.url()).pathname === `${API_ROOT}/model/upload`
      ) {
        uploadRequests += 1;
      }
    };
    page.on('request', countUpload);
    try {
      await dialog
        .getByRole('button', { name: 'Upload', exact: true })
        .click();
      await expect(
        page.getByText('Model bundle is required', { exact: true }),
      ).toBeVisible();
      expect(uploadRequests).toBe(0);
    } finally {
      page.off('request', countUpload);
    }
  });

  test('2. uploads the configured bundle and waits for its exact background job', async ({
    aiConfig,
    aiRegistry,
    modelRegistryConfig,
    page,
  }) => {
    test.skip(
      Boolean(findReusableModel(await aiRegistry.listAvailableModels())),
      'An existing model can be copied as the test fixture; no binary upload is needed.',
    );
    const existingWeights = await aiRegistry.inspectWeights(
      modelRegistryConfig.weightsPath,
    );
    test.skip(
      existingWeights.available,
      `Placeholder weights ${modelRegistryConfig.weightsPath} are already available; no binary upload is needed.`,
    );
    test.skip(
      !modelRegistryConfig.archivePath,
      'Set KNEO_MODEL_CONFIG_ARCHIVE, or place qwen2_5_0_5b_instruct.tgz beside the repository, to run the binary upload.',
    );
    const archivePath = modelRegistryConfig.archivePath;
    if (!archivePath) return;
    expect(
      existsSync(archivePath),
      `The configured model archive does not exist: ${archivePath}`,
    ).toBe(true);
    await uploadModelBundleThroughUi(
      page,
      aiRegistry,
      archivePath,
      modelRegistryConfig.weightsPath,
      aiConfig.operationTimeoutMs * 2,
    );
    await expect
      .poll(async () => aiRegistry.inspectWeights(modelRegistryConfig.weightsPath))
      .toMatchObject({ available: true });
  });
});
