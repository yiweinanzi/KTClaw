import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ChatInput } from '@/pages/Chat/ChatInput';

const { agentsState, chatState, gatewayState, settingsState } = vi.hoisted(() => ({
  agentsState: {
    agents: [] as Array<Record<string, unknown>>,
  },
  chatState: {
    currentAgentId: 'main',
  },
  gatewayState: {
    status: { state: 'running', port: 18789 },
  },
  settingsState: {
    defaultModel: 'claude-sonnet-4-6',
  },
}));

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

vi.mock('@/lib/host-api', () => ({
  hostApiFetch: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({
  invokeIpc: vi.fn(),
}));

vi.mock('@/pages/Chat/FolderSelectorPopover', () => ({
  FolderSelectorPopover: ({
    onSelectFolder,
  }: {
    onSelectFolder: (path: string) => void;
  }) => (
    <button type="button" onClick={() => onSelectFolder('C:/Users/22688/Desktop/ClawX-main')}>
      mock-select-folder
    </button>
  ),
}));

function translate(key: string, vars?: Record<string, unknown>): string {
  switch (key) {
    case 'composer.attachFiles':
      return 'Attach files';
    case 'composer.pickAgent':
      return 'Choose agent';
    case 'composer.clearTarget':
      return 'Clear target agent';
    case 'composer.targetChip':
      return `@${String(vars?.agent ?? '')}`;
    case 'composer.agentPickerTitle':
      return 'Route the next message to another agent';
    case 'composer.gatewayDisconnectedPlaceholder':
      return 'Gateway not connected...';
    case 'composer.send':
      return 'Send';
    case 'composer.stop':
      return 'Stop';
    case 'composer.gatewayConnected':
      return 'connected';
    case 'composer.gatewayStatus':
      return `gateway ${String(vars?.state ?? '')} | port: ${String(vars?.port ?? '')} ${String(vars?.pid ?? '')}`.trim();
    case 'composer.retryFailedAttachments':
      return 'Retry failed attachments';
    default:
      return key;
  }
}

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: translate,
  }),
}));

describe('ChatInput agent targeting', () => {
  beforeEach(() => {
    agentsState.agents = [];
    chatState.currentAgentId = 'main';
    gatewayState.status = { state: 'running', port: 18789 };
    settingsState.defaultModel = 'claude-sonnet-4-6';
  });

  it('renders the updated composer shell regions and model pill', () => {
    agentsState.agents = [
      {
        id: 'main',
        name: 'Main',
        isDefault: true,
        modelDisplay: 'MiniMax',
        inheritedModel: true,
        workspace: '~/.openclaw/workspace',
        agentDir: '~/.openclaw/agents/main/agent',
        mainSessionKey: 'agent:main:main',
        channelTypes: [],
      },
    ];

    render(<ChatInput onSend={vi.fn()} />);

    expect(screen.getByTestId('chat-composer-shell')).toHaveClass('chat-composer-shell');
    expect(screen.getByTestId('chat-composer-toolbar')).toHaveClass('chat-composer-toolbar');
    expect(screen.getByTestId('chat-composer-footer')).toHaveClass('chat-composer-footer');
    expect(screen.getByTestId('chat-composer-model-pill')).toHaveTextContent('MiniMax');
  });

  it('applies distinct framing classes for empty vs active chat layouts', () => {
    const { rerender } = render(<ChatInput onSend={vi.fn()} isEmpty />);
    const frame = screen.getByTestId('chat-input-frame');

    expect(frame).toHaveClass('chat-input-layout-empty');
    expect(frame).not.toHaveClass('chat-input-layout-active');

    rerender(<ChatInput onSend={vi.fn()} isEmpty={false} />);

    expect(frame).toHaveClass('chat-input-layout-active');
    expect(frame).not.toHaveClass('chat-input-layout-empty');
  });

  it('hides the @agent picker when only one agent is configured', () => {
    agentsState.agents = [
      {
        id: 'main',
        name: 'Main',
        isDefault: true,
        modelDisplay: 'MiniMax',
        inheritedModel: true,
        workspace: '~/.openclaw/workspace',
        agentDir: '~/.openclaw/agents/main/agent',
        mainSessionKey: 'agent:main:main',
        channelTypes: [],
      },
    ];

    render(<ChatInput onSend={vi.fn()} />);

    expect(screen.queryByTitle('Choose agent')).not.toBeInTheDocument();
  });

  it('lets the user select an agent target and sends it with the message', () => {
    const onSend = vi.fn();
    agentsState.agents = [
      {
        id: 'main',
        name: 'Main',
        isDefault: true,
        modelDisplay: 'MiniMax',
        inheritedModel: true,
        workspace: '~/.openclaw/workspace',
        agentDir: '~/.openclaw/agents/main/agent',
        mainSessionKey: 'agent:main:main',
        channelTypes: [],
      },
      {
        id: 'research',
        name: 'Research',
        isDefault: false,
        modelDisplay: 'Claude',
        inheritedModel: false,
        workspace: '~/.openclaw/workspace-research',
        agentDir: '~/.openclaw/agents/research/agent',
        mainSessionKey: 'agent:research:desk',
        channelTypes: [],
      },
    ];

    render(<ChatInput onSend={onSend} />);

    fireEvent.click(screen.getByTitle('Choose agent'));
    fireEvent.click(screen.getByText('Research'));

    expect(screen.getByText('@Research')).toBeInTheDocument();

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Hello direct agent' } });
    fireEvent.click(screen.getByTitle('Send'));

    expect(onSend).toHaveBeenCalledWith('Hello direct agent', undefined, 'research', null);
  });

  it('falls back to the default model from settings when current agent has no modelDisplay', () => {
    agentsState.agents = [
      {
        id: 'main',
        name: 'Main',
        isDefault: true,
        inheritedModel: true,
        workspace: '~/.openclaw/workspace',
        agentDir: '~/.openclaw/agents/main/agent',
        mainSessionKey: 'agent:main:main',
        channelTypes: [],
      },
    ];
    settingsState.defaultModel = 'gpt-5.2';

    render(<ChatInput onSend={vi.fn()} />);

    expect(screen.getByTestId('chat-composer-model-pill')).toHaveTextContent('gpt-5.2');
  });

  it('passes selected workingDirectory as the 4th onSend argument', () => {
    const onSend = vi.fn();
    agentsState.agents = [
      {
        id: 'main',
        name: 'Main',
        isDefault: true,
        modelDisplay: 'MiniMax',
        inheritedModel: true,
        workspace: '~/.openclaw/workspace',
        agentDir: '~/.openclaw/agents/main/agent',
        mainSessionKey: 'agent:main:main',
        channelTypes: [],
      },
    ];

    render(<ChatInput onSend={onSend} />);

    fireEvent.click(screen.getByRole('button', { name: 'mock-select-folder' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Run in selected dir' } });
    fireEvent.click(screen.getByTitle('Send'));

    expect(onSend).toHaveBeenCalledWith(
      'Run in selected dir',
      undefined,
      null,
      'C:/Users/22688/Desktop/ClawX-main',
    );
  });
});
