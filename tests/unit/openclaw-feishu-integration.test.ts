// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockExistsSync,
  mockReadFile,
  mockMkdir,
  mockRm,
  mockCp,
  mockPatchInstalledFeishuPluginCompatibility,
  mockGetOpenClawStatus,
  mockRunOpenClawDoctor,
  mockValidateChannelConfig,
  mockLoadFeishuAuthRuntime,
  mockRenderQrPngDataUrl,
} = vi.hoisted(() => ({
  mockExistsSync: vi.fn(),
  mockReadFile: vi.fn(),
  mockMkdir: vi.fn(),
  mockRm: vi.fn(),
  mockCp: vi.fn(),
  mockPatchInstalledFeishuPluginCompatibility: vi.fn(),
  mockGetOpenClawStatus: vi.fn(),
  mockRunOpenClawDoctor: vi.fn(),
  mockValidateChannelConfig: vi.fn(),
  mockLoadFeishuAuthRuntime: vi.fn(),
  mockRenderQrPngDataUrl: vi.fn(),
}));

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
  },
}));

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    existsSync: mockExistsSync,
  };
});

vi.mock('node:fs/promises', async () => {
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
  return {
    ...actual,
    readFile: (...args: unknown[]) => mockReadFile(...args),
    mkdir: (...args: unknown[]) => mockMkdir(...args),
    rm: (...args: unknown[]) => mockRm(...args),
    cp: (...args: unknown[]) => mockCp(...args),
  };
});

vi.mock('@electron/utils/paths', () => ({
  getOpenClawStatus: (...args: unknown[]) => mockGetOpenClawStatus(...args),
  getOpenClawConfigDir: () => 'C:/Users/test/.openclaw',
}));

vi.mock('@electron/utils/openclaw-doctor', () => ({
  runOpenClawDoctor: (...args: unknown[]) => mockRunOpenClawDoctor(...args),
}));

vi.mock('@electron/utils/channel-config', () => ({
  validateChannelConfig: (...args: unknown[]) => mockValidateChannelConfig(...args),
}));

vi.mock('@electron/utils/wechat-plugin-compat', () => ({
  patchInstalledFeishuPluginCompatibility: (...args: unknown[]) => mockPatchInstalledFeishuPluginCompatibility(...args),
}));

vi.mock('@electron/services/feishu-auth-runtime', () => ({
  loadFeishuAuthRuntime: (...args: unknown[]) => mockLoadFeishuAuthRuntime(...args),
}));

vi.mock('@electron/utils/qr-code', () => ({
  renderQrPngDataUrl: (...args: unknown[]) => mockRenderQrPngDataUrl(...args),
}));

