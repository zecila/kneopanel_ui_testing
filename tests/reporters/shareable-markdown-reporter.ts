import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
} from '@playwright/test/reporter';

interface MarkdownReporterOptions {
  notesFile?: string;
  outputFile?: string;
}

interface ReportedTest {
  case: TestCase;
  durationMs: number;
  outcome: string;
  status: string;
}

const STATUS_ORDER = ['FAIL', 'FLAKY', 'KNOWN DEFECT', 'SKIP', 'PASS'];

function escapeCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
}

function featureName(file: string): string {
  const normalized = file.split(path.sep).join('/');
  const relative = normalized.includes('/tests/')
    ? normalized.split('/tests/')[1]
    : normalized;
  const parts = relative.split('/');
  const fileName = (parts.pop() ?? relative)
    .replace(/\.spec\.ts$/, '')
    .replace(/\.setup\.ts$/, '')
    .replace(/[-_]/g, ' ');
  const labels: Record<string, string> = {
    ai: 'AI',
    authentication: 'Authentication',
    cleanup: 'Cleanup',
    configuration: 'Configuration',
    containers: 'Containers',
    'cron-jobs': 'Cron Jobs',
    mutating: 'Mutations',
    navigation: 'Navigation',
    overview: 'Overview',
    public: 'Public access',
    'read-only': 'Read only',
    scripts: 'Script Library',
    settings: 'Settings',
    system: 'System',
    terminal: 'Terminal',
    validation: 'Validation',
  };
  const section = parts
    .filter((part) => part !== 'smoke')
    .map((part) => labels[part] ?? part.replace(/[-_]/g, ' '))
    .join(' > ');
  const title = fileName.replace(/\b\w/g, (letter) => letter.toUpperCase());
  return section ? `${section} > ${title}` : title;
}

function displayStatus(test: TestCase): string {
  const outcome = test.outcome();
  if (outcome === 'unexpected') return 'FAIL';
  if (outcome === 'flaky') return 'FLAKY';
  if (outcome === 'skipped') return 'SKIP';
  if (test.expectedStatus === 'failed') return 'KNOWN DEFECT';
  return 'PASS';
}

function displayTitle(test: TestCase): string {
  const project = test.parent.project()?.name;
  const titles = test
    .titlePath()
    .filter((title) => title && title !== project)
    .filter((title) => !/\.(?:spec|setup)\.ts$/.test(title));
  return titles.join(' > ') || test.title;
}

function formatDuration(milliseconds: number): string {
  if (milliseconds < 1_000) return `${milliseconds} ms`;
  return `${(milliseconds / 1_000).toFixed(1)} s`;
}

function failureText(test: TestCase): string | undefined {
  const result = test.results.at(-1);
  const message = result?.errors
    .map((error) => error.message)
    .filter(Boolean)
    .join('\n\n')
    .replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, '');
  return message || undefined;
}

export default class ShareableMarkdownReporter implements Reporter {
  private config?: FullConfig;
  private readonly notesFile?: string;
  private rootSuite?: Suite;
  private readonly outputFile: string;
  private startedAt = new Date();

  constructor(options: MarkdownReporterOptions = {}) {
    this.notesFile = options.notesFile;
    this.outputFile = options.outputFile ?? 'playwright-report/summary.md';
  }

  onBegin(config: FullConfig, suite: Suite): void {
    this.config = config;
    this.rootSuite = suite;
    this.startedAt = new Date();
  }

  onEnd(result: FullResult): void {
    if (!this.rootSuite) return;

    const tests: ReportedTest[] = this.rootSuite.allTests().map((test) => ({
      case: test,
      durationMs: test.results.reduce(
        (total, testResult) => total + testResult.duration,
        0,
      ),
      outcome: test.outcome(),
      status: displayStatus(test),
    }));
    const statusCounts = new Map<string, number>();
    for (const test of tests) {
      statusCounts.set(test.status, (statusCounts.get(test.status) ?? 0) + 1);
    }

    const lines = [
      '# KneoPanel Playwright Test Report',
      '',
      `- Overall result: **${result.status.toUpperCase()}**`,
      `- Target: \`${process.env.KNEO_BASE_URL ?? this.config?.projects[0]?.use.baseURL ?? 'not set'}\``,
      `- Started: ${this.startedAt.toISOString()}`,
      `- Duration: ${formatDuration(result.duration)}`,
      `- Total cases: ${tests.length}`,
      ...STATUS_ORDER.filter((status) => statusCounts.has(status)).map(
        (status) => `- ${status}: ${statusCounts.get(status)}`,
      ),
      '',
      '## Results by project and feature',
      '',
    ];

    const projects = new Map<string, Map<string, ReportedTest[]>>();
    for (const test of tests) {
      const project = test.case.parent.project()?.name ?? 'unassigned';
      const feature = featureName(test.case.location.file);
      const projectFeatures = projects.get(project) ?? new Map();
      const featureTests = projectFeatures.get(feature) ?? [];
      featureTests.push(test);
      projectFeatures.set(feature, featureTests);
      projects.set(project, projectFeatures);
    }

    for (const [project, features] of projects) {
      lines.push(`### ${project}`, '');
      for (const [feature, featureTests] of features) {
        lines.push(
          `#### ${feature}`,
          '',
          '| Status | Test case | Duration |',
          '| --- | --- | ---: |',
        );
        for (const test of featureTests) {
          lines.push(
            `| ${test.status} | ${escapeCell(displayTitle(test.case))} | ${formatDuration(test.durationMs)} |`,
          );
        }
        lines.push('');
      }
    }

    const failures = tests.filter((test) => test.outcome === 'unexpected');
    if (failures.length > 0) {
      lines.push('## Unexpected failures', '');
      for (const failure of failures) {
        lines.push(
          `### ${escapeCell(displayTitle(failure.case))}`,
          '',
          `Source: \`${path.relative(process.cwd(), failure.case.location.file)}:${failure.case.location.line}\``,
          '',
          '```text',
          failureText(failure.case) ?? 'No failure message was reported.',
          '```',
          '',
        );
      }
    }

    if (this.notesFile) {
      const notesPath = path.resolve(this.notesFile);
      if (existsSync(notesPath)) {
        lines.push(
          '## Review notes and pending reproduction',
          '',
          readFileSync(notesPath, 'utf8').trim(),
          '',
        );
      }
    }

    const outputPath = path.resolve(this.outputFile);
    mkdirSync(path.dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8');
  }
}
