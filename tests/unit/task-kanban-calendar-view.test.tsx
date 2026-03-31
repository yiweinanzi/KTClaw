/**
 * Tests for CalendarView component
 * Phase 02 Plan 02 Task 2 - TDD RED phase
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CalendarView } from '@/pages/TaskKanban/CalendarView';
import { useApprovalsStore } from '@/stores/approvals';
import { useAgentsStore } from '@/stores/agents';
import type { KanbanTask } from '@/types/task';
import type { AgentSummary } from '@/types/agent';

// Mock stores
vi.mock('@/stores/approvals', () => ({
  useApprovalsStore: vi.fn(),
}));
vi.mock('@/stores/agents', () => ({
  useAgentsStore: vi.fn(),
}));

describe('CalendarView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders FullCalendar component', () => {
    // Arrange
    vi.mocked(useApprovalsStore).mockImplementation((selector: any) =>
      selector({
        tasks: [
          {
            id: '1',
            title: 'Test Task',
            description: 'Test',
            status: 'todo',
            priority: 'medium',
            isTeamTask: false,
            deadline: '2026-04-01T00:00:00Z',
            createdAt: '2026-03-31T00:00:00Z',
            updatedAt: '2026-03-31T00:00:00Z',
            workState: 'idle',
          } as KanbanTask,
        ],
      })
    );

    vi.mocked(useAgentsStore).mockImplementation((selector: any) =>
      selector({
        agents: [] as AgentSummary[],
      })
    );

    // Act
    render(<CalendarView />);

    // Assert - FullCalendar renders with calendar structure
    const calendarElement = document.querySelector('.fc');
    expect(calendarElement).toBeTruthy();
  });

  it('only shows tasks with deadline field', () => {
    // Arrange
    const tasksWithAndWithoutDeadline: KanbanTask[] = [
      {
        id: '1',
        title: 'Task with deadline',
        description: 'Test',
        status: 'todo',
        priority: 'medium',
        isTeamTask: false,
        deadline: '2026-04-01T00:00:00Z',
        createdAt: '2026-03-31T00:00:00Z',
        updatedAt: '2026-03-31T00:00:00Z',
        workState: 'idle',
      },
      {
        id: '2',
        title: 'Task without deadline',
        description: 'Test',
        status: 'todo',
        priority: 'medium',
        isTeamTask: false,
        // No deadline field
        createdAt: '2026-03-31T00:00:00Z',
        updatedAt: '2026-03-31T00:00:00Z',
        workState: 'idle',
      },
    ];

    vi.mocked(useApprovalsStore).mockImplementation((selector: any) =>
      selector({
        tasks: tasksWithAndWithoutDeadline,
      })
    );

    vi.mocked(useAgentsStore).mockImplementation((selector: any) =>
      selector({
        agents: [] as AgentSummary[],
      })
    );

    // Act
    render(<CalendarView />);

    // Assert - Only 1 event should be rendered (the one with deadline)
    const events = document.querySelectorAll('.fc-event');
    expect(events.length).toBe(1);
  });

  it('team tasks use primary color', () => {
    // Arrange
    vi.mocked(useApprovalsStore).mockImplementation((selector: any) =>
      selector({
        tasks: [
          {
            id: '1',
            title: 'Team Task',
            description: 'Test',
            status: 'todo',
            priority: 'medium',
            isTeamTask: true,
            teamId: 'team1',
            teamName: 'Alpha',
            deadline: '2026-04-01T00:00:00Z',
            createdAt: '2026-03-31T00:00:00Z',
            updatedAt: '2026-03-31T00:00:00Z',
            workState: 'idle',
          } as KanbanTask,
        ],
      })
    );

    vi.mocked(useAgentsStore).mockImplementation((selector: any) =>
      selector({
        agents: [] as AgentSummary[],
      })
    );

    // Act
    render(<CalendarView />);

    // Assert - Team task event should have primary color
    const event = document.querySelector('.fc-event');
    expect(event).toBeTruthy();
    // FullCalendar applies backgroundColor as inline style
    const style = (event as HTMLElement)?.style;
    expect(style?.backgroundColor).toContain('hsl(var(--primary))');
  });

  it('supports dayGridMonth, dayGridYear, timeGridWeek views', () => {
    // Arrange
    vi.mocked(useApprovalsStore).mockImplementation((selector: any) =>
      selector({
        tasks: [
          {
            id: '1',
            title: 'Test Task',
            description: 'Test',
            status: 'todo',
            priority: 'medium',
            isTeamTask: false,
            deadline: '2026-04-01T00:00:00Z',
            createdAt: '2026-03-31T00:00:00Z',
            updatedAt: '2026-03-31T00:00:00Z',
            workState: 'idle',
          } as KanbanTask,
        ],
      })
    );

    vi.mocked(useAgentsStore).mockImplementation((selector: any) =>
      selector({
        agents: [] as AgentSummary[],
      })
    );

    // Act
    render(<CalendarView />);

    // Assert - View toggle buttons should exist
    const toolbar = document.querySelector('.fc-toolbar');
    expect(toolbar).toBeTruthy();
    expect(toolbar?.textContent).toContain('周视图');
    expect(toolbar?.textContent).toContain('月视图');
    expect(toolbar?.textContent).toContain('年视图');
  });

  it('shows empty state when no tasks have deadlines', () => {
    // Arrange
    vi.mocked(useApprovalsStore).mockImplementation((selector: any) =>
      selector({
        tasks: [
          {
            id: '1',
            title: 'Task without deadline',
            description: 'Test',
            status: 'todo',
            priority: 'medium',
            isTeamTask: false,
            // No deadline
            createdAt: '2026-03-31T00:00:00Z',
            updatedAt: '2026-03-31T00:00:00Z',
            workState: 'idle',
          } as KanbanTask,
        ],
      })
    );

    vi.mocked(useAgentsStore).mockImplementation((selector: any) =>
      selector({
        agents: [] as AgentSummary[],
      })
    );

    // Act
    render(<CalendarView />);

    // Assert - Empty state should display
    expect(screen.getByText('暂无排期任务')).toBeTruthy();
    expect(screen.getByText(/为任务设置截止日期后/)).toBeTruthy();
  });
});
