import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Sidebar } from '@/components/layout/Sidebar';
import { hostApiFetch } from '@/lib/host-api';
import { invokeIpc } from '@/lib/api-client';

const mockSetSidebarCollapsed = vi.fn();
const mockSwitchSession = vi.fn();
const mockDeleteSession = vi.fn();
const mockLoadSessions = vi.fn(async () => {});
const mockLoadHistory = vi.fn(async () => {});
const mockFetchAgents = vi.fn(async () => {});
const mockFetchChannels = vi.fn(async () => {});
const mockMarkAllRead = vi.fn();
const mockDismiss = vi.fn();

const mockSettingsState = {
  sidebarCollapsed: false,
  setSidebarCollapsed: mockSetSidebarCollapsed,
};

const mockChatState = {
  sessions: [{ key: 'agent:main:session-1', label: 'Alpha Session' }],
  currentSessionKey: 'agent:main:session-1',
  sessionLabels: { 'agent:main:session-1': 'Alpha Session' },
  sessionLastActivity: { 'agent:main:session-1': Date.now() },
  switchSession: mockSwitchSession,
  deleteSession: mockDeleteSession,
  loadSessions: mockLoadSessions,
  loadHistory: mockLoadHistory,
  messages: [],
};

const mockGatewayState = {
  status: {
    state: 'stopped',
    port: 18789,
  },
};

const mockAgentsState = {
  agents: [{ id: 'main', name: 'KaiTianClaw' }],
  fetchAgents: mockFetchAgents,
};

const mockChannelsState = {
  channels: [],
  fetchChannels: mockFetchChannels,
};

const mockNotificationsState = {
  notifications: [],
  unreadCount: 0,
  markAllRead: mockMarkAllRead,
  dismiss: mockDismiss,
};

vi.mock('@/stores/settings', () => ({
  useSettingsStore: (selector: (state: typeof mockSettingsState) => unknown) => selector(mockSettingsState),
}));

vi.mock('@/stores/chat', () => {
  const useChatStore = (selector: (state: typeof mockChatState) => unknown) => selector(mockChatState);
  (useChatStore as typeof useChatStore & { getState: () => typeof mockChatState }).getState = () => mockChatState;
  return { useChatStore };
});

vi.mock('@/stores/gateway', () => ({
  useGatewayStore: (selector: (state: typeof mockGatewayState) => unknown) => selector(mockGatewayState),
}));

vi.mock('@/stores/agents', () => ({
  useAgentsStore: (selector: (state: typeof mockAgentsState) => unknown) => selector(mockAgentsState),
}));

vi.mock('@/stores/channels', () => ({
  useChannelsStore: () => mockChannelsState,
}));

vi.mock('@/stores/notifications', () => ({
  useNotificationsStore: (selector: (state: typeof mockNotificationsState) => unknown) => selector(mockNotificationsState),
}));

vi.mock('@/lib/host-api', () => ({
  hostApiFetch: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({
  invokeIpc: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      if (key === 'common:sidebar.settings') return '设置';
      if (key === 'common:actions.confirm') return '确认';
      if (key === 'common:actions.delete') return '删除';
      if (key === 'common:actions.cancel') return '取消';
      if (key === 'common:sidebar.deleteSessionConfirm') return '确认删除';
      return key;
    },
  }),
}));

describe('workbench sidebar', () => {
  beforeEach(() => {
    mockSettingsState.sidebarCollapsed = false;
    vi.clearAllMocks();
    vi.mocked(hostApiFetch).mockResolvedValue({});
    vi.mocked(invokeIpc).mockResolvedValue({ success: true, result: { messages: [] } });
  });

  it('renders accordion groups with clone sessions and settings footer', () => {
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>,
    );

    expect(screen.getByText('分身')).toBeInTheDocument();
    expect(screen.getByText('团队管理')).toBeInTheDocument();
    expect(screen.getByText('CHANNEL 频道')).toBeInTheDocument();
    expect(screen.getByText('任务')).toBeInTheDocument();
    expect(screen.getByText('Alpha Session')).toBeInTheDocument();
  });

  it('keeps a collapsed icon rail instead of disappearing', () => {
    mockSettingsState.sidebarCollapsed = true;
    const { container } = render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>,
    );

    const aside = container.querySelector('aside');
    expect(aside).toBeInTheDocument();
    expect(aside).toHaveClass('w-16');
  });

  it('exports a session from the context menu through the host save flow', async () => {
    mockChatState.currentSessionKey = 'agent:main:main';
    vi.mocked(invokeIpc).mockResolvedValueOnce({
      success: true,
      result: {
        messages: [
          { role: 'user', content: 'Export me' },
          { role: 'assistant', content: 'Done' },
        ],
      },
    });
    vi.mocked(hostApiFetch).mockResolvedValueOnce({ success: true, savedPath: 'C:/tmp/alpha-session.md' });

    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>,
    );

    fireEvent.contextMenu(screen.getByText('Alpha Session'));
    fireEvent.click(await screen.findByRole('button', { name: /导出 markdown/i }));

    await waitFor(() => {
      expect(invokeIpc).toHaveBeenCalledWith(
        'gateway:rpc',
        'chat.history',
        { sessionKey: 'agent:main:session-1', limit: 200 },
      );
    });
    expect(hostApiFetch).toHaveBeenCalledWith(
      '/api/files/save-image',
      expect.objectContaining({
        method: 'POST',
      }),
    );
  });
});
