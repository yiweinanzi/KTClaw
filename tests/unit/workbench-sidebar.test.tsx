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
  agents: [{ id: 'main', name: 'KaiTianClaw', mainSessionKey: 'agent:main:main', isDefault: true }],
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

const mockTranslations: Record<string, string> = {
  'common:sidebar.settings': 'Settings',
  'common:sidebar.clones': 'Clones',
  'common:sidebar.channels': 'Channels',
  'common:sidebar.teams': 'Team management',
  'common:sidebar.tasks': 'Tasks',
  'common:sidebar.addClone': 'Add clone',
  'common:sidebar.addChannel': 'Add channel',
  'common:sidebar.selectedCount': '{{count}} selected',
  'common:sidebar.batchSelect': 'Batch select',
  'common:sidebar.pinSession': 'Pin session',
  'common:sidebar.unpinSession': 'Unpin session',
  'common:sidebar.exportMarkdown': 'Export Markdown',
  'common:sidebar.notifications': 'Notifications',
  'common:sidebar.noNotifications': 'No notifications',
  'common:sidebar.openSearch': 'Open search',
  'common:sidebar.newSession': 'New session',
  'common:sidebar.toggleSidebar': 'Toggle sidebar',
  'common:sidebar.taskBoard': 'Task board',
  'common:sidebar.taskSchedule': 'Task schedule',
  'common:sidebar.memoryKnowledge': 'Memory knowledge base',
  'common:sidebar.costUsage': 'Cost usage',
  'common:sidebar.teamOverview': 'Team overview',
  'common:sidebar.teamMap': 'Team map',
  'common:sidebar.profile': 'Profile',
  'common:sidebar.selectAvatar': 'Select avatar',
  'common:sidebar.nickname': 'Nickname',
  'common:sidebar.nicknamePlaceholder': 'Enter nickname...',
  'common:sidebar.deleteSelected': 'Delete selected',
  'common:sidebar.cancelBatch': 'Cancel batch',
  'common:sidebar.exportSuccess': 'Session export saved',
  'common:sidebar.exportCancelled': 'Export cancelled',
  'common:sidebar.exportNoMessages': 'No exportable messages in this session yet',
  'common:sidebar.exportFailed': 'Session export failed: {{error}}',
  'common:sidebar.museAssistant': 'Quiet assistant',
  'common:sidebar.agentMainSessionMissing': 'Could not find the main session for this agent',
  'common:sidebar.agentDeleted': 'Agent deleted',
  'common:sidebar.agentCreated': 'Agent created',
  'common:sidebar.deleteAgent': 'Delete agent',
  'common:sidebar.avatarCat': 'Cat',
  'common:sidebar.avatarDog': 'Dog',
  'common:sidebar.avatarFox': 'Fox',
  'common:sidebar.avatarBear': 'Bear',
  'common:sidebar.avatarPanda': 'Panda',
  'common:sidebar.avatarLion': 'Lion',
  'common:sidebar.avatarFrog': 'Frog',
  'common:sidebar.avatarKoala': 'Koala',
  'common:sidebar.avatarUnicorn': 'Unicorn',
  'common:actions.confirm': 'Confirm',
  'common:actions.delete': 'Delete',
  'common:actions.cancel': 'Cancel',
  'common:actions.save': 'Save',
  'common:sidebar.deleteSessionConfirm': 'Confirm deletion',
};

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => mockTranslations[key] ?? key,
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

    expect(screen.getByText('Clones')).toBeInTheDocument();
    expect(screen.getByText('Team management')).toBeInTheDocument();
    expect(screen.getByText('Channels')).toBeInTheDocument();
    expect(screen.getByText('Tasks')).toBeInTheDocument();
    expect(screen.getByText('KaiTianClaw')).toBeInTheDocument();
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
    fireEvent.click(await screen.findByRole('button', { name: /markdown/i }));

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

  it('exports an agent main session from the agent context menu', async () => {
    mockChatState.currentSessionKey = 'agent:main:session-1';
    vi.mocked(invokeIpc).mockResolvedValueOnce({
      success: true,
      result: {
        messages: [
          { role: 'user', content: 'Export agent main' },
          { role: 'assistant', content: 'Agent export ready' },
        ],
      },
    });
    vi.mocked(hostApiFetch).mockResolvedValueOnce({ success: true, savedPath: 'C:/tmp/main-agent.md' });

    render(
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>,
    );

    fireEvent.contextMenu(screen.getByText('KaiTianClaw'));
    fireEvent.click(await screen.findByRole('button', { name: /markdown/i }));

    await waitFor(() => {
      expect(invokeIpc).toHaveBeenCalledWith(
        'gateway:rpc',
        'chat.history',
        { sessionKey: 'agent:main:main', limit: 200 },
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
