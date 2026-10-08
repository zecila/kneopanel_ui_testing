import type { Page } from '@playwright/test';

import { test, expect } from '../../fixtures/read-only-test';

interface TerminalFrame {
  cols?: number;
  data?: string;
  line?: string;
  rows?: number;
  timestamp?: string;
  type: string;
}

const COMMAND_TREE_PATH = '/api/v2/core/commands/tree';
const HOST_TREE_PATH = '/api/v2/hosts/tree';
const GROUP_SEARCH_PATH = '/api/v2/groups/search';
const LOCAL_SETTING_PATH = '/api/v2/settings/get/LocalSSHConnShow';
const LOCAL_SSH_CHECK_PATH = '/api/v2/settings/ssh/check';
const SSH_CONNECTION_PATH = '/api/v2/settings/ssh/conn';
const TERMINAL_SETTINGS_PATH = '/api/v2/core/settings/terminal/search';
const TERMINAL_SOCKET_PATH = '/api/v2/hosts/terminal';

const TERMINAL_SETTINGS = {
  backgroundColor: '#000000',
  cursorBlink: 'enable',
  cursorStyle: 'underline',
  fontFamily: "Monaco, Menlo, Consolas, 'Courier New', monospace",
  fontSize: '12',
  foregroundColor: '#f5f5f5',
  letterSpacing: '1.2',
  lineHeight: '1.2',
  scrollback: '1000',
  scrollSensitivity: '6',
};

