import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type { AgentSummary } from '@/types/agent';
import { TeamOverview } from '@/pages/TeamOverview';

const { agentsStoreState, chatStoreState, gatewayStoreState } = vi.hoisted(() => ({
  agentsStoreState: {
    agents: [] as AgentSummary[],
    configuredChannelTypes: [] as string[],
    channelOwners: {} as Record<string, string>,
    loading: false,
    error: null as string | null,
    fetchAgents: vi.fn(async () => {}),
    createAgent: vi.fn(async () => {}),
    deleteAgent: vi.fn(async () => {}),
  },
  chatStoreState: {
    sessionLastActivity: {} as Record<string, number>,
  },
  gatewayStoreState: {
    status: {
      state: 'stopped',
      port: 18789,
    },
  },
}));

vi.mock('@/stores/agents', () => ({
  useAgentsStore: () => agentsStoreState,
}));

vi.mock('@/stores/chat', () => ({
  useChatStore: (selector: (state: typeof chatStoreState) => unknown) => selector(chatStoreState),
}));

vi.mock('@/stores/gateway', () => ({
  useGatewayStore: (selector: (state: typeof gatewayStoreState) => unknown) => selector(gatewayStoreState),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => options?.defaultValue as string ?? key,
  }),
}));

vi.mock('@/hooks/use-team-runtime', () => ({
  useTeamRuntime: () => ({ byAgent: {} }),
}));

vi.mock('@/lib/team-work-visibility', () => ({
  deriveTeamWorkVisibility: () => ({}),
}));

vi.mock('@/lib/team-progress-brief', () => ({
  buildLeaderProgressBrief: () => ({
    summaryText: '',
    nextSteps: [],
    dashboard: {
      totalMembers: 0,
      activeMemberCount: 0,
      blockedCount: 0,
      waitingApprovalCount: 0,
      activeWorkItems: [],
      riskItems: [],
      primaryNextAction: '',
    },
  }),
}));

const makeLeader = (id: string, name: string): AgentSummary => ({
  id,
  name,
  teamRole: 'leader',
  reportsTo: null,
  isDefault: id === 'leader-a',
  persona: '',
  model: '',
  modelDisplay: '',
  inheritedModel: false,
  workspace: '',
  agentDir: '',
  mainSessionKey: `agent:${id}:main`,
  channelTypes: [],
  chatAccess: 'direct',
  responsibility: '',
});

const makeWorker = (id: string, name: string, reportsTo: string | null): AgentSummary => ({
  id,
  name,
  teamRole: 'worker',
  reportsTo,
  isDefault: false,
  persona: '',
  model: '',
  modelDisplay: '',
  inheritedModel: false,
  workspace: '',
  agentDir: '',
  mainSessionKey: `agent:${id}:main`,
  channelTypes: [],
  chatAccess: 'leader_only',
  responsibility: '',
});

