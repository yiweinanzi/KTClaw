import type { IncomingMessage, ServerResponse } from 'http';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  sendJson: vi.fn(),
  parseJsonBody: vi.fn(),
  listConfiguredChannels: vi.fn(async () => ['feishu']),
  listConfiguredAgentIds: vi.fn(async () => ['main', 'agent-a']),
  deleteChannelConfig: vi.fn(),
  deleteChannelAccountConfig: vi.fn(),
  clearAllBindingsForChannel: vi.fn(),
  clearChannelBinding: vi.fn(),
  getChannelFormValues: vi.fn(),
  saveChannelConfig: vi.fn(),
  whatsAppStart: vi.fn(),
}));

vi.mock('@electron/api/route-utils', () => ({
  sendJson: mocks.sendJson,
  parseJsonBody: mocks.parseJsonBody,
}));

vi.mock('@electron/utils/channel-config', () => ({
  listConfiguredChannels: mocks.listConfiguredChannels,
  deleteChannelConfig: mocks.deleteChannelConfig,
  deleteChannelAccountConfig: mocks.deleteChannelAccountConfig,
  getChannelFormValues: mocks.getChannelFormValues,
  saveChannelConfig: mocks.saveChannelConfig,
  setChannelEnabled: vi.fn(),
  validateChannelConfig: vi.fn(),
  validateChannelCredentials: vi.fn(),
}));

vi.mock('@electron/utils/agent-config', () => ({
  assignChannelToAgent: vi.fn(),
  clearAllBindingsForChannel: mocks.clearAllBindingsForChannel,
  clearChannelBinding: mocks.clearChannelBinding,
  listConfiguredAgentIds: mocks.listConfiguredAgentIds,
}));

vi.mock('@electron/utils/whatsapp-login', () => ({
  whatsAppLoginManager: {
    start: mocks.whatsAppStart,
    stop: vi.fn(),
  },
}));

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: () => 'C:/test-app',
  },
}));

function createRequest(method: string): IncomingMessage {
  return { method } as IncomingMessage;
}

describe('channel sync workbench routes', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('returns feishu-first synchronized sessions derived from configured accounts', async () => {
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
                    name: '研发中心 DevOps 总群',
                    lastInboundAt: Date.parse('2026-03-26T09:05:00.000Z'),
                  },
                  {
                    accountId: 'agent-a',
                    configured: true,
                    connected: true,
                    name: '李明',
                    lastOutboundAt: Date.parse('2026-03-26T09:04:00.000Z'),
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
      new URL('http://127.0.0.1:3210/api/channels/workbench/sessions?channelType=feishu'),
      ctx,
    );

    expect(handled).toBe(true);
    expect(mocks.sendJson).toHaveBeenLastCalledWith(expect.anything(), 200, {
      success: true,
      sessions: [
        expect.objectContaining({
          id: 'feishu-default',
          sessionType: 'group',
          title: '研发中心 DevOps 总群',
          pinned: true,
          syncState: 'synced',
        }),
        expect.objectContaining({
          id: 'feishu-agent-a',
          sessionType: 'private',
          title: '李明',
          pinned: false,
          syncState: 'synced',
        }),
      ],
    });
  });

  it('returns conversation metadata and an empty visible message list when no synced transcript exists yet', async () => {
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
                    name: '研发中心 DevOps 总群',
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
      new URL('http://127.0.0.1:3210/api/channels/workbench/messages?conversationId=feishu-default'),
      ctx,
    );

    expect(handled).toBe(true);
    expect(mocks.sendJson).toHaveBeenLastCalledWith(expect.anything(), 200, {
      success: true,
      conversation: expect.objectContaining({
        id: 'feishu-default',
        title: '研发中心 DevOps 总群',
        syncState: 'synced',
      }),
      messages: [],
    });
  });
});