function encodeTerminal(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function decodeTerminal(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8');
}

async function routeTerminalBootstrap(
  page: Page,
  localAvailable = true,
): Promise<void> {
  await page.route(`**${TERMINAL_SETTINGS_PATH}`, (route) =>
    route.fulfill({
      json: { code: 200, data: TERMINAL_SETTINGS, message: '' },
    }),
  );
  await page.route(`**${COMMAND_TREE_PATH}`, (route) => {
    expect(route.request().postDataJSON()).toEqual({ type: 'command' });
    return route.fulfill({
      json: {
        code: 200,
        data: [
          {
            children: [
              {
                id: 97001,
                label: 'kneo-e2e safe command',
                value: 'printf kneo-e2e-safe',
              },
            ],
            id: 97000,
            label: 'kneo-e2e commands',
            value: '',
          },
        ],
        message: '',
      },
    });
  });
  await page.route(`**${HOST_TREE_PATH}`, (route) =>
    route.fulfill({
      json: { code: 200, data: [], message: '' },
    }),
  );
  await page.route(`**${GROUP_SEARCH_PATH}`, (route) =>
    route.fulfill({
      json: { code: 200, data: { items: [], total: 0 }, message: '' },
    }),
  );
  await page.route(`**${LOCAL_SETTING_PATH}`, (route) =>
    route.fulfill({
      json: { code: 200, data: 'Enable', message: '' },
    }),
  );
  await page.route(`**${LOCAL_SSH_CHECK_PATH}`, (route) => {
    expect(route.request().postData()).toBeNull();
    return route.fulfill({
      json: { code: 200, data: localAvailable, message: '' },
    });
  });
  await page.route(`**${SSH_CONNECTION_PATH}`, (route) =>
    route.fulfill({
      json: {
        code: 200,
        data: {
          addr: '',
          authMode: 'password',
          passPhrase: '',
          password: '',
          port: 22,
          privateKey: '',
          user: 'root',
        },
        message: '',
      },
    }),
  );
}

async function expectTerminalOutput(page: Page, value: string): Promise<void> {
  await expect(page.locator('.xterm-rows')).toContainText(value);
}

test.describe('Terminals > Local session [H,V,F,R,P,C,A]', () => {
  test('connects through the exact socket and renders only synthetic output', async ({
    page,
  }) => {
    await routeTerminalBootstrap(page);
    const frames: TerminalFrame[] = [];
    let query: Record<string, string> = {};
    await page.routeWebSocket(
      (url) => url.pathname === TERMINAL_SOCKET_PATH,
      (socket) => {
        query = Object.fromEntries(new URL(socket.url()).searchParams.entries());
        socket.onMessage((message) => {
          const frame = JSON.parse(message.toString()) as TerminalFrame;
          frames.push(frame);
          if (frame.type === 'resize') {
            socket.send(
              JSON.stringify({
                data: encodeTerminal('kneo-e2e synthetic terminal ready\r\n'),
                type: 'cmd',
              }),
            );
          }
        });
      },
    );

    await page.goto('/terminal');
    await expectTerminalOutput(page, 'kneo-e2e synthetic terminal ready');
    expect(query.operateNode).toBe('local');
    expect(Number(query.cols)).toBeGreaterThan(0);
    expect(Number(query.rows)).toBeGreaterThan(0);
    expect(frames.some((frame) => frame.type === 'resize')).toBe(true);
    const resize = frames.find((frame) => frame.type === 'resize');
    expect(resize).toEqual(
      expect.objectContaining({
        cols: expect.any(Number),
        rows: expect.any(Number),
        type: 'resize',
      }),
    );
    await expect(page.getByRole('tab', { name: /Localhost/ })).toBeVisible();
  });

  test('sends an exact safe command frame and renders its synthetic reply', async ({
    page,
  }) => {
    await routeTerminalBootstrap(page);
    const commandFrames: TerminalFrame[] = [];
    await page.routeWebSocket(
      (url) => url.pathname === TERMINAL_SOCKET_PATH,
      (socket) => {
        socket.onMessage((message) => {
          const frame = JSON.parse(message.toString()) as TerminalFrame;
          if (frame.type !== 'cmd') return;
          commandFrames.push(frame);
          socket.send(
            JSON.stringify({
              data: encodeTerminal('kneo-e2e synthetic command reply\r\n'),
              type: 'cmd',
            }),
          );
        });
      },
    );

    await page.goto('/terminal');
    const command = page.getByPlaceholder('>');
    await command.fill('printf kneo-e2e-safe');
    await command.press('Enter');
    await expectTerminalOutput(page, 'kneo-e2e synthetic command reply');

    expect(commandFrames).toHaveLength(1);
    expect(commandFrames[0]).toEqual(
      expect.objectContaining({ type: 'cmd' }),
    );
    expect(decodeTerminal(commandFrames[0].data ?? '')).toBe(
      'printf kneo-e2e-safe\n',
    );
    await expect(command).toHaveValue('');
  });

  test('selects a synthetic Quick Command and sends its exact value', async ({
    page,
  }) => {
    await routeTerminalBootstrap(page);
    const commands: string[] = [];
    await page.routeWebSocket(
      (url) => url.pathname === TERMINAL_SOCKET_PATH,
      (socket) => {
        socket.onMessage((message) => {
          const frame = JSON.parse(message.toString()) as TerminalFrame;
          if (frame.type !== 'cmd') return;
          commands.push(decodeTerminal(frame.data ?? ''));
          socket.send(
            JSON.stringify({
              data: encodeTerminal('kneo-e2e quick command reply\r\n'),
              type: 'cmd',
            }),
          );
        });
      },
    );

    await page.goto('/terminal');
    await page.getByPlaceholder('Quick command').click();
    const panel = page.locator('.el-cascader-panel:visible');
    await panel.getByText('kneo-e2e commands', { exact: true }).hover();
    await panel.getByText('kneo-e2e safe command', { exact: true }).click();
    await expectTerminalOutput(page, 'kneo-e2e quick command reply');
    expect(commands).toEqual(['printf kneo-e2e-safe\n']);
  });

  test('shows a closed connection and reconnects without sending a command', async ({
    page,
  }) => {
    await routeTerminalBootstrap(page);
    let connections = 0;
    const commandFrames: TerminalFrame[] = [];
    await page.routeWebSocket(
      (url) => url.pathname === TERMINAL_SOCKET_PATH,
      (socket) => {
        connections += 1;
        const currentConnection = connections;
        socket.onMessage(async (message) => {
          const frame = JSON.parse(message.toString()) as TerminalFrame;
          if (frame.type === 'cmd') commandFrames.push(frame);
          if (frame.type !== 'resize') return;
          if (currentConnection === 1) {
            await socket.close({
              code: 1011,
              reason: 'kneo-e2e terminal unavailable',
            });
            return;
          }
          socket.send(
            JSON.stringify({
              data: encodeTerminal('kneo-e2e terminal recovered\r\n'),
              type: 'cmd',
            }),
          );
        });
      },
    );

    await page.goto('/terminal');
    await expectTerminalOutput(page, 'The connection has been disconnected.');
    await expectTerminalOutput(page, 'kneo-e2e terminal unavailable');

    const activeTab = page.locator('.el-tabs__item.is-active');
    await activeTab.locator('button').click();
    await expectTerminalOutput(page, 'kneo-e2e terminal recovered');
    expect(connections).toBe(2);
    expect(commandFrames).toEqual([]);
  });

  test('does not send undefined from the initially blank AI helper input', async ({
    page,
  }) => {
    test.info().annotations.push({
      type: 'bug-report',
      description:
        'docs/bugs/2026-10-07/verified-ui-bugs-10-07-2026.md#35-first-blank-submission-in-the-ai-helper-input-sends-undefined',
    });
    await routeTerminalBootstrap(page);
    const commands: string[] = [];
    await page.routeWebSocket(
      (url) => url.pathname === TERMINAL_SOCKET_PATH,
      (socket) => {
        socket.onMessage((message) => {
          const frame = JSON.parse(message.toString()) as TerminalFrame;
          if (frame.type === 'cmd') {
            commands.push(decodeTerminal(frame.data ?? ''));
          }
        });
      },
    );

    await page.goto('/terminal');
    const command = page.getByPlaceholder('>');
    await expect(command).toHaveValue('');
    await command.press('Enter');
    await page.waitForTimeout(250);
    const firstSubmission = [...commands];
    await expect(command).toHaveValue('');

    await command.press('Enter');
    await page.waitForTimeout(250);
    const secondSubmissionWasNoOp = commands.length === firstSubmission.length;
    const sentUndefinedOnce =
      firstSubmission.length === 1 &&
      firstSubmission[0] === 'undefined\n' &&
      secondSubmissionWasNoOp;
    test.fail(
      sentUndefinedOnce,
      'Known defect: the first blank AI helper submission sends undefined; later blank submissions are ignored.',
    );
    expect(commands).toEqual([]);
  });

  test('explains unavailable local access without opening a socket', async ({
    page,
  }) => {
    await routeTerminalBootstrap(page, false);
    let connections = 0;
    await page.routeWebSocket(
      (url) => url.pathname === TERMINAL_SOCKET_PATH,
      () => {
        connections += 1;
      },
    );

    await page.goto('/terminal');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(
      'Unable to automatically authenticate, fill in the local server login information.',
    );
    await expect(dialog.getByText('Address', { exact: true })).toBeVisible();
    await expect(dialog.getByText('Username', { exact: true })).toBeVisible();
    await expect(dialog.getByText('Authentication', { exact: true })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Save and connect' })).toBeDisabled();
    expect(connections).toBe(0);
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(
      page.getByText('No terminal is currently connected.', { exact: true }),
    ).toBeVisible();
  });

  test('closes the synthetic session and returns to the empty terminal state', async ({
    page,
  }) => {
    await routeTerminalBootstrap(page);
    let connections = 0;
    await page.routeWebSocket(
      (url) => url.pathname === TERMINAL_SOCKET_PATH,
      (socket) => {
        connections += 1;
        socket.onMessage(() => {});
      },
    );

    await page.goto('/terminal');
    const activeTab = page.locator('.el-tabs__item.is-active');
    await expect(activeTab).toContainText('Localhost');
    await activeTab.locator('.is-icon-close').click();
    await expect(
      page.getByText('No terminal is currently connected.', { exact: true }),
    ).toBeVisible();
    await expect(page.locator('.xterm')).toHaveCount(0);
    expect(connections).toBe(1);
  });
});