describe('TeamOverview page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    agentsStoreState.loading = false;
    agentsStoreState.error = null;
    agentsStoreState.agents = [];
    agentsStoreState.configuredChannelTypes = [];
    agentsStoreState.channelOwners = {};
    gatewayStoreState.status = { state: 'running', port: 18789 };
    chatStoreState.sessionLastActivity = {};
    window.localStorage.clear();
  });

  it('shows header and empty state when no agents exist', async () => {
    render(
      <MemoryRouter>
        <TeamOverview />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(agentsStoreState.fetchAgents).toHaveBeenCalled();
    });

    expect(screen.getByRole('heading', { name: 'teamOverview.title' })).toBeInTheDocument();
    expect(screen.getByText('teamOverview.summary')).toBeInTheDocument();
    expect(screen.getByText('teamOverview.empty.title')).toBeInTheDocument();
    expect(screen.getByText('teamOverview.empty.description')).toBeInTheDocument();
  });

  it('renders a command-center dashboard before the secondary member section', async () => {
    const agent: AgentSummary = {
      id: 'main',
      name: 'Navigator',
      persona: 'Guides the ships',
      isDefault: true,
      model: 'gpt-5.4',
      modelDisplay: 'GPT-5.4',
      inheritedModel: true,
      workspace: '~/workspace',
      agentDir: '~/agents/main',
      mainSessionKey: 'agent:main:main',
      channelTypes: ['feishu'],
      teamRole: 'leader',
      chatAccess: 'leader_only',
      responsibility: 'Coordinate team execution',
    };

    agentsStoreState.agents = [agent];
    agentsStoreState.configuredChannelTypes = ['feishu', 'telegram'];
    agentsStoreState.channelOwners = { feishu: 'main' };
    chatStoreState.sessionLastActivity = { [agent.mainSessionKey]: Date.now() };
    window.localStorage.setItem('clawport-kanban', JSON.stringify([
      {
        id: 'ticket-1',
        title: 'Handle inbound work',
        description: 'Blocked on external dependency',
        status: 'in-progress',
        priority: 'high',
        assigneeId: 'main',
        workState: 'blocked',
        createdAt: '2026-03-27T09:00:00Z',
        updatedAt: '2026-03-27T09:10:00Z',
      },
    ]));

    render(
      <MemoryRouter>
        <TeamOverview />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(agentsStoreState.fetchAgents).toHaveBeenCalled();
    });

    expect(screen.getByText('teamOverview.dashboard.progress')).toBeInTheDocument();
    expect(screen.getByText('teamOverview.dashboard.activeWork')).toBeInTheDocument();
    expect(screen.getByText('teamOverview.dashboard.risks')).toBeInTheDocument();
    expect(screen.getByText('teamOverview.dashboard.nextStep')).toBeInTheDocument();
    expect(screen.getByText('teamOverview.sections.members')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'teamOverview.brief.openKanban' })).toHaveAttribute('href', '/kanban');
    expect(screen.getByRole('link', { name: 'teamOverview.brief.openMap' })).toHaveAttribute('href', '/team-map');
    expect(screen.getByText('teamOverview.sections.entryOwnership')).toBeInTheDocument();
    expect(screen.getByText('teamOverview.card.state')).toBeInTheDocument();
    expect(screen.getByText('teamOverview.card.currentWork')).toBeInTheDocument();
    expect(screen.getByText('teamOverview.card.entryOwnership')).toBeInTheDocument();
    expect(screen.getByText('Coordinate team execution')).toBeInTheDocument();
    expect(screen.getAllByText(agent.name).length).toBeGreaterThan(0);
    expect(screen.getAllByText('feishu').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'teamOverview.hireButton' }));
    expect(screen.getByText('teamOverview.createModal.title')).toBeInTheDocument();
  });

  it('renders grouped layout when multiple leaders exist', async () => {
    agentsStoreState.agents = [
      makeLeader('leader-a', 'Leader Alpha'),
      makeLeader('leader-b', 'Leader Beta'),
      makeWorker('worker-1', 'Worker One', 'leader-a'),
      makeWorker('worker-2', 'Worker Two', 'leader-b'),
    ];

    render(
      <MemoryRouter>
        <TeamOverview />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(agentsStoreState.fetchAgents).toHaveBeenCalled();
    });

    expect(screen.getAllByText('Leader Alpha').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Leader Beta').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Worker One').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Worker Two').length).toBeGreaterThan(0);
  });

  it('collapses a leader group on header click', async () => {
    agentsStoreState.agents = [
      makeLeader('leader-a', 'Leader Alpha'),
      makeLeader('leader-b', 'Leader Beta'),
      makeWorker('worker-1', 'Worker One', 'leader-a'),
      makeWorker('worker-2', 'Worker Two', 'leader-b'),
    ];

    render(
      <MemoryRouter>
        <TeamOverview />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(agentsStoreState.fetchAgents).toHaveBeenCalled();
    });

    // Worker One is visible before collapse
    expect(screen.getAllByText('Worker One').length).toBeGreaterThan(0);

    // Click the Leader Alpha group header to collapse it
    // The header has role="button" and contains Leader Alpha in the header span
    const allButtons = screen.getAllByRole('button', { hidden: true });
    const leaderAlphaHeader = allButtons.find(
      (el) => el.getAttribute('role') === 'button' && el.querySelector('span.text-sm.font-semibold')?.textContent === 'Leader Alpha',
    );
    expect(leaderAlphaHeader).not.toBeUndefined();
    fireEvent.click(leaderAlphaHeader!);

    // Worker One should be hidden (collapsed group)
    expect(screen.queryByText('Worker One')).toBeNull();
    // Worker Two should still be visible (other group not collapsed)
    expect(screen.getAllByText('Worker Two').length).toBeGreaterThan(0);
  });

  it('renders ungrouped agents in standalone section', async () => {
    agentsStoreState.agents = [
      makeLeader('leader-a', 'Leader Alpha'),
      makeWorker('worker-1', 'Worker One', 'leader-a'),
      makeWorker('worker-free', 'Worker Free', null),
    ];

    render(
      <MemoryRouter>
        <TeamOverview />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(agentsStoreState.fetchAgents).toHaveBeenCalled();
    });

    expect(screen.getByText('Independent')).toBeInTheDocument();
  });

  it('falls back to flat grid when only one leader with no ungrouped', async () => {
    agentsStoreState.agents = [
      makeLeader('leader-a', 'Leader Alpha'),
      makeWorker('worker-1', 'Worker One', 'leader-a'),
    ];

    render(
      <MemoryRouter>
        <TeamOverview />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(agentsStoreState.fetchAgents).toHaveBeenCalled();
    });

    // Standalone section should not appear
    expect(screen.queryByText('Independent')).toBeNull();
    // Agents should still appear in the flat grid
    expect(screen.getByText('Leader Alpha')).toBeInTheDocument();
    expect(screen.getByText('Worker One')).toBeInTheDocument();
  });
});
