import {
  expect,
  type Locator,
  type Page,
} from '@playwright/test';

import type {
  AiModelPreflight,
  AiModelTarget,
} from './ai-mutation-config';

export interface GpuMemoryReading {
  index: number;
  totalMiB: number;
  usedMiB: number;
}

interface ApiEnvelope<T> {
  code: number;
  data: T;
  message: string;
}

interface HttpResponseLike {
  json(): Promise<unknown>;
  ok(): boolean;
  status(): number;
  url(): string;
}

const API_ROOT = '/api/v2/core/settings/kis';

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toMiB(value: number, unit: string): number {
  return unit === 'GiB' ? value * 1024 : value;
}

async function readEnvelope<T>(response: HttpResponseLike): Promise<T> {
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

async function visibleOptions(page: Page): Promise<Locator> {
  const options = page.locator('.el-select-dropdown:visible [role="option"]');
  await expect(options.first()).toBeVisible();
  return options;
}

export async function openLoadDialog(page: Page): Promise<Locator> {
  await page.goto('/ai/kis-models/overview');
  await page.getByRole('button', { name: 'Load', exact: true }).click();

  const dialog = page.getByRole('dialog', { name: 'Load Model' });
  await expect(dialog).toBeVisible();
  return dialog;
}

export async function selectLoadTarget(
  page: Page,
  dialog: Locator,
  target: AiModelTarget,
): Promise<AiModelPreflight> {
  const comboboxes = dialog.getByRole('combobox');
  await expect(comboboxes).toHaveCount(2);

  await comboboxes.nth(0).click();
  const modelPattern = new RegExp(
    `^${escapeRegex(target.modelName)}\\s*\\(${escapeRegex(target.version)}\\)`,
  );
  const modelOption = (await visibleOptions(page)).filter({
    hasText: modelPattern,
  });
  await expect(modelOption).toHaveCount(1);
  await modelOption.click();

  await expect(dialog).toContainText(
    `${target.modelName} (${target.version})`,
  );
  await page.waitForTimeout(350);

  const preflightResponse = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname ===
        `${API_ROOT}/model/load/preflight`,
  );

  await comboboxes.nth(1).click();
  const providerPattern = new RegExp(`^${escapeRegex(target.provider)}(?:\\s|\\()`);
  const providerOption = (await visibleOptions(page)).filter({
    hasText: providerPattern,
  });
  await expect(providerOption).toHaveCount(1);
  await providerOption.click();

  const data = await readEnvelope<AiModelPreflight>(await preflightResponse);
  expect(data.requiredGpuCount).toBeGreaterThanOrEqual(0);
  expect(data.totalGpuCount).toBeGreaterThanOrEqual(0);
  return data;
}

export async function submitLoad(
  page: Page,
  dialog: Locator,
  acknowledgeWarnings: boolean,
  onSubmit?: () => void,
): Promise<void> {
  const loadButton = dialog.getByRole('button', {
    name: 'Load',
    exact: true,
  });
  await expect(loadButton).toBeEnabled();

  const loadResponse = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === `${API_ROOT}/model/load`,
  );
  onSubmit?.();
  try {
    await loadButton.click();

    const warningConfirmation = page.getByRole('button', {
      name: 'Start Anyway',
      exact: true,
    });
    if (
      await warningConfirmation
        .isVisible({ timeout: 1_000 })
        .catch(() => false)
    ) {
      if (!acknowledgeWarnings) {
        await page
          .getByRole('button', { name: 'Cancel', exact: true })
          .last()
          .click();
        throw new Error(
          'The selected model requires a warning acknowledgement. Review it manually, then set KNEO_AI_ACKNOWLEDGE_WARNINGS=true if it is approved.',
        );
      }
      await warningConfirmation.click();
    }

    await readEnvelope<unknown>(await loadResponse);
    await expect(dialog).toBeHidden();
  } catch (error) {
    void loadResponse.catch(() => undefined);
    throw error;
  }
}

