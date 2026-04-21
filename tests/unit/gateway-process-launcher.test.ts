import { beforeEach, describe, expect, it, vi } from 'vitest';

const { forkMock, writeFileSyncMock, existsSyncMock } = vi.hoisted(() => ({
  forkMock: vi.fn(),
  writeFileSyncMock: vi.fn(),
  existsSyncMock: vi.fn(),
}));

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getPath: vi.fn(() => 'C:/Users/test/AppData/Roaming/KTClaw'),
  },
  utilityProcess: {
    fork: (...args: unknown[]) => forkMock(...args),
  },
}));

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    writeFileSync: (...args: unknown[]) => writeFileSyncMock(...args),
    existsSync: (...args: unknown[]) => existsSyncMock(...args),
  };
});

describe('launchGatewayProcess', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    existsSyncMock.mockReturnValue(true);
    forkMock.mockImplementation((_entry: string, _args: string[], _options: Record<string, unknown>) => {
      const listeners = new Map<string, Array<(...args: unknown[]) => void>>();
      const on = (event: string, handler: (...args: unknown[]) => void) => {
        const current = listeners.get(event) ?? [];
        current.push(handler);
        listeners.set(event, current);
      };
      const emit = (event: string, ...args: unknown[]) => {
        for (const handler of listeners.get(event) ?? []) {
          handler(...args);
        }
      };
      const child = {
        pid: 12345,
        stderr: { on },
        stdout: { on },
        on,
      };
      setImmediate(() => emit('spawn'));
      return child;
    });
  });

  it('marks OpenClaw node options as ready to avoid entry respawn inside Electron utility process', async () => {
    const { launchGatewayProcess } = await import('@electron/gateway/process-launcher');

    await launchGatewayProcess({
      port: 18789,
      launchContext: {
        openclawDir: 'C:/repo/node_modules/openclaw',
        entryScript: 'C:/repo/node_modules/openclaw/openclaw.mjs',
        gatewayArgs: ['gateway', '--port', '18789', '--token', 'token', '--allow-unconfigured'],
        forkEnv: {},
        mode: 'dev',
        binPathExists: true,
        loadedProviderKeyCount: 0,
        proxySummary: 'disabled',
        channelStartupSummary: 'enabled(feishu)',
        appSettings: {} as never,
      },
      sanitizeSpawnArgs: (args) => args,
      getCurrentState: () => 'starting',
      getShouldReconnect: () => true,
      onStderrLine: () => {},
      onSpawn: () => {},
      onExit: () => {},
      onError: () => {},
    });

    const options = forkMock.mock.calls[0]?.[2] as { env?: Record<string, string> } | undefined;
    expect(options?.env?.OPENCLAW_NODE_OPTIONS_READY).toBe('1');
    expect(options?.env?.NODE_OPTIONS).toContain('--disable-warning=ExperimentalWarning');
    expect(options?.env?.NODE_OPTIONS).toContain('gateway-fetch-preload.cjs');
  });

  it('strips supervisor marker env vars before forking the embedded gateway', async () => {
    const { launchGatewayProcess } = await import('@electron/gateway/process-launcher');

    await launchGatewayProcess({
      port: 18789,
      launchContext: {
        openclawDir: 'C:/repo/node_modules/openclaw',
        entryScript: 'C:/repo/node_modules/openclaw/openclaw.mjs',
        gatewayArgs: ['gateway', '--port', '18789', '--token', 'token', '--allow-unconfigured'],
        forkEnv: {
          OPENCLAW_WINDOWS_TASK_NAME: 'OpenClaw Gateway',
          OPENCLAW_SERVICE_MARKER: '1',
          OPENCLAW_SERVICE_KIND: 'gateway',
        },
        mode: 'dev',
        binPathExists: true,
        loadedProviderKeyCount: 0,
        proxySummary: 'disabled',
        channelStartupSummary: 'enabled(feishu)',
        appSettings: {} as never,
      },
      sanitizeSpawnArgs: (args) => args,
      getCurrentState: () => 'starting',
      getShouldReconnect: () => true,
      onStderrLine: () => {},
      onSpawn: () => {},
      onExit: () => {},
      onError: () => {},
    });

    const options = forkMock.mock.calls.at(-1)?.[2] as { env?: Record<string, string | undefined> } | undefined;
    expect(options?.env?.OPENCLAW_WINDOWS_TASK_NAME).toBeUndefined();
    expect(options?.env?.OPENCLAW_SERVICE_MARKER).toBeUndefined();
    expect(options?.env?.OPENCLAW_SERVICE_KIND).toBeUndefined();
  });
});
