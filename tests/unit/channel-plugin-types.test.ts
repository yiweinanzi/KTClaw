import { describe, it, expect } from 'vitest';
import {
  BaseChannelConfigSchema,
  type InboundContext,
  type OutboundAdapter,
  type ChannelPlugin,
  type GatewayStartContext,
  type SendResult,
  type OutboundSendParams,
  type OutboundMediaParams,
} from '../../electron/channels/types';

describe('InboundContext type contract', () => {
  it('satisfies interface with all 13 fields', () => {
    const ctx = {
      body: 'hello',
      rawBody: 'hello',
      from: 'feishu:group:abc',
      to: 'chat:123',
      sessionKey: 'sk-1',
      accountId: 'acc-1',
      chatType: 'direct' as const,
      senderId: 'user-1',
      provider: 'feishu',
      messageSid: 'msg-1',
      timestamp: Date.now(),
      wasMentioned: false,
      originatingChannel: 'feishu-plugin',
    } satisfies InboundContext;

    expect(ctx.body).toBe('hello');
    expect(ctx.chatType).toBe('direct');
    expect(ctx.wasMentioned).toBe(false);
  });
});

describe('OutboundAdapter type contract', () => {
  it('satisfies interface with all 6 fields', () => {
    const adapter = {
      deliveryMode: 'direct' as const,
      textChunkLimit: 4000,
      chunkerMode: 'markdown' as const,
      chunker: (text: string, limit: number) => [text.slice(0, limit)],
      sendText: async (_params: OutboundSendParams): Promise<SendResult> => ({
        channel: 'feishu',
        messageId: 'msg-1',
      }),
      sendMedia: async (_params: OutboundMediaParams): Promise<SendResult> => ({
        channel: 'feishu',
        messageId: 'msg-2',
      }),
    } satisfies OutboundAdapter;

    expect(adapter.deliveryMode).toBe('direct');
    expect(adapter.textChunkLimit).toBe(4000);
    expect(adapter.chunkerMode).toBe('markdown');
  });
});

describe('ChannelPlugin type contract', () => {
  it('satisfies interface with id/meta/capabilities/outbound/gateway/inbound', () => {
    const plugin = {
      id: 'feishu',
      meta: {
        id: 'feishu',
        label: 'Feishu',
        provider: 'feishu',
      },
      capabilities: {
        chatTypes: ['direct', 'group'] as const,
        media: true,
        reactions: false,
        threads: false,
        edit: false,
        reply: true,
      },
      outbound: {
        deliveryMode: 'direct' as const,
        textChunkLimit: 4000,
        chunkerMode: 'markdown' as const,
        chunker: (text: string, limit: number) => [text.slice(0, limit)],
        sendText: async (_p: OutboundSendParams): Promise<SendResult> => ({ channel: 'feishu', messageId: 'm1' }),
        sendMedia: async (_p: OutboundMediaParams): Promise<SendResult> => ({ channel: 'feishu', messageId: 'm2' }),
      },
      gateway: {
        startAccount: async (_ctx: GatewayStartContext) => {},
        stopAccount: async (_ctx: { accountId: string }) => {},
        getStatus: () => ({ connected: true }),
      },
      inbound: {
        parseEvent: (_raw: unknown): InboundContext | null => null,
        buildContext: (_parsed: unknown): InboundContext => ({
          body: '',
          rawBody: '',
          from: '',
          to: '',
          sessionKey: '',
          accountId: '',
          chatType: 'direct',
          senderId: '',
          provider: '',
          messageSid: '',
          timestamp: 0,
          wasMentioned: false,
          originatingChannel: '',
        }),
        dispatch: async (_ctx: InboundContext) => {},
      },
    } satisfies ChannelPlugin;

    expect(plugin.id).toBe('feishu');
    expect(plugin.capabilities.media).toBe(true);
  });
});

describe('BaseChannelConfigSchema', () => {
  it('safeParse with empty object returns defaults', () => {
    const result = BaseChannelConfigSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.enabled).toBe(true);
      expect(result.data.accountId).toBe('default');
      expect(result.data.dmPolicy).toBe('open');
      expect(result.data.groupPolicy).toBe('open');
      expect(result.data.requireMention).toBe(true);
    }
  });

  it('safeParse with explicit values preserves them', () => {
    const result = BaseChannelConfigSchema.safeParse({
      enabled: false,
      accountId: 'my-account',
      dmPolicy: 'allowlist',
      groupPolicy: 'disabled',
      requireMention: false,
      allowFrom: ['user1', 'user2'],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.enabled).toBe(false);
      expect(result.data.accountId).toBe('my-account');
      expect(result.data.dmPolicy).toBe('allowlist');
      expect(result.data.groupPolicy).toBe('disabled');
      expect(result.data.requireMention).toBe(false);
      expect(result.data.allowFrom).toEqual(['user1', 'user2']);
    }
  });

  it('GatewayStartContext includes optional abortSignal and accountId', () => {
    const ctx: GatewayStartContext = {
      accountId: 'acc-1',
      abortSignal: new AbortController().signal,
    };
    expect(ctx.accountId).toBe('acc-1');
    expect(ctx.abortSignal).toBeDefined();
  });

  it('SendResult has channel and messageId fields', () => {
    const result: SendResult = {
      channel: 'feishu',
      messageId: 'msg-123',
    };
    expect(result.channel).toBe('feishu');
    expect(result.messageId).toBe('msg-123');
  });
});
