import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentSummary } from '@/types/agent';
import { TeamMap } from '@/pages/TeamMap';

const { agentsStoreState, chatStoreState } = vi.hoisted(() => ({
  agentsStoreState: {
    agents: [] as AgentSummary[],
    loading: false,
    defaultAgentId: 'main',
    configuredChannelTypes: [] as string[],
    channelOwners: {} as Record<string, string>,
    fetchAgents: vi.fn(async () => {}),
  },
  chatStoreState: {
    sessionLastActivity: {} as Record<string, number>,
  },
}));

vi.mock('@/stores/agents', () => ({
  useAgentsStore: () => agentsStoreState,
}));

vi.mock('@/stores/chat', () => ({
  useChatStore: (selector: (state: typeof chatStoreState) => unknown) => selector(chatStoreState),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe('TeamMap page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    agentsStoreState.loading = false;
    agentsStoreState.defaultAgentId = 'main';
    agentsStoreState.configuredChannelTypes = ['feishu', 'telegram'];
    agentsStoreState.channelOwners = { feishu: 'main' };
    window.localStorage.clear();
    agentsStoreState.agents = [
      {
        id: 'main',
        name: 'Main',
        persona: 'Primary agent',
        isDefault: true,
        model: 'gpt-5.4',
        modelDisplay: 'GPT-5.4',
        inheritedModel: false,
        workspace: '~/workspace',
        agentDir: '~/agents/main',
        mainSessionKey: 'agent:main:main',
        channelTypes: ['feishu'],
        teamRole: 'leader',
        chatAccess: 'direct',
        responsibility: 'Coordinate team operations',
      },
      {
        id: 'researcher',
        name: 'Researcher',
        persona: 'Finds information',
        isDefault: false,
        model: 'claude-sonnet-4',
        modelDisplay: 'Claude Sonnet 4',
        inheritedModel: true,
        workspace: '~/workspace-researcher',
        agentDir: '~/agents/researcher',
        mainSessionKey: 'agent:researcher:main',
        channelTypes: ['telegram'],
        teamRole: 'worker',
        chatAccess: 'leader_only',
        responsibility: 'Finds information',
      },
    ];
    chatStoreState.sessionLastActivity = {
      'agent:main:main': Date.now(),
      'agent:researcher:main': Date.now(),
    };
    window.localStorage.setItem('clawport-kanban', JSON.stringify([
      {
        id: 'ticket-research',
        title: 'Need reviewer approval',
        description: 'Awaiting approval',
        status: 'review',
        priority: 'medium',
        assigneeId: 'researcher',
        workState: 'waiting_approval',
        createdAt: '2026-03-27T09:00:00Z',
        updatedAt: '2026-03-27T09:05:00Z',
      },
    ]));
  });

  it('renders topology nodes, keeps an operations rail visible, and switches views', async () => {
    render(<TeamMap />);

    await waitFor(() => {
      expect(agentsStoreState.fetchAgents).toHaveBeenCalled();
    });

    expect(screen.getAllByText('Main').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Researcher').length).toBeGreaterThan(0);
    expect(screen.getAllByText('teamMap.status.waiting_approval').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Need reviewer approval').length).toBeGreaterThan(0);
    expect(screen.getByText('teamMap.rail.title')).toBeInTheDocument();
    expect(screen.getByText('teamMap.rail.currentTask')).toBeInTheDocument();
    expect(screen.getByText('teamMap.rail.nextStep')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Researcher'));
    expect(screen.getByText('teamMap.rail.title')).toBeInTheDocument();
    expect(screen.getByText('teamMap.rail.profilePolicy')).toBeInTheDocument();
    expect(screen.getByText('teamMap.rail.runtimeWork')).toBeInTheDocument();
    expect(screen.getAllByText('teamMap.role.worker').length).toBeGreaterThan(0);
    expect(screen.getAllByText('teamMap.access.leader_only').length).toBeGreaterThan(0);
    expect(screen.getByText('Finds information')).toBeInTheDocument();
    expect(screen.getByText('teamMap.rail.currentWork')).toBeInTheDocument();
    expect(screen.getAllByText('Need reviewer approval').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'teamMap.tabs.teams' }));
    expect(screen.getByText('teamMap.allGroup')).toBeInTheDocument();
  });
});