describe('feishu integration service', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockExistsSync.mockReturnValue(false);
    mockReadFile.mockResolvedValue('{}');
    mockMkdir.mockResolvedValue(undefined);
    mockRm.mockResolvedValue(undefined);
    mockCp.mockResolvedValue(undefined);
    mockPatchInstalledFeishuPluginCompatibility.mockReturnValue(true);
    mockGetOpenClawStatus.mockReturnValue({
      packageExists: true,
      isBuilt: true,
      entryPath: 'C:/openclaw/openclaw.mjs',
      dir: 'C:/openclaw',
      version: '2026.3.22',
    });
    mockRunOpenClawDoctor.mockResolvedValue({ success: true, exitCode: 0 });
    mockValidateChannelConfig.mockResolvedValue({ valid: true, errors: [], warnings: [] });
    mockRenderQrPngDataUrl.mockReturnValue('data:image/png;base64,qr');
    mockLoadFeishuAuthRuntime.mockResolvedValue({
      getLarkAccount: vi.fn((_cfg: unknown, accountId?: string) => ({
        configured: true,
        appId: 'cli_123',
        appSecret: 'secret_123',
        brand: 'feishu',
        accountId: accountId || 'default',
      })),
      createSdk: vi.fn(() => ({ sdk: true })),
      getAppGrantedScopes: vi.fn(async (_sdk: unknown, _appId: string, tokenType?: string) =>
        tokenType === 'tenant'
          ? ['application:application:self_manage', 'im:message:readonly']
          : ['im:message', 'offline_access'],
      ),
      requestDeviceAuthorization: vi.fn(async () => ({
        deviceCode: 'device-code',
        userCode: 'user-code',
        verificationUri: 'https://verify.example',
        verificationUriComplete: 'https://verify.example/complete',
        expiresIn: 600,
        interval: 5,
      })),
      pollDeviceToken: vi.fn(async () => ({
        ok: false,
        error: 'expired_token',
        message: 'pending',
      })),
      setStoredToken: vi.fn(async () => undefined),
      getStoredToken: vi.fn(async () => null),
      getAppOwnerFallback: vi.fn(async () => undefined),
      getTokenStatus: vi.fn(() => 'expired'),
      requiredAppScopes: ['application:application:self_manage', 'im:message:readonly'],
      filterSensitiveScopes: vi.fn((scopes: string[]) => scopes),
    });
  });

  it('reports status with recommended plugin version and feishu account ids', async () => {
    mockExistsSync.mockImplementation((filePath: string) => {
      if (filePath.includes('build\\openclaw-plugins\\feishu-openclaw-plugin') || filePath.includes('build/openclaw-plugins/feishu-openclaw-plugin')) {
        return true;
      }
      if (filePath.includes('.openclaw') && filePath.includes('extensions') && filePath.includes('feishu-openclaw-plugin')) {
        return true;
      }
      return false;
    });
    mockReadFile.mockImplementation(async (filePath: string) => {
      if (String(filePath).includes('build') && String(filePath).includes('package.json')) {
        return JSON.stringify({ version: '2026.3.25' });
      }
      if (String(filePath).includes('extensions') && String(filePath).includes('package.json')) {
        return JSON.stringify({ version: '2026.3.12' });
      }
      if (String(filePath).includes('openclaw.json')) {
        return JSON.stringify({
          channels: {
            feishu: {
              enabled: true,
              accounts: {
                default: { appId: 'cli_default', appSecret: 'secret' },
                agent_a: { appId: 'cli_agent', appSecret: 'secret2' },
              },
            },
          },
          plugins: {
            allow: ['openclaw-lark'],
            entries: {
              'openclaw-lark': { enabled: true },
            },
          },
        });
      }
      return '{}';
    });

    const { getFeishuIntegrationStatus } = await import('@electron/services/feishu-integration');
    const result = await getFeishuIntegrationStatus();

    expect(result.openClaw.version).toBe('2026.3.22');
    expect(result.openClaw.compatible).toBe(true);
    expect(result.plugin.bundledVersion).toBe('2026.3.25');
    expect(result.plugin.installedVersion).toBe('2026.3.12');
    expect(result.plugin.recommendedVersion).toBe('2026.3.25');
    expect(result.plugin.needsUpdate).toBe(true);
    expect(result.channel.configured).toBe(true);
    expect(result.channel.accountIds).toEqual(['default', 'agent_a']);
    expect(result.nextAction).toBe('update-plugin');
  });

  it('reports authorized status when the feishu app owner has a valid stored user token', async () => {
    mockExistsSync.mockImplementation((filePath: string) => {
      if (filePath.includes('build\\openclaw-plugins\\feishu-openclaw-plugin') || filePath.includes('build/openclaw-plugins/feishu-openclaw-plugin')) {
        return true;
      }
      if (filePath.includes('.openclaw') && filePath.includes('extensions') && filePath.includes('feishu-openclaw-plugin')) {
        return true;
      }
      return false;
    });
    mockReadFile.mockImplementation(async (filePath: string) => {
      if (String(filePath).includes('package.json')) {
        return JSON.stringify({ version: '2026.3.25' });
      }
      if (String(filePath).includes('openclaw.json')) {
        return JSON.stringify({
          channels: {
            feishu: {
              enabled: true,
              accounts: {
                default: { appId: 'cli_default', appSecret: 'secret' },
              },
            },
          },
          plugins: {
            allow: ['openclaw-lark'],
            entries: {
              'openclaw-lark': { enabled: true },
            },
          },
        });
      }
      return '{}';
    });
    mockLoadFeishuAuthRuntime.mockResolvedValue({
      getLarkAccount: vi.fn(() => ({
        configured: true,
        appId: 'cli_default',
        appSecret: 'secret',
        brand: 'feishu',
        accountId: 'default',
      })),
      createSdk: vi.fn(() => ({ sdk: true })),
      getAppGrantedScopes: vi.fn(async () => ['application:application:self_manage', 'im:message:readonly']),
      requestDeviceAuthorization: vi.fn(),
      pollDeviceToken: vi.fn(),
      setStoredToken: vi.fn(),
      getStoredToken: vi.fn(async () => ({ accessToken: 'token' })),
      getAppOwnerFallback: vi.fn(async () => 'ou_owner_1'),
      getTokenStatus: vi.fn(() => 'valid'),
      requiredAppScopes: ['application:application:self_manage', 'im:message:readonly'],
      filterSensitiveScopes: vi.fn((scopes: string[]) => scopes),
    });

    const { getFeishuIntegrationStatus } = await import('@electron/services/feishu-integration');
    const result = await getFeishuIntegrationStatus();

    expect(result.status).toBe('authorized');
    expect(result.auth).toEqual(expect.objectContaining({
      accountId: 'default',
      ownerOpenId: 'ou_owner_1',
      tokenStatus: 'valid',
    }));
  });

  it('reports expired status when the stored feishu user authorization has expired', async () => {
    mockExistsSync.mockImplementation((filePath: string) => {
      if (filePath.includes('build\\openclaw-plugins\\feishu-openclaw-plugin') || filePath.includes('build/openclaw-plugins/feishu-openclaw-plugin')) {
        return true;
      }
      if (filePath.includes('.openclaw') && filePath.includes('extensions') && filePath.includes('feishu-openclaw-plugin')) {
        return true;
      }
      return false;
    });
    mockReadFile.mockImplementation(async (filePath: string) => {
      if (String(filePath).includes('package.json')) {
        return JSON.stringify({ version: '2026.3.25' });
      }
      if (String(filePath).includes('openclaw.json')) {
        return JSON.stringify({
          channels: {
            feishu: {
              enabled: true,
              accounts: {
                default: { appId: 'cli_default', appSecret: 'secret' },
              },
            },
          },
          plugins: {
            allow: ['openclaw-lark'],
            entries: {
              'openclaw-lark': { enabled: true },
            },
          },
        });
      }
      return '{}';
    });
    mockLoadFeishuAuthRuntime.mockResolvedValue({
      getLarkAccount: vi.fn(() => ({
        configured: true,
        appId: 'cli_default',
        appSecret: 'secret',
        brand: 'feishu',
        accountId: 'default',
      })),
      createSdk: vi.fn(() => ({ sdk: true })),
      getAppGrantedScopes: vi.fn(async () => ['application:application:self_manage', 'im:message:readonly']),
      requestDeviceAuthorization: vi.fn(),
      pollDeviceToken: vi.fn(),
      setStoredToken: vi.fn(),
      getStoredToken: vi.fn(async () => ({ accessToken: 'token' })),
      getAppOwnerFallback: vi.fn(async () => 'ou_owner_1'),
      getTokenStatus: vi.fn(() => 'expired'),
      requiredAppScopes: ['application:application:self_manage', 'im:message:readonly'],
      filterSensitiveScopes: vi.fn((scopes: string[]) => scopes),
    });

    const { getFeishuIntegrationStatus } = await import('@electron/services/feishu-integration');
    const result = await getFeishuIntegrationStatus();

    expect(result.status).toBe('expired');
    expect(result.auth).toEqual(expect.objectContaining({
      accountId: 'default',
      ownerOpenId: 'ou_owner_1',
      tokenStatus: 'expired',
    }));
  });

  it('falls back quickly when feishu authorization probing hangs', async () => {
    vi.useFakeTimers();
    try {
      mockExistsSync.mockImplementation((filePath: string) => {
        if (filePath.includes('build\\openclaw-plugins\\feishu-openclaw-plugin') || filePath.includes('build/openclaw-plugins/feishu-openclaw-plugin')) {
          return true;
        }
        if (filePath.includes('.openclaw') && filePath.includes('extensions') && filePath.includes('feishu-openclaw-plugin')) {
          return true;
        }
        return false;
      });
      mockReadFile.mockImplementation(async (filePath: string) => {
        if (String(filePath).includes('package.json')) {
          return JSON.stringify({ version: '2026.3.25' });
        }
        if (String(filePath).includes('openclaw.json')) {
          return JSON.stringify({
            channels: {
              feishu: {
                enabled: true,
                accounts: {
                  default: { appId: 'cli_default', appSecret: 'secret' },
                },
              },
            },
            plugins: {
              allow: ['openclaw-lark'],
              entries: {
                'openclaw-lark': { enabled: true },
              },
            },
          });
        }
        return '{}';
      });
      mockLoadFeishuAuthRuntime.mockResolvedValue({
        getLarkAccount: vi.fn(() => ({
          configured: true,
          appId: 'cli_default',
          appSecret: 'secret',
          brand: 'feishu',
          accountId: 'default',
        })),
        createSdk: vi.fn(() => ({ sdk: true })),
        getAppGrantedScopes: vi.fn(async () => ['application:application:self_manage', 'im:message:readonly']),
        requestDeviceAuthorization: vi.fn(),
        pollDeviceToken: vi.fn(),
        setStoredToken: vi.fn(),
        getStoredToken: vi.fn(async () => null),
        getAppOwnerFallback: vi.fn(() => new Promise(() => undefined)),
        getTokenStatus: vi.fn(() => 'unknown'),
        requiredAppScopes: ['application:application:self_manage', 'im:message:readonly'],
        filterSensitiveScopes: vi.fn((scopes: string[]) => scopes),
      });

      const { getFeishuIntegrationStatus } = await import('@electron/services/feishu-integration');
      const resultPromise = getFeishuIntegrationStatus();
      const watchdogPromise = new Promise<'timed_out'>((resolve) => {
        setTimeout(() => resolve('timed_out'), 2500);
      });
      const raced = Promise.race([resultPromise, watchdogPromise]);

      await vi.advanceTimersByTimeAsync(2500);
      const result = await raced;

      expect(result).not.toBe('timed_out');
      expect(result).toEqual(expect.objectContaining({
        status: 'bot-only',
        auth: expect.objectContaining({
          accountId: 'default',
          tokenStatus: 'unknown',
        }),
      }));
    } finally {
      vi.useRealTimers();
    }
  });

  it('installs the bundled feishu plugin into the openclaw extensions directory', async () => {
    mockExistsSync.mockImplementation((filePath: string) =>
      String(filePath).includes('build') && String(filePath).includes('feishu-openclaw-plugin'),
    );
    mockReadFile.mockImplementation(async (filePath: string) => {
      if (String(filePath).includes('build') && String(filePath).includes('package.json')) {
        return JSON.stringify({ version: '2026.3.25' });
      }
      return '{}';
    });

    const { installOrUpdateFeishuPlugin } = await import('@electron/services/feishu-integration');
    const result = await installOrUpdateFeishuPlugin();

    expect(mockRm).toHaveBeenCalled();
    expect(mockCp).toHaveBeenCalled();
    expect(mockPatchInstalledFeishuPluginCompatibility).toHaveBeenCalledWith(
      expect.stringContaining('feishu-openclaw-plugin'),
    );
    expect(result.success).toBe(true);
    expect(result.version).toBe('2026.3.25');
    expect(result.source).toBe('bundled');
  });

  it('starts a feishu user authorization session with qr payload', async () => {
    const { startFeishuUserAuthorization } = await import('@electron/services/feishu-integration');

    const result = await startFeishuUserAuthorization('default');

    expect(result.state).toBe('pending');
    expect(result.userCode).toBe('user-code');
    expect(result.verificationUriComplete).toBe('https://verify.example/complete');
    expect(result.qrCodeDataUrl).toBe('data:image/png;base64,qr');
    expect(result.scopeCount).toBe(2);
  });
});
