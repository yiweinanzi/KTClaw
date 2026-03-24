/**
 * Workbench Sidebar Density Test
 * Verifies that the sidebar aligns with Frame 1/2 approved density and styling
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Sidebar } from '@/components/layout/Sidebar';

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
  sessions: [{ key: 'agent:main:session-1', label: 'KTClaw' }],
  currentSessionKey: 'agent:main:session-1',
  sessionLabels: { 'agent:main:session-1': 'KTClaw' },
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
  agents: [{ id: 'main', name: 'KTClaw' }],
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

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe('Workbench Sidebar Density', () => {
  beforeEach(() => {
    mockSettingsState.sidebarCollapsed = false;
    vi.clearAllMocks();
  });

  it('renders sidebar with approved width when expanded', () => {
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>
    );

    const sidebar = screen.getByRole('complementary');
    // Design board uses 260px
    expect(sidebar).toHaveClass('w-[260px]');
  });

  it('renders header buttons without heavy borders', () => {
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>
    );

    // Header buttons should be simpler, not heavily bordered cards
    const toggleButton = screen.getByRole('button', { name: /toggle sidebar/i });
    expect(toggleButton).not.toHaveClass('border');
  });

  it('renders session items as flat list items, not large cards', () => {
    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>
    );

    // Session items should be flatter, not rounded-[24px] cards
    const sessionButtons = screen.queryAllByRole('button');
    const sessionButton = sessionButtons.find(btn =>
      btn.textContent?.includes('KTClaw') || btn.textContent?.includes('沉思')
    );

    if (sessionButton) {
      expect(sessionButton).not.toHaveClass('rounded-[24px]');
    }

    expect(mockFetchAgents).toHaveBeenCalledTimes(1);
    expect(mockFetchChannels).toHaveBeenCalledTimes(1);
  });
});
