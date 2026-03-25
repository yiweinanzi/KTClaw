import type { IncomingMessage, ServerResponse } from 'http';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  sendJson: vi.fn(),
  parseJsonBody: vi.fn(),
  listConfiguredChannels: vi.fn(async () => ['feishu']),
  deleteChannelConfig: vi.fn(),
  deleteChannelAccountConfig: vi.fn(),
  clearAllBindingsForChannel: vi.fn(),
  clearChannelBinding: vi.fn(),
}));

vi.mock('@electron/api/route-utils', () => ({
  sendJson: mocks.sendJson,
  parseJsonBody: mocks.parseJsonBody,
}));

vi.mock('@electron/utils/channel-config', () => ({
  listConfiguredChannels: mocks.listConfiguredChannels,
  deleteChannelConfig: mocks.deleteChannelConfig,
  deleteChannelAccountConfig: mocks.deleteChannelAccountConfig,
  getChannelFormValues: vi.fn(),
  saveChannelConfig: vi.fn(),
  setChannelEnabled: vi.fn(),
  validateChannelConfig: vi.fn(),
  validateChannelCredentials: vi.fn(),
}));

vi.mock('@electron/utils/agent-config', () => ({
  assignChannelToAgent: vi.fn(),
  clearAllBindingsForChannel: mocks.clearAllBindingsForChannel,
  clearChannelBinding: mocks.clearChannelBinding,
}));

vi.mock('@electron/utils/whatsapp-login', () => ({
  whatsAppLoginManager: {
    start: vi.fn(),
    stop: vi.fn(),
  },
}));

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: () => 'C:/test-app',
  },
}));

vi.mock('node:http', async () => {
  const { EventEmitter } = await vi.importActual<typeof import('node:events')>('node:events');
  const request = vi.fn((options: unknown, cb: (r: unknown) => void) => {
    const res = new EventEmitter();
    process.nextTick(() => {
      res.emit('data', Buffer.alloc(0));
      res.emit('end');
    });
    cb(res);
    return {
      on: vi.fn(),
      write: vi.fn(),
      end: vi.fn(),
    };
  });
  return { request };
});

function createRequest(method: string): IncomingMessage {
  return { method } as IncomingMessage;
}

