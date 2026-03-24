import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { Costs } from '@/pages/Costs';
import { hostApiFetch } from '@/lib/host-api';

vi.mock('@/lib/host-api', () => ({
  hostApiFetch: vi.fn(),
}));

describe('Costs page usage display', () => {
  const recentEntries = [
    {
      timestamp: '2026-03-23T12:34:00Z',
      sessionId: 'session-1',
      agentId: 'planner-agent',
      model: 'gpt-5.2',
      provider: 'openai',
      inputTokens: 1200,
      outputTokens: 800,
      cacheReadTokens: 100,
      cacheWriteTokens: 50,
      totalTokens: 2150,
      costUsd: 0.1234,
    },
    {
      timestamp: '2026-03-23T13:20:00Z',
      sessionId: 'session-2',
      agentId: 'research-agent',
      model: 'claude-sonnet-4',
      provider: 'anthropic',
      inputTokens: 300,
      outputTokens: 400,
      cacheReadTokens: 10,
      cacheWriteTokens: 5,
      totalTokens: 715,
      costUsd: 0.0044,
    },
  ];

  const summary = {
    timeline: [
      { date: '2026-03-17', inputTokens: 120, outputTokens: 80, cacheTokens: 10, totalTokens: 210, costUsd: 0.12, sessions: 1 },
      { date: '2026-03-18', inputTokens: 180, outputTokens: 120, cacheTokens: 15, totalTokens: 315, costUsd: 0.2, sessions: 2 },
      { date: '2026-03-19', inputTokens: 200, outputTokens: 140, cacheTokens: 20, totalTokens: 360, costUsd: 0.25, sessions: 2 },
      { date: '2026-03-20', inputTokens: 240, outputTokens: 160, cacheTokens: 25, totalTokens: 425, costUsd: 0.3, sessions: 2 },
      { date: '2026-03-21', inputTokens: 280, outputTokens: 200, cacheTokens: 30, totalTokens: 510, costUsd: 0.32, sessions: 2 },
      { date: '2026-03-22', inputTokens: 200, outputTokens: 160, cacheTokens: 20, totalTokens: 380, costUsd: 0.28, sessions: 2 },
      { date: '2026-03-23', inputTokens: 280, outputTokens: 200, cacheTokens: 30, totalTokens: 510, costUsd: 0.29, sessions: 1 },
    ],
    totals: {
      inputTokens: 1500,
      outputTokens: 900,
      cacheTokens: 100,
      totalTokens: 2500,
      costUsd: 1.2345,
      sessions: 12,
    },
  };

  const agentRows = [
    {
      agentId: 'planner-agent',
      totalTokens: 2000,
      inputTokens: 1200,
      outputTokens: 800,
      costUsd: 0.9,
      sessions: 8,
    },
    {
      agentId: 'research-agent',
      totalTokens: 500,
      inputTokens: 300,
      outputTokens: 200,
      costUsd: 0.3,
      sessions: 4,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(hostApiFetch).mockImplementation(async (path) => {
      if (path === '/api/usage/recent-token-history?limit=200') {
        return recentEntries;
      }
      if (path === '/api/costs/summary?days=30') {
        return summary;
      }
      if (path === '/api/costs/by-agent') {
        return agentRows;
      }
      throw new Error(`Unexpected hostApiFetch call: ${String(path)}`);
    });
  });

  it('renders recent usage, summary KPIs, and by-agent breakdown', async () => {
    render(<Costs />);

    expect(await screen.findByText('最近记录 (2)')).toBeInTheDocument();
    const realtimeTable = screen.getByRole('table');
    const realtimeCells = within(realtimeTable);
    expect(realtimeCells.getByText('planner-agent')).toBeInTheDocument();
    expect(realtimeCells.getByText('gpt-5.2')).toBeInTheDocument();
    expect(realtimeCells.getByText('$0.1234')).toBeInTheDocument();
    expect(screen.getByText('$0.1278')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '大盘监控' }));
    expect(await screen.findByText('12 次会话')).toBeInTheDocument();
    expect(screen.getByText('$1.2345')).toBeInTheDocument();
    const dashboardTable = screen.getByRole('table');
    const dashboardCells = within(dashboardTable);
    expect(dashboardCells.getByText('planner-agent')).toBeInTheDocument();
    expect(dashboardCells.getByText('$0.9000')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '用量分析' }));
    expect(await screen.findByText('统计范围: 全部 Agent 累计')).toBeInTheDocument();
    expect(screen.getByText('planner-agent')).toBeInTheDocument();
    expect(screen.getByText('80.0% (2.0K)')).toBeInTheDocument();
  });
});
