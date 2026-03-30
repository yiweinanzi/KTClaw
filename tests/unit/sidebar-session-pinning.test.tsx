import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Sidebar } from '@/components/layout/Sidebar';

const PINNED_STORAGE_KEY = 'ktclaw-sidebar-pinned-sessions';

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
  sessions: [
    { key: 'session-recent-unpinned', label: 'Recent Unpinned' },
    { key: 'session-pinned-old', label: 'Pinned Old' },
    { key: 'session-pinned-new', label: 'Pinned New' },
    { key: 'session-unpinned-old', label: 'Unpinned Old' },
  ],
  currentSessionKey: 'session-recent-unpinned',
  sessionLabels: {
    'session-recent-unpinned': 'Recent Unpinned',
    'session-pinned-old': 'Pinned Old',
    'session-pinned-new': 'Pinned New',
    'session-unpinned-old': 'Unpinned Old',
  },
  sessionLastActivity: {
    'session-recent-unpinned': 400,
    'session-pinned-old': 100,
    'session-pinned-new': 300,
    'session-unpinned-old': 50,
  },
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
  agents: [{ id: 'main', name: 'KaiTianClaw', mainSessionKey: 'agent:main:main', isDefault: true }],
  fetchAgents: mockFetchAgents,
  createAgent: vi.fn(async () => {}),
  deleteAgent: vi.fn(async () => {}),
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

const mockTranslations: Record<string, string> = {
  'common:sidebar.pinSession': 'Pin session',
  'common:sidebar.unpinSession': 'Unpin session',
  'common:sidebar.exportMarkdown': 'Export Markdown',
  'common:sidebar.batchSelect': 'Batch select',
  'common:sidebar.toggleSidebar': 'Toggle sidebar',
  'common:sidebar.newSession': 'New session',
  'common:sidebar.openSearch': 'Open search',
};

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => mockTranslations[key] ?? key,
  }),
}));

function parsePinnedStorage() {
  const raw = localStorage.getItem(PINNED_STORAGE_KEY);
  if (!raw) return [];
  return JSON.parse(raw) as string[];
}

function expectButtonBefore(a: HTMLElement, b: HTMLElement) {
  expect(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
}

function getSessionButton(label: string) {
  const textNode = screen.getByText(label);
  const button = textNode.closest('button');
  expect(button).not.toBeNull();
  return button as HTMLElement;
}

describe('sidebar session pinning', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('keeps pinned sessions above unpinned while preserving recency inside each group', () => {
    localStorage.setItem(
      PINNED_STORAGE_KEY,
      JSON.stringify(['session-pinned-old', 'session-pinned-new']),
    );

    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>,
    );

    const pinnedNewButton = getSessionButton('Pinned New');
    const pinnedOldButton = getSessionButton('Pinned Old');
    const recentUnpinnedButton = getSessionButton('Recent Unpinned');
    const unpinnedOldButton = getSessionButton('Unpinned Old');

    expectButtonBefore(pinnedNewButton, pinnedOldButton);
    expectButtonBefore(pinnedOldButton, recentUnpinnedButton);
    expectButtonBefore(recentUnpinnedButton, unpinnedOldButton);
    expect(screen.getAllByLabelText(/^(Pinned session|置顶会话)$/)).toHaveLength(2);
  });

  it('adds pin and unpin actions to the session context menu and persists updates', () => {
    mockChatState.sessions = [{ key: 'session-one', label: 'Session One' }];
    mockChatState.sessionLabels = { 'session-one': 'Session One' };
    mockChatState.sessionLastActivity = { 'session-one': 1 };
    mockChatState.currentSessionKey = 'session-one';

    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>,
    );

    fireEvent.contextMenu(screen.getByText('Session One'));
    fireEvent.click(screen.getByRole('button', { name: /^(Pin session|置顶会话)$/ }));

    expect(parsePinnedStorage()).toEqual(['session-one']);
    expect(screen.getByLabelText(/^(Pinned session|置顶会话)$/)).toBeInTheDocument();

    fireEvent.contextMenu(screen.getByText('Session One'));
    fireEvent.click(screen.getByRole('button', { name: /^(Unpin session|取消置顶)$/ }));

    expect(parsePinnedStorage()).toEqual([]);
    expect(screen.queryByLabelText(/^(Pinned session|置顶会话)$/)).not.toBeInTheDocument();
  });
});
