import type { IncomingMessage, ServerResponse } from 'http';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  sendJson: vi.fn(),
  parseJsonBody: vi.fn(),
  listConfiguredChannels: vi.fn(async () => ['feishu']),
  listConfiguredAgentIds: vi.fn(async () => ['main', 'agent-a']),
  listAgentsSnapshot: vi.fn(async () => ({
    agents: [
      { id: 'main', mainSessionKey: 'agent:main:main' },
      { id: 'agent-a', mainSessionKey: 'agent:agent-a:desk' },
    ],
    defaultAgentId: 'main',
    configuredChannelTypes: ['feishu'],
    channelOwners: { feishu: 'main' },
  })),
  deleteChannelConfig: vi.fn(),
  deleteChannelAccountConfig: vi.fn(),
  clearAllBindingsForChannel: vi.fn(),
  clearChannelBinding: vi.fn(),
  getChannelFormValues: vi.fn(),
  saveChannelConfig: vi.fn(),
  whatsAppStart: vi.fn(),
  bindingGet: vi.fn(),
  bindingUpsert: vi.fn(),
}));

const TEST_FEISHU_SNAPSHOT_KEY = '__clawxTestFeishuWorkbenchSnapshot';

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
  listAgentsSnapshot: mocks.listAgentsSnapshot,
}));

vi.mock('@electron/utils/whatsapp-login', () => ({
  whatsAppLoginManager: {
    start: mocks.whatsAppStart,
    stop: vi.fn(),
  },
}));

