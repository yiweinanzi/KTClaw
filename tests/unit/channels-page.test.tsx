import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Channels } from '@/pages/Channels';

const {
  hostApiFetchMock,
  channelsStoreState,
  settingsState,
} = vi.hoisted(() => ({
  hostApiFetchMock: vi.fn(),
  channelsStoreState: {
    channels: [] as Array<{
      id: string;
      type: 'feishu' | 'dingtalk' | 'wecom' | 'qqbot' | 'telegram';
      name: string;
      status: 'connected' | 'connecting' | 'error' | 'disconnected';
      error?: string;
      accountId?: string;
      lastActivity?: string;
    }>,
    loading: false,
    error: null as string | null,
    fetchChannels: vi.fn(async () => undefined),
    connectChannel: vi.fn(async () => undefined),
    disconnectChannel: vi.fn(async () => undefined),
    deleteChannel: vi.fn(async () => undefined),
    addChannel: vi.fn(async () => ({
      id: 'new',
      type: 'feishu',
      name: 'new',
      status: 'disconnected',
    })),
  },
  settingsState: {
    defaultModel: 'GLM-5',
  },
}));

vi.mock('@/lib/host-api', () => ({
  hostApiFetch: hostApiFetchMock,
}));

vi.mock('@/stores/channels', () => ({
  useChannelsStore: () => channelsStoreState,
}));

vi.mock('@/stores/settings', () => ({
  useSettingsStore: (selector: (state: typeof settingsState) => unknown) => selector(settingsState),
}));

function buildWorkbenchFixtures() {
  return {
    capabilities: {
      success: true,
      capabilities: [
        {
          channelId: 'feishu-default',
          channelType: 'feishu',
          accountId: 'default',
          status: 'connected',
          availableActions: ['disconnect', 'test', 'send', 'configure'],
          capabilityFlags: {
            supportsConnect: true,
            supportsDisconnect: true,
            supportsTest: true,
            supportsSend: true,
            supportsSchemaSummary: true,
            supportsCredentialValidation: false,
          },
          configSchemaSummary: {
            totalFieldCount: 2,
            requiredFieldCount: 2,
            optionalFieldCount: 0,
            sensitiveFieldCount: 1,
            fieldKeys: ['appId', 'appSecret'],
          },
        },
      ],
    },
    sessions: {
      success: true,
      sessions: [
        {
          id: 'feishu-conv-devops',
          channelId: 'feishu-default',
          channelType: 'feishu',
          sessionType: 'group',
          title: '研发中心 DevOps 总群',
          pinned: true,
          syncState: 'synced',
          latestActivityAt: '2026-03-26T09:05:00.000Z',
          previewText: '@KTClaw 帮我把慢 SQL 记录拉出来',
          participantSummary: '4 Agent / 12 人类',
          visibleAgentId: 'main',
        },
        {
          id: 'feishu-conv-bot-ops',
          channelId: 'feishu-default',
          channelType: 'feishu',
          sessionType: 'private',
          title: '李明',
          pinned: false,
          syncState: 'synced',
          latestActivityAt: '2026-03-26T09:04:00.000Z',
          previewText: '@Main 给我一份构建摘要',
          participantSummary: '机器人私聊',
          visibleAgentId: 'main',
        },
        {
          id: 'feishu-conv-data',
          channelId: 'feishu-default',
          channelType: 'feishu',
          sessionType: 'group',
          title: '数据分析项目组',
          pinned: false,
          syncState: 'synced',
          latestActivityAt: '2026-03-26T08:00:00.000Z',
          previewText: '今天的日报数据需要重算',
          participantSummary: 'KTClaw, DataAnalyst',
          visibleAgentId: 'data-analyst',
        },
      ],
    },
    messages: {
      success: true,
      conversation: {
        id: 'feishu-conv-devops',
        title: '研发中心 DevOps 总群',
        syncState: 'synced',
        participantSummary: '4 Agent / 12 人类',
        visibleAgentId: 'main',
      },
      messages: [
        {
          id: 'msg-human-1',
          role: 'human',
          authorName: '李明（人类）',
          createdAt: '2026-03-26T09:01:00.000Z',
          content: '@KTClaw 帮我查一下昨晚的构建日志，好像有个服务 OOM 了。',
        },
        {
          id: 'msg-agent-ack',
          role: 'agent',
          authorName: 'KTClaw',
          createdAt: '2026-03-26T09:02:00.000Z',
          content: '收到，正在处理。',
        },
        {
          id: 'msg-tool-1',
          role: 'tool',
          toolName: 'query_k8s_logs',
          durationMs: 3200,
          summary: '已查询昨晚 20:00-08:00 的 Kubernetes 集群日志。',
        },
        {
          id: 'msg-agent-2',
          role: 'agent',
          authorName: 'KTClaw',
          createdAt: '2026-03-26T09:02:30.000Z',
          content: '查到了。payment-service-v2 在 23:45 发生了 OOMKilled。',
        },
        {
          id: 'msg-system-hidden',
          role: 'system',
          internal: true,
          content: 'gateway sync heartbeat delivered',
        },
      ],
    },
  };
}

