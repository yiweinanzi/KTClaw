import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerChannel,
  getChannel,
  listChannels,
  getEnabledChannels,
  _clearForTesting,
} from '@electron/channels/registry';
import type { ChannelPlugin, InboundContext, OutboundSendParams, OutboundMediaParams, SendResult, GatewayStartContext } from '@electron/channels/types';

// Minimal mock ChannelPlugin factory
function makePlugin(id: string): ChannelPlugin {
  return {
    id,
    meta: { id, label: id, provider: id },
    capabilities: {
      chatTypes: ['direct'],
      media: false,
      reactions: false,
      threads: false,
      edit: false,
      reply: false,
    },
    outbound: {
      deliveryMode: 'direct',
      textChunkLimit: 4000,
      chunkerMode: 'plain',
      chunker: (text: string, limit: number) => [text.slice(0, limit)],
      sendText: async (_p: OutboundSendParams): Promise<SendResult> => ({ channel: id, messageId: 'm1' }),
      sendMedia: async (_p: OutboundMediaParams): Promise<SendResult> => ({ channel: id, messageId: 'm2' }),
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
        provider: id,
        messageSid: '',
        timestamp: 0,
        wasMentioned: false,
        originatingChannel: id,
      }),
      dispatch: async (_ctx: InboundContext) => {},
    },
  };
}

describe('channel registry', () => {
  beforeEach(() => {
    _clearForTesting();
  });

  it('registerChannel + getChannel returns the plugin by ID', () => {
    const plugin = makePlugin('feishu');
    registerChannel(plugin);
    expect(getChannel('feishu')).toBe(plugin);
  });

  it('getChannel returns undefined for nonexistent ID', () => {
    expect(getChannel('nonexistent')).toBeUndefined();
  });

  it('registerChannel twice with same ID overwrites (last wins)', () => {
    const first = makePlugin('feishu');
    const second = makePlugin('feishu');
    registerChannel(first);
    registerChannel(second);
    expect(getChannel('feishu')).toBe(second);
  });

  it('listChannels returns all registered plugins', () => {
    const a = makePlugin('feishu');
    const b = makePlugin('wechat');
    registerChannel(a);
    registerChannel(b);
    const list = listChannels();
    expect(list).toHaveLength(2);
    expect(list).toContain(a);
    expect(list).toContain(b);
  });

  it('listChannels returns empty array when no plugins registered', () => {
    expect(listChannels()).toEqual([]);
  });

  it('getEnabledChannels includes plugin when config marks it enabled', () => {
    const plugin = makePlugin('feishu');
    registerChannel(plugin);
    const result = getEnabledChannels({ feishu: { enabled: true } });
    expect(result).toContain(plugin);
  });

  it('getEnabledChannels excludes plugin when config marks it disabled', () => {
    const plugin = makePlugin('feishu');
    registerChannel(plugin);
    const result = getEnabledChannels({ feishu: { enabled: false } });
    expect(result).not.toContain(plugin);
  });

  it('getEnabledChannels includes plugin when no config entry exists (enabled by default)', () => {
    const plugin = makePlugin('feishu');
    registerChannel(plugin);
    const result = getEnabledChannels({});
    expect(result).toContain(plugin);
  });
});