vi.mock('@electron/services/channel-conversation-bindings', () => ({
  createChannelConversationBindingStore: vi.fn(() => ({
    get: mocks.bindingGet,
    upsert: mocks.bindingUpsert,
    deleteByChannel: vi.fn(),
  })),
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
    delete (globalThis as Record<string, unknown>)[TEST_FEISHU_SNAPSHOT_KEY];
    mocks.bindingGet.mockResolvedValue(null);
    mocks.bindingUpsert.mockImplementation(async (record: Record<string, unknown>) => ({
      ...record,
      updatedAt: Date.now(),
    }));
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
                    name: 'R&D DevOps Group',
                    lastInboundAt: Date.parse('2026-03-26T09:05:00.000Z'),
                  },
                  {
                    accountId: 'agent-a',
                    configured: true,
                    connected: true,
                    name: 'Alice',
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
          title: 'R&D DevOps Group',
          pinned: true,
          syncState: 'synced',
        }),
        expect.objectContaining({
          id: 'feishu-agent-a',
          sessionType: 'private',
          title: 'Alice',
          pinned: false,
          syncState: 'synced',
        }),
      ],
    });
  });

  it('returns runtime-backed messages for a bound feishu conversation', async () => {
    const { handleChannelRoutes } = await import('@electron/api/routes/channels');
    mocks.bindingGet.mockResolvedValue({
      channelType: 'feishu',
      accountId: 'default',
      externalConversationId: 'oc_123',
      agentId: 'main',
      sessionKey: 'agent:main:main',
      updatedAt: Date.now(),
    });

    const gatewayRpc = vi.fn(async (method: string) => {
      if (method === 'chat.history') {
        return {
          messages: [
            {
              id: 'msg-user-1',
              role: 'user',
              content: 'Feishu user: test message',
              timestamp: Date.parse('2026-03-26T09:05:00.000Z'),
            },
            {
              id: 'msg-assistant-1',
              role: 'assistant',
              content: 'KTClaw: received, handling now',
              timestamp: Date.parse('2026-03-26T09:05:03.000Z'),
            },
          ],
        };
      }
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
                name: 'R&D DevOps Group',
              },
            ],
          },
          channelDefaultAccountId: {
            feishu: 'default',
          },
        };
      }
      throw new Error(`Unexpected RPC method: ${method}`);
    });

    const ctx = {
      gatewayManager: {
        getStatus: () => ({ state: 'running', port: 18789 }),
        rpc: gatewayRpc,
        debouncedRestart: vi.fn(),
        debouncedReload: vi.fn(),
      },
    } as never;

    const handled = await handleChannelRoutes(
      createRequest('GET'),
      {} as ServerResponse,
      new URL('http://127.0.0.1:3210/api/channels/workbench/messages?conversationId=feishu:default:oc_123'),
      ctx,
    );

    expect(handled).toBe(true);
    expect(gatewayRpc).toHaveBeenCalledWith('chat.history', {
      sessionKey: 'agent:main:main',
      limit: 200,
    });
    expect(mocks.sendJson).toHaveBeenLastCalledWith(expect.anything(), 200, {
      success: true,
      conversation: expect.objectContaining({
        id: 'feishu:default:oc_123',
        visibleAgentId: 'main',
      }),
      messages: [
        expect.objectContaining({
          id: 'msg-user-1',
          role: 'human',
          content: 'Feishu user: test message',
        }),
        expect.objectContaining({
          id: 'msg-assistant-1',
          role: 'agent',
          content: 'KTClaw: received, handling now',
        }),
      ],
    });
  });

  it('keeps unbound conversations readable through fallback metadata', async () => {
    const { handleChannelRoutes } = await import('@electron/api/routes/channels');
    (globalThis as Record<string, unknown>)[TEST_FEISHU_SNAPSHOT_KEY] = {
      sessions: [
        {
          id: 'feishu:default:oc_unbound',
          channelId: 'feishu-default',
          channelType: 'feishu',
          sessionType: 'group',
          title: 'Discovered Group',
          pinned: true,
          syncState: 'synced',
          participantSummary: 'synced group chat',
          visibleAgentId: 'main',
        },
      ],
      messagesByConversationId: new Map([
        ['feishu:default:oc_unbound', [
          { id: 'snapshot-message-1', role: 'human', content: 'snapshot fallback message' },
        ]],
      ]),
    };
    const gatewayRpc = vi.fn(async (method: string) => {
      if (method === 'chat.history') {
        throw new Error('runtime unavailable');
      }
      throw new Error(`Unexpected RPC method: ${method}`);
    });
    const ctx = {
      gatewayManager: {
        getStatus: () => ({ state: 'running', port: 18789 }),
        rpc: gatewayRpc,
        debouncedRestart: vi.fn(),
        debouncedReload: vi.fn(),
      },
    } as never;

    const handled = await handleChannelRoutes(
      createRequest('GET'),
      {} as ServerResponse,
      new URL('http://127.0.0.1:3210/api/channels/workbench/messages?conversationId=feishu:default:oc_unbound'),
      ctx,
    );

    expect(handled).toBe(true);
    expect(mocks.bindingUpsert).toHaveBeenCalledWith(expect.objectContaining({
      channelType: 'feishu',
      accountId: 'default',
      externalConversationId: 'oc_unbound',
      agentId: 'main',
      sessionKey: 'agent:main:main',
    }));
    expect(gatewayRpc).toHaveBeenCalledWith('chat.history', {
      sessionKey: 'agent:main:main',
      limit: 200,
    });
    expect(mocks.sendJson).toHaveBeenLastCalledWith(expect.anything(), 200, {
      success: true,
      conversation: expect.objectContaining({
        id: 'feishu:default:oc_unbound',
        title: 'Discovered Group',
        syncState: 'synced',
      }),
      messages: [
        expect.objectContaining({
          id: 'snapshot-message-1',
          role: 'human',
          content: 'snapshot fallback message',
        }),
      ],
    });
  });

  it('uses feishu channel ownership to derive default session key when creating a new binding', async () => {
    const { handleChannelRoutes } = await import('@electron/api/routes/channels');
    (globalThis as Record<string, unknown>)[TEST_FEISHU_SNAPSHOT_KEY] = {
      sessions: [
        {
          id: 'feishu:default:oc_create',
          channelId: 'feishu-default',
          channelType: 'feishu',
          sessionType: 'group',
          title: 'Discovered For Binding',
          pinned: true,
          syncState: 'synced',
          participantSummary: 'synced group chat',
          visibleAgentId: 'main',
        },
      ],
      messagesByConversationId: new Map(),
    };
    mocks.listAgentsSnapshot.mockResolvedValue({
      agents: [
        { id: 'main', mainSessionKey: 'agent:main:main' },
        { id: 'agent-a', mainSessionKey: 'agent:agent-a:desk-main' },
      ],
      defaultAgentId: 'main',
      configuredChannelTypes: ['feishu'],
      channelOwners: { feishu: 'agent-a' },
    });

    const gatewayRpc = vi.fn(async (method: string) => {
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
                name: 'R&D DevOps Group',
              },
            ],
          },
          channelDefaultAccountId: {
            feishu: 'default',
          },
        };
      }
      if (method === 'chat.history') {
        return {
          messages: [
            { id: 'msg-assistant-2', role: 'assistant', content: 'owner-routed message' },
          ],
        };
      }
      throw new Error(`Unexpected RPC method: ${method}`);
    });

    const ctx = {
      gatewayManager: {
        getStatus: () => ({ state: 'running', port: 18789 }),
        rpc: gatewayRpc,
        debouncedRestart: vi.fn(),
        debouncedReload: vi.fn(),
      },
    } as never;

    const handled = await handleChannelRoutes(
      createRequest('GET'),
      {} as ServerResponse,
      new URL('http://127.0.0.1:3210/api/channels/workbench/messages?conversationId=feishu:default:oc_create'),
      ctx,
    );

    expect(handled).toBe(true);
    expect(mocks.bindingUpsert).toHaveBeenCalledWith(expect.objectContaining({
      channelType: 'feishu',
      accountId: 'default',
      externalConversationId: 'oc_create',
      agentId: 'agent-a',
      sessionKey: 'agent:agent-a:desk-main',
    }));
    expect(gatewayRpc).toHaveBeenCalledWith('chat.history', {
      sessionKey: 'agent:agent-a:desk-main',
      limit: 200,
    });
    expect(mocks.sendJson).toHaveBeenLastCalledWith(expect.anything(), 200, {
      success: true,
      conversation: expect.objectContaining({
        id: 'feishu:default:oc_create',
        visibleAgentId: 'agent-a',
      }),
      messages: [
        expect.objectContaining({
          id: 'msg-assistant-2',
          role: 'agent',
          content: 'owner-routed message',
        }),
      ],
    });
  });

  it('returns neutral payload for synthetic unknown feishu ids without binding/runtime calls', async () => {
    const { handleChannelRoutes } = await import('@electron/api/routes/channels');
    const gatewayRpc = vi.fn(async (method: string) => {
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
                name: 'R&D DevOps Group',
              },
            ],
          },
          channelDefaultAccountId: {
            feishu: 'default',
          },
        };
      }
      throw new Error(`Unexpected RPC method: ${method}`);
    });
    const ctx = {
      gatewayManager: {
        getStatus: () => ({ state: 'running', port: 18789 }),
        rpc: gatewayRpc,
        debouncedRestart: vi.fn(),
        debouncedReload: vi.fn(),
      },
    } as never;

    const handled = await handleChannelRoutes(
      createRequest('GET'),
      {} as ServerResponse,
      new URL('http://127.0.0.1:3210/api/channels/workbench/messages?conversationId=feishu:default:ghost-default'),
      ctx,
    );

    expect(handled).toBe(true);
    expect(mocks.bindingUpsert).not.toHaveBeenCalled();
    expect(gatewayRpc).not.toHaveBeenCalledWith('chat.history', expect.anything());
    expect(mocks.sendJson).toHaveBeenLastCalledWith(expect.anything(), 200, {
      success: true,
      conversation: null,
      messages: [],
    });
  });

  it('routes bound feishu conversation sends through runtime chat.send', async () => {
    const { handleChannelRoutes } = await import('@electron/api/routes/channels');
    mocks.bindingGet.mockResolvedValue({
      channelType: 'feishu',
      accountId: 'default',
      externalConversationId: 'oc_bound_send',
      agentId: 'main',
      sessionKey: 'agent:main:main',
      updatedAt: Date.now(),
    });
    mocks.parseJsonBody.mockResolvedValue({
      text: '你好',
      conversationId: 'feishu:default:oc_bound_send',
    });

    const gatewayRpc = vi.fn(async (method: string) => {
      if (method === 'chat.send') {
        return {
          runId: 'run-feishu-send-1',
        };
      }
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
                name: 'R&D DevOps Group',
              },
            ],
          },
          channelDefaultAccountId: {
            feishu: 'default',
          },
        };
      }
      throw new Error(`Unexpected RPC method: ${method}`);
    });

    const ctx = {
      gatewayManager: {
        getStatus: () => ({ state: 'running', port: 18789 }),
        rpc: gatewayRpc,
        debouncedRestart: vi.fn(),
        debouncedReload: vi.fn(),
      },
    } as never;

    const handled = await handleChannelRoutes(
      createRequest('POST'),
      {} as ServerResponse,
      new URL('http://127.0.0.1:3210/api/channels/feishu-default/send'),
      ctx,
    );

    expect(handled).toBe(true);
    expect(gatewayRpc).toHaveBeenCalledWith('chat.send', expect.objectContaining({
      sessionKey: 'agent:main:main',
      message: '你好',
      deliver: false,
    }));
    expect(mocks.sendJson).toHaveBeenLastCalledWith(expect.anything(), 200, expect.objectContaining({
      success: true,
    }));
  });
});
