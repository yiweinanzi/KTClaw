import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Chat } from '@/pages/Chat';
import { useSettingsStore } from '@/stores/settings';

const {
  hostApiFetchMock,
  toastInfoMock,
  toastSuccessMock,
  toastErrorMock,
} = vi.hoisted(() => ({
  hostApiFetchMock: vi.fn(),
  toastInfoMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
}));

const chatState = {
  messages: [] as Array<Record<string, unknown>>,
  currentSessionKey: 'agent:main:main',
  loading: false,
  sending: false,
  error: null as string | null,
  showThinking: false,
  streamingMessage: null as unknown,
  streamingTools: [] as Array<unknown>,
  pendingFinal: false,
  currentAgentId: 'main',
  sendMessage: vi.fn(),
  abortRun: vi.fn(),
  clearError: vi.fn(),
  cleanupEmptySession: vi.fn(),
  switchSession: vi.fn(),
};

const gatewayState = {
  status: {
    state: 'running',
    port: 18789,
  },
};

const agentsState = {
  agents: [
    {
      id: 'main',
      name: 'KaiTianClaw',
      isDefault: true,
      modelDisplay: 'GLM-5-Turbo',
      inheritedModel: false,
      workspace: '~/.openclaw/workspace',
      agentDir: '~/.openclaw/agents/main/agent',
      mainSessionKey: 'agent:main:main',
      channelTypes: [],
    },
  ],
  fetchAgents: vi.fn(),
};

vi.mock('@/stores/chat', () => ({
  useChatStore: (selector: (state: typeof chatState) => unknown) => selector(chatState),
}));

vi.mock('@/stores/gateway', () => ({
  useGatewayStore: (selector: (state: typeof gatewayState) => unknown) => selector(gatewayState),
}));

vi.mock('@/stores/agents', () => ({
  useAgentsStore: (selector: (state: typeof agentsState) => unknown) => selector(agentsState),
}));

vi.mock('@/lib/host-api', () => ({
  hostApiFetch: hostApiFetchMock,
}));

vi.mock('sonner', () => ({
  toast: {
    info: toastInfoMock,
    success: toastSuccessMock,
    error: toastErrorMock,
  },
}));

vi.mock('@/hooks/use-stick-to-bottom-instant', () => ({
  useStickToBottomInstant: () => ({
    contentRef: { current: null },
    scrollRef: { current: null },
  }),
}));

vi.mock('@/hooks/use-min-loading', () => ({
  useMinLoading: () => false,
}));

vi.mock('@/pages/Chat/ChatInput', () => ({
  ChatInput: () => <div data-testid="chat-input">composer</div>,
}));

function translate(key: string, vars?: Record<string, unknown>): string {
  const map: Record<string, string> = {
    'common:workbench.files': '文件',
    'common:workbench.agent': 'Agent',
    'chat:workbench.quickConfig': '快速配置',
    'workbench.quickConfig': '快速配置',
    'chat:workbench.hero.subtitle': '描述你的目标，主分身会协同分身执行并实时反馈',
    'workbench.hero.subtitle': '描述你的目标，主分身会协同分身执行并实时反馈',
    'chat:workbench.quickConfigDescription': '设置当前分身的名称、角色、常用通道、默认技能与常用工具，让它立刻进入可工作状态。',
    'workbench.quickConfigDescription': '设置当前分身的名称、角色、常用通道、默认技能与常用工具，让它立刻进入可工作状态。',
  };

  if (key === 'chat:toolbar.currentAgent') {
    return `当前工作台：${String(vars?.agent ?? '')}`;
  }

  return map[key] ?? key;
}

vi.mock('react-i18next', () => ({
  initReactI18next: {
    type: '3rdParty',
    init: () => {},
  },
  useTranslation: () => ({
    t: translate,
  }),
}));

describe('Chat workbench shell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chatState.messages = [];
    chatState.loading = false;
    chatState.sending = false;
    chatState.error = null;
    chatState.showThinking = false;
    gatewayState.status = { state: 'running', port: 18789 };
    hostApiFetchMock.mockReset();
    toastInfoMock.mockReset();
    toastSuccessMock.mockReset();
    toastErrorMock.mockReset();
    useSettingsStore.setState({ rightPanelMode: null });
  });

  it('renders workbench quick actions, premium onboarding cards, and the agent inspector shell', () => {
    render(<Chat />);

    expect(screen.getByRole('button', { name: /文件/ })).toBeInTheDocument();
    const agentButton = screen.getByRole('button', { name: /Agent/ });
    expect(agentButton).toBeInTheDocument();
    expect(screen.getAllByText('KaiTianClaw').length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: '有什么我可以帮你的？' })).toBeInTheDocument();
    expect(screen.getByText('代码重构方案')).toBeInTheDocument();
    expect(screen.getByText('检查系统健康度')).toBeInTheDocument();
    fireEvent.click(agentButton);
    expect(useSettingsStore.getState().rightPanelMode).toBe('agent');
    expect(screen.getByTestId('chat-input')).toBeInTheDocument();
  });

  it('shows a visible export action in the chat header tool area', () => {
    render(<Chat />);
    expect(screen.getByRole('button', { name: /export/i })).toBeInTheDocument();
  });

  it('shows empty-session feedback instead of opening save flow', () => {
    chatState.messages = [];

    render(<Chat />);
    fireEvent.click(screen.getByRole('button', { name: /export/i }));

    expect(hostApiFetchMock).not.toHaveBeenCalled();
    expect(toastInfoMock).toHaveBeenCalledTimes(1);
  });

  it('exports current session through the host markdown save flow', async () => {
    chatState.messages = [
      { role: 'user', content: 'Export this chat' },
      { role: 'assistant', content: 'Ready' },
    ];
    hostApiFetchMock.mockResolvedValueOnce({ success: true, savedPath: 'C:/tmp/session.md' });

    render(<Chat />);
    fireEvent.click(screen.getByRole('button', { name: /export/i }));

    await waitFor(() => {
      expect(hostApiFetchMock).toHaveBeenCalledWith(
        '/api/files/save-image',
        expect.objectContaining({ method: 'POST' }),
      );
    });
    const body = JSON.parse((hostApiFetchMock.mock.calls[0]?.[1] as { body?: string })?.body ?? '{}');
    expect(body.defaultFileName).toMatch(/\.md$/);
    expect(body.base64).toBeTypeOf('string');
    expect(body.base64.length).toBeGreaterThan(0);
    expect(toastSuccessMock).toHaveBeenCalledTimes(1);
  });

  it('shows canceled feedback when save dialog is canceled', async () => {
    chatState.messages = [
      { role: 'user', content: 'Export this chat' },
      { role: 'assistant', content: 'Ready' },
    ];
    hostApiFetchMock.mockResolvedValueOnce({ error: 'canceled by user' });

    render(<Chat />);
    fireEvent.click(screen.getByRole('button', { name: /export/i }));

    await waitFor(() => {
      expect(toastInfoMock).toHaveBeenCalledTimes(1);
    });
    expect(toastSuccessMock).not.toHaveBeenCalled();
  });

  it('shows error feedback when export save flow fails', async () => {
    chatState.messages = [
      { role: 'user', content: 'Export this chat' },
      { role: 'assistant', content: 'Ready' },
    ];
    hostApiFetchMock.mockRejectedValueOnce(new Error('disk full'));

    render(<Chat />);
    fireEvent.click(screen.getByRole('button', { name: /export/i }));

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledTimes(1);
    });
  });
});