describe('channels routes', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('returns normalized runtime capabilities for configured channels', async () => {
    const { handleChannelRoutes } = await import('@electron/api/routes/channels');
    const ctx = {
      gatewayManager: {
        getStatus: () => ({ state: 'running', port: 18789 }),
        rpc: vi.fn(async (method: string) => {
          if (method === 'channels.status') {
            return {
              channels: {
                feishu: { configured: true, running: true },
              },
              channelAccounts: {
                feishu: [
                  {
                    accountId: 'default',
                    configured: true,
                    connected: true,
                  },
                ],
              },
              channelDefaultAccountId: {
                feishu: 'default',
              },
            };
          }
          throw new Error(`Unexpected RPC method: ${method}`);
        }),
        debouncedRestart: vi.fn(),
        debouncedReload: vi.fn(),
      },
    } as never;

    const handled = await handleChannelRoutes(
      createRequest('GET'),
      {} as ServerResponse,
      new URL('http://127.0.0.1:3210/api/channels/capabilities'),
      ctx,
    );

    expect(handled).toBe(true);
    expect(mocks.sendJson).toHaveBeenLastCalledWith(expect.anything(), 200, {
      success: true,
      capabilities: [
        expect.objectContaining({
          channelId: 'feishu-default',
          channelType: 'feishu',
          status: 'connected',
          availableActions: ['disconnect', 'test', 'send', 'configure'],
          capabilityFlags: expect.objectContaining({
            supportsSchemaSummary: true,
          }),
          configSchemaSummary: expect.objectContaining({
            totalFieldCount: 2,
            requiredFieldCount: 2,
          }),
        }),
      ],
    });
  });

  it('rate limits channel test requests per channel/account', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
    const { handleChannelRoutes } = await import('@electron/api/routes/channels');
    const ctx = {
      gatewayManager: {
        getStatus: () => ({ state: 'running', port: 18789 }),
        rpc: vi.fn(),
        debouncedRestart: vi.fn(),
        debouncedReload: vi.fn(),
      },
    } as never;

    const url = new URL('http://127.0.0.1:3210/api/channels/feishu-default/test');
    const res = {} as ServerResponse;

    await handleChannelRoutes(createRequest('POST'), res, url, ctx);
    await handleChannelRoutes(createRequest('POST'), res, url, ctx);
    await handleChannelRoutes(createRequest('POST'), res, url, ctx);

    expect(mocks.sendJson).toHaveBeenLastCalledWith(expect.anything(), 429, {
      success: false,
      error: 'Rate limit exceeded',
      retryAfterSeconds: expect.any(Number),
    });
    const lastCall = mocks.sendJson.mock.calls[mocks.sendJson.mock.calls.length - 1];
    expect(lastCall[2].retryAfterSeconds).toBeGreaterThan(0);
  });

  it('rate limits channel send requests per channel/account', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'));
    const { handleChannelRoutes } = await import('@electron/api/routes/channels');
    const ctx = {
      gatewayManager: {
        getStatus: () => ({ state: 'running', port: 18789 }),
        rpc: vi.fn(),
        debouncedRestart: vi.fn(),
        debouncedReload: vi.fn(),
      },
    } as never;

    const url = new URL('http://127.0.0.1:3210/api/channels/feishu-default/send');
    const res = {} as ServerResponse;
    mocks.parseJsonBody.mockResolvedValue({ text: 'hello' });

    for (let i = 0; i < 8; i += 1) {
      await handleChannelRoutes(createRequest('POST'), res, url, ctx);
    }
    await handleChannelRoutes(createRequest('POST'), res, url, ctx);

    expect(mocks.sendJson).toHaveBeenLastCalledWith(expect.anything(), 429, {
      success: false,
      error: 'Rate limit exceeded',
      retryAfterSeconds: expect.any(Number),
    });
    const lastCall = mocks.sendJson.mock.calls[mocks.sendJson.mock.calls.length - 1];
    expect(lastCall[2].retryAfterSeconds).toBeGreaterThan(0);
  });

  it('deletes only the targeted account binding when accountId is provided', async () => {
    const { handleChannelRoutes } = await import('@electron/api/routes/channels');
    const ctx = {
      gatewayManager: {
        getStatus: () => ({ state: 'running', port: 18789 }),
        rpc: vi.fn(),
        debouncedRestart: vi.fn(),
        debouncedReload: vi.fn(),
      },
    } as never;

    const handled = await handleChannelRoutes(
      createRequest('DELETE'),
      {} as ServerResponse,
      new URL('http://127.0.0.1:3210/api/channels/config/feishu?accountId=agent-a'),
      ctx,
    );

    expect(handled).toBe(true);
    expect(mocks.deleteChannelAccountConfig).toHaveBeenCalledWith('feishu', 'agent-a');
    expect(mocks.clearChannelBinding).toHaveBeenCalledWith('feishu', 'agent-a');
    expect(mocks.deleteChannelConfig).not.toHaveBeenCalled();
    expect(mocks.clearAllBindingsForChannel).not.toHaveBeenCalled();
    expect(mocks.sendJson).toHaveBeenLastCalledWith(expect.anything(), 200, { success: true });
  });

  it('rejects send requests for unknown scoped channel ids', async () => {
    const { handleChannelRoutes } = await import('@electron/api/routes/channels');
    const ctx = {
      gatewayManager: {
        getStatus: () => ({ state: 'running', port: 18789 }),
        rpc: vi.fn(async (method: string) => {
          if (method === 'channels.status') {
            return {
              channels: {
                feishu: { configured: true, running: true },
              },
              channelAccounts: {
                feishu: [
                  {
                    accountId: 'default',
                    configured: true,
                    connected: true,
                  },
                ],
              },
              channelDefaultAccountId: {
                feishu: 'default',
              },
            };
          }
          throw new Error(`Unexpected RPC method: ${method}`);
        }),
        debouncedRestart: vi.fn(),
        debouncedReload: vi.fn(),
      },
    } as never;

    const res = {} as ServerResponse;
    mocks.parseJsonBody.mockResolvedValue({ text: 'hello' });

    const handled = await handleChannelRoutes(
      createRequest('POST'),
      res,
      new URL('http://127.0.0.1:3210/api/channels/feishu-agent-a/send'),
      ctx,
    );

    expect(handled).toBe(true);
    expect(mocks.sendJson).toHaveBeenLastCalledWith(expect.anything(), 404, {
      success: false,
      error: 'Channel not found',
    });
  });
});