export async function unloadModelThroughUi(
  page: Page,
  target: AiModelTarget,
  instanceId?: string,
): Promise<void> {
  await page.goto('/ai/kis-models/overview');
  const instances = page
    .locator('.el-card')
    .filter({
      has: page.getByText('Model Instance Status', { exact: true }),
    })
    .last();
  let row = instances
    .locator('.el-table__row')
    .filter({ hasText: target.modelName })
    .filter({ hasText: target.version })
    .filter({ hasText: target.provider });
  if (instanceId) {
    row = row.filter({
      hasText: new RegExp(`(?:^|\\s)${escapeRegex(instanceId)}(?:\\s|$)`),
    });
  }
  await expect(row).toHaveCount(1);

  const unloadResponse = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === `${API_ROOT}/model/unload`,
  );
  await row.getByRole('button', { name: 'Unload', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await readEnvelope<unknown>(await unloadResponse);
}

export async function cancelUnloadThroughUi(
  page: Page,
  target: AiModelTarget,
  instanceId: string,
): Promise<void> {
  await page.goto('/ai/kis-models/overview');
  const instances = page
    .locator('.el-card')
    .filter({
      has: page.getByText('Model Instance Status', { exact: true }),
    })
    .last();
  const row = instances
    .locator('.el-table__row')
    .filter({ hasText: target.modelName })
    .filter({ hasText: target.version })
    .filter({ hasText: target.provider })
    .filter({
      hasText: new RegExp(`(?:^|\\s)${escapeRegex(instanceId)}(?:\\s|$)`),
    });
  await expect(row).toHaveCount(1);

  let unloadRequestCount = 0;
  const countUnloadRequest = (request: { method(): string; url(): string }) => {
    if (
      request.method() === 'POST' &&
      new URL(request.url()).pathname === `${API_ROOT}/model/unload`
    ) {
      unloadRequestCount += 1;
    }
  };
  page.on('request', countUnloadRequest);
  try {
    await row.getByRole('button', { name: 'Unload', exact: true }).click();
    const confirmation = page.getByRole('dialog');
    await expect(confirmation).toBeVisible();
    await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(confirmation).toBeHidden();
    expect(unloadRequestCount).toBe(0);
  } finally {
    page.off('request', countUnloadRequest);
  }
}

export async function readGpuMemory(page: Page): Promise<GpuMemoryReading[]> {
  await page.goto('/ai/gpu/current');
  const gpuItems = page.locator('.el-collapse-item');
  await expect(gpuItems.first()).toBeVisible();

  const readings: GpuMemoryReading[] = [];
  for (let itemIndex = 0; itemIndex < (await gpuItems.count()); itemIndex += 1) {
    const item = gpuItems.nth(itemIndex);
    const header = (
      await item.locator('.el-collapse-item__header').innerText()
    ).trim();
    const gpuIndex = header.match(/^(\d+)\.\s+/);
    if (!gpuIndex) {
      throw new Error(`Could not read a GPU number from: ${header}`);
    }

    const content = item.locator('.el-collapse-item__wrap');
    if (!(await content.isVisible())) {
      await item.locator('.el-collapse-item__header').click();
    }
    await expect(content).toBeVisible();

    const memory = (await item.innerText()).match(
      /(\d+(?:\.\d+)?)\s*(MiB|GiB)\s*\/\s*(\d+(?:\.\d+)?)\s*(MiB|GiB)/,
    );
    if (!memory) {
      throw new Error(`GPU ${gpuIndex[1]} does not report used and total VRAM.`);
    }

    readings.push({
      index: Number(gpuIndex[1]),
      usedMiB: toMiB(Number(memory[1]), memory[2]),
      totalMiB: toMiB(Number(memory[3]), memory[4]),
    });
  }

  return readings;
}

export async function waitForVramIncrease(
  page: Page,
  baseline: GpuMemoryReading[],
  expectedGpuCount: number,
  minimumDeltaMiB: number,
  timeoutMs: number,
): Promise<GpuMemoryReading[]> {
  const deadline = Date.now() + timeoutMs;
  const baselineByIndex = new Map(
    baseline.map((reading) => [reading.index, reading.usedMiB]),
  );

  while (Date.now() < deadline) {
    const current = await readGpuMemory(page);
    const increased = current.filter(
      (reading) =>
        reading.usedMiB - (baselineByIndex.get(reading.index) ?? Infinity) >=
        minimumDeltaMiB,
    );
    if (increased.length === expectedGpuCount) {
      return increased;
    }
    await page.waitForTimeout(5_000);
  }

  throw new Error(
    `Expected VRAM to increase by at least ${minimumDeltaMiB} MiB on exactly ${expectedGpuCount} GPU(s).`,
  );
}

export async function waitForVramRelease(
  page: Page,
  baseline: GpuMemoryReading[],
  assignedGpuIndices: number[],
  toleranceMiB: number,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  const baselineByIndex = new Map(
    baseline.map((reading) => [reading.index, reading.usedMiB]),
  );

  while (Date.now() < deadline) {
    const current = await readGpuMemory(page);
    const currentByIndex = new Map(
      current.map((reading) => [reading.index, reading.usedMiB]),
    );
    const released = assignedGpuIndices.every((index) => {
      const before = baselineByIndex.get(index);
      const after = currentByIndex.get(index);
      return before !== undefined && after !== undefined && after <= before + toleranceMiB;
    });
    if (released) {
      return;
    }
    await page.waitForTimeout(5_000);
  }

  throw new Error(
    `Assigned GPU VRAM did not return within ${toleranceMiB} MiB of baseline.`,
  );
}
