import { spawnSync } from 'node:child_process';
import path from 'node:path';

const aiRunner = path.join(
  process.cwd(),
  'scripts',
  'run-ai-mutating-tests.mjs',
);
const testDirectory = path.join(
  'tests',
  'mutating',
  'ai',
  'model-configuration',
);
const stages = {
  upload: path.join(testDirectory, '01-model-bundle-upload.spec.ts'),
  generate: path.join(testDirectory, '02-generate-registry.spec.ts'),
  'add-version': path.join(testDirectory, '03-add-version.spec.ts'),
};

const forwardedArguments = process.argv.slice(2);
const skipBinaryUpload = forwardedArguments.includes('--skip-binary-upload');
if (skipBinaryUpload) {
  process.env.KNEO_MODEL_CONFIG_SKIP_UPLOAD = 'true';
}
const stageArgument = forwardedArguments.find((argument) =>
  argument.startsWith('--stage='),
);
const stage = stageArgument?.slice('--stage='.length);
if (stage && !(stage in stages)) {
  console.error(
    `Unknown model configuration stage: ${stage}. Use upload, generate, or add-version.`,
  );
  process.exit(1);
}
const playwrightArguments = forwardedArguments.filter(
  (argument) =>
    argument !== stageArgument && argument !== '--skip-binary-upload',
);
const target = stage ? stages[stage] : testDirectory;

const result = spawnSync(
  process.execPath,
  [aiRunner, target, ...playwrightArguments],
  { env: process.env, stdio: 'inherit' },
);

process.exit(result.status ?? 1);
