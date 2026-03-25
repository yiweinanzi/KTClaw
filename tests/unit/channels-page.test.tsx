import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
      type: 'feishu' | 'dingtalk' | 'wecom' | 'qqbot';
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
    defaultModel: 'claude-sonnet-4-6',
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

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe('Channels page composer UX', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    channelsStoreState.channels = [
      {
        id: 'feishu-default',
        type: 'feishu',
        name: 'Dev Feishu',
        status: 'connected',
      },
    ];
    channelsStoreState.loading = false;
    channelsStoreState.error = null;
    settingsState.defaultModel = 'claude-sonnet-4-6';
    hostApiFetchMock.mockImplementation(async (path: string) => {
      if (path === '/api/channels/capabilities') {
        return { success: true, capabilities: [] };
      }
      return { success: true };
    });
  });

  it('keeps composer draft when send fails', async () => {
    hostApiFetchMock.mockImplementation(async (path: string) => {
      if (path === '/api/channels/capabilities') {
        return { success: true, capabilities: [] };
      }
      if (path.includes('/send')) {
        throw new Error('send failed');
      }
      return { success: true };
    });

    render(<Channels />);
    fireEvent.click(screen.getByText('Dev Feishu'));
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'hello from channel' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(hostApiFetchMock).toHaveBeenCalledWith(
        '/api/channels/feishu-default/send',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    expect(input).toHaveValue('hello from channel');
  });

  it('does not send when Enter is pressed during IME composition', async () => {
    render(<Channels />);
    await waitFor(() => {
      expect(hostApiFetchMock).toHaveBeenCalledWith('/api/channels/capabilities');
    });
    fireEvent.click(screen.getByText('Dev Feishu'));
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '输入法输入中' } });
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 229, isComposing: true });

    const sendCalls = hostApiFetchMock.mock.calls.filter(([path]) =>
      typeof path === 'string' && path.includes('/send'),
    );
    expect(sendCalls).toHaveLength(0);
    expect(input).toHaveValue('输入法输入中');
  });

  it('uses settings default model in the composer model pill', async () => {
    settingsState.defaultModel = 'gpt-5.2';

    render(<Channels />);
    await waitFor(() => {
      expect(hostApiFetchMock).toHaveBeenCalledWith('/api/channels/capabilities');
    });
    fireEvent.click(screen.getByText('Dev Feishu'));

    expect(screen.getByText('gpt-5.2')).toBeInTheDocument();
  });

  it('renders normalized runtime capabilities for the selected channel', async () => {
    hostApiFetchMock.mockImplementation(async (path: string) => {
      if (path === '/api/channels/capabilities') {
        return {
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
        };
      }
      return { success: true };
    });

    render(<Channels />);
    fireEvent.click(screen.getByText('Dev Feishu'));

    await waitFor(() => {
      expect(screen.getByText('Runtime capabilities')).toBeInTheDocument();
    });

    expect(screen.getByText(/Actions: disconnect, test, send, configure/)).toBeInTheDocument();
    expect(screen.getByText(/Schema: 2 fields \(required 2\)/)).toBeInTheDocument();
  });

  it('surfaces supported non-default channel families like telegram in the channel type list', async () => {
    channelsStoreState.channels = [
      {
        id: 'telegram-default',
        type: 'telegram',
        name: 'Ops Telegram',
        status: 'connected',
      },
    ] as typeof channelsStoreState.channels;

    render(<Channels />);

    expect(await screen.findByText('Telegram')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Telegram'));
    expect(await screen.findByText('Ops Telegram')).toBeInTheDocument();
  });
});
