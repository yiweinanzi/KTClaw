import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { ChatInput } from '@/pages/Chat/ChatInput';

const {
  agentsState,
  chatState,
  gatewayState,
  settingsState,
  providerStoreState,
} = vi.hoisted(() => ({
  agentsState: {
    agents: [
      {
        id: 'main',
        name: 'Main',
        isDefault: true,
        model: 'ollama-ollamaol/qwen3.5-0.8b',
        modelDisplay: 'qwen3.5-0.8b',
        inheritedModel: false,
        workspace: '~/.openclaw/workspace',
        agentDir: '~/.openclaw/agents/main/agent',
        mainSessionKey: 'agent:main:main',
        channelTypes: [],
      },
    ] as Array<Record<string, unknown>>,
  },
  chatState: {
    currentAgentId: 'main',
    currentSessionKey: 'agent:main:main',
    messages: [] as Array<Record<string, unknown>>,
    newSession: vi.fn(),
  },
  gatewayState: {
    status: { state: 'running', port: 18789 },
  },
  settingsState: {
    defaultModel: 'ollama-ollamaol/qwen3.5-0.8b',
  },
  providerStoreState: {
    accounts: [] as Array<Record<string, unknown>>,
    vendors: [] as Array<Record<string, unknown>>,
    refreshProviderSnapshot: vi.fn(async () => undefined),
  },
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  };
});

vi.mock('@/stores/agents', () => ({
  useAgentsStore: (selector: (state: typeof agentsState) => unknown) => selector(agentsState),
}));

vi.mock('@/stores/chat', () => ({
  useChatStore: (selector: (state: typeof chatState) => unknown) => selector(chatState),
}));

vi.mock('@/stores/gateway', () => ({
  useGatewayStore: (selector: (state: typeof gatewayState) => unknown) => selector(gatewayState),
}));

vi.mock('@/stores/settings', () => ({
  useSettingsStore: (selector: (state: typeof settingsState) => unknown) => selector(settingsState),
}));

vi.mock('@/stores/providers', () => ({
  useProviderStore: (selector: (state: typeof providerStoreState) => unknown) => selector(providerStoreState),
}));

vi.mock('@/lib/host-api', () => ({
  hostApiFetch: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({
  invokeIpc: vi.fn(),
}));

vi.mock('@/pages/Chat/FolderSelectorPopover', () => ({
  FolderSelectorPopover: () => null,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('sonner', () => ({
  toast: {
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('ChatInput provider snapshot prewarm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    providerStoreState.accounts = [];
    providerStoreState.vendors = [];
  });

  it('refreshes provider snapshot when the chat surface mounts with an empty provider store', async () => {
    render(<ChatInput onSend={vi.fn()} />);

    await waitFor(() => {
      expect(providerStoreState.refreshProviderSnapshot).toHaveBeenCalledTimes(1);
    });
  });
});
