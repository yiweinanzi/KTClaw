import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useChannelsStore } from '@/stores/channels';
import { hostApiFetch } from '@/lib/host-api';

const { gatewayRpcMock } = vi.hoisted(() => ({
  gatewayRpcMock: vi.fn(),
}));

vi.mock('@/stores/gateway', () => ({
  useGatewayStore: {
    getState: () => ({
      rpc: gatewayRpcMock,
    }),
  },
}));

vi.mock('@/lib/host-api', () => ({
  hostApiFetch: vi.fn(),
}));

describe('channels store fetchChannels', () => {
  beforeEach(() => {
    gatewayRpcMock.mockReset();
    vi.mocked(hostApiFetch).mockReset();
    useChannelsStore.setState({
      channels: [],
      loading: false,
      error: null,
    });
  });

  it('preserves an error state when initial fetch fails', async () => {
    gatewayRpcMock.mockRejectedValueOnce(new Error('gateway unavailable'));

    await useChannelsStore.getState().fetchChannels();

    const state = useChannelsStore.getState();
    expect(state.channels).toEqual([]);
    expect(state.loading).toBe(false);
    expect(state.error).toContain('gateway unavailable');
  });

  it('deletes only the scoped channel account when channelId includes an account id', async () => {
    useChannelsStore.setState({
      channels: [
        {
          id: 'feishu-agent-a',
          type: 'feishu',
          name: 'Agent A Feishu',
          status: 'connected',
          accountId: 'agent-a',
        },
        {
          id: 'feishu-default',
          type: 'feishu',
          name: 'Default Feishu',
          status: 'connected',
          accountId: 'default',
        },
      ],
    });

    vi.mocked(hostApiFetch).mockResolvedValue({ success: true });
    gatewayRpcMock.mockResolvedValue({ success: true });

    await useChannelsStore.getState().deleteChannel('feishu-agent-a');

    expect(hostApiFetch).toHaveBeenCalledWith('/api/channels/config/feishu?accountId=agent-a', {
      method: 'DELETE',
    });
    expect(gatewayRpcMock).toHaveBeenCalledWith('channels.delete', {
      channelId: 'feishu',
      accountId: 'agent-a',
    });
    expect(useChannelsStore.getState().channels).toEqual([
      expect.objectContaining({ id: 'feishu-default' }),
    ]);
  });

  it('connects a scoped channel account with channel type and account id', async () => {
    useChannelsStore.setState({
      channels: [
        {
          id: 'feishu-agent-a',
          type: 'feishu',
          name: 'Agent A Feishu',
          status: 'disconnected',
          accountId: 'agent-a',
        },
      ],
    });

    gatewayRpcMock.mockResolvedValue({ success: true });

    await useChannelsStore.getState().connectChannel('feishu-agent-a');

    expect(gatewayRpcMock).toHaveBeenCalledWith('channels.connect', {
      channelId: 'feishu',
      accountId: 'agent-a',
    });
    expect(useChannelsStore.getState().channels[0]).toEqual(expect.objectContaining({
      id: 'feishu-agent-a',
      status: 'connected',
    }));
  });

  it('disconnects a scoped channel account with channel type and account id', async () => {
    useChannelsStore.setState({
      channels: [
        {
          id: 'feishu-agent-a',
          type: 'feishu',
          name: 'Agent A Feishu',
          status: 'connected',
          accountId: 'agent-a',
        },
      ],
    });

    gatewayRpcMock.mockResolvedValue({ success: true });

    await useChannelsStore.getState().disconnectChannel('feishu-agent-a');

    expect(gatewayRpcMock).toHaveBeenCalledWith('channels.disconnect', {
      channelId: 'feishu',
      accountId: 'agent-a',
    });
    expect(useChannelsStore.getState().channels[0]).toEqual(expect.objectContaining({
      id: 'feishu-agent-a',
      status: 'disconnected',
    }));
  });
});
