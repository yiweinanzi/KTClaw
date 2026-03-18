import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Sidebar } from '@/components/layout/Sidebar';

const mockSetSidebarCollapsed = vi.fn();
const mockSwitchSession = vi.fn();
const mockDeleteSession = vi.fn();
const mockLoadSessions = vi.fn(async () => {});
const mockLoadHistory = vi.fn(async () => {});
const mockFetchAgents = vi.fn(async () => {});

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
  });

  it('renders accordion groups with clone sessions and settings footer', () => {
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>,
    );

    expect(screen.getByRole('button', { name: /分身.*会话列表/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /团队.*组织框架/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /IM 频道.*外部入口/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /定时任务.*计划执行/ })).toBeInTheDocument();
    expect(screen.getByText('Alpha Session')).toBeInTheDocument();
    expect(screen.getByText('设置')).toBeInTheDocument();
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
});