describe('Channels sync workbench', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    channelsStoreState.channels = [
      {
        id: 'feishu-default',
        type: 'feishu',
        name: 'feishu',
        status: 'connected',
        accountId: 'default',
      },
      {
        id: 'telegram-default',
        type: 'telegram',
        name: 'Ops Telegram',
        status: 'connected',
        accountId: 'default',
      },
    ] as typeof channelsStoreState.channels;
    channelsStoreState.loading = false;
    channelsStoreState.error = null;
    settingsState.defaultModel = 'GLM-5';

    const fixtures = buildWorkbenchFixtures();
    hostApiFetchMock.mockImplementation(async (path: string) => {
      if (path === '/api/channels/capabilities') return fixtures.capabilities;
      if (path === '/api/channels/workbench/sessions?channelType=feishu') return fixtures.sessions;
      if (path === '/api/channels/workbench/messages?conversationId=feishu-conv-devops') return fixtures.messages;
      if (path.includes('/send')) return { success: true };
      return { success: true };
    });
  });

  it('renders the chat-first workbench shell for feishu instead of the old detail panel', async () => {
    render(<Channels />);

    expect(await screen.findByText('飞书配置详情')).toBeInTheDocument();
    expect((await screen.findAllByText('研发中心 DevOps 总群')).length).toBeGreaterThan(1);
    expect(await screen.findByText('李明（人类）')).toBeInTheDocument();
    expect((await screen.findAllByText('KTClaw')).length).toBeGreaterThan(0);
    expect(screen.getByText('query_k8s_logs')).toBeInTheDocument();
    expect(screen.queryByText('配置信息')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '设置' })).toBeInTheDocument();
  });

  it('no longer renders a duplicate channel family rail inside the page body', async () => {
    render(<Channels />);
    await screen.findByText('飞书配置详情');

    expect(screen.queryByText('飞书接入')).not.toBeInTheDocument();
    expect(screen.queryByText('钉钉接入')).not.toBeInTheDocument();
    expect(screen.queryByText('企微接入')).not.toBeInTheDocument();
    expect(screen.queryByText('QQ接入')).not.toBeInTheDocument();
    expect(screen.queryByText('CHANNEL 频道')).not.toBeInTheDocument();
  });

  it('renders mixed group and private sessions in one list with pinned-first ordering', async () => {
    render(<Channels />);

    const list = await screen.findByTestId('channels-conversation-list');
    const items = within(list).getAllByRole('button');

    expect(items[0]).toHaveTextContent('研发中心 DevOps 总群');
    expect(items[0]).toHaveTextContent('群聊');
    expect(items[1]).toHaveTextContent('李明');
    expect(items[1]).toHaveTextContent('私聊');
    expect(items[2]).toHaveTextContent('数据分析项目组');
  });

  it('hides internal sync noise while keeping compact tool cards in the message stream', async () => {
    render(<Channels />);

    expect(await screen.findByText('query_k8s_logs')).toBeInTheDocument();
    expect(screen.getByText('已查询昨晚 20:00-08:00 的 Kubernetes 集群日志。')).toBeInTheDocument();
    expect(screen.queryByText('gateway sync heartbeat delivered')).not.toBeInTheDocument();
  });

  it('keeps composer draft when send fails', async () => {
    hostApiFetchMock.mockImplementation(async (path: string) => {
      const fixtures = buildWorkbenchFixtures();
      if (path === '/api/channels/capabilities') return fixtures.capabilities;
      if (path === '/api/channels/workbench/sessions?channelType=feishu') return fixtures.sessions;
      if (path === '/api/channels/workbench/messages?conversationId=feishu-conv-devops') return fixtures.messages;
      if (path.includes('/send')) throw new Error('send failed');
      return { success: true };
    });

    render(<Channels />);
    const input = await screen.findByPlaceholderText('在群聊发送消息（将同步至飞书）...');
    fireEvent.change(input, { target: { value: 'hello from channel' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(hostApiFetchMock).toHaveBeenCalledWith(
        '/api/channels/feishu-default/send',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ text: 'hello from channel', conversationId: 'feishu-conv-devops' }),
        }),
      );
    });

    expect(input).toHaveValue('hello from channel');
  });

  it('opens channel controls in a settings drawer without replacing the chat pane', async () => {
    render(<Channels />);

    fireEvent.click(await screen.findByRole('button', { name: '设置' }));

    expect(await screen.findByRole('dialog', { name: '频道设置' })).toBeInTheDocument();
    expect(screen.getByText('发送测试')).toBeInTheDocument();
    expect(screen.getByText('断开连接')).toBeInTheDocument();
    expect(screen.getByText('App ID')).toBeInTheDocument();
    expect(screen.getByText('query_k8s_logs')).toBeInTheDocument();
  });
});
