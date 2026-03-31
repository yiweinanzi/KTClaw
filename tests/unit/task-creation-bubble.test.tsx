/**
 * TaskCreationBubble Component Tests
 * Phase 02-04: Conversational task creation flow
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TaskCreationBubble } from '@/pages/Chat/TaskCreationBubble';
import { useApprovalsStore } from '@/stores/approvals';
import { useAgentsStore } from '@/stores/agents';
import { useChatStore } from '@/stores/chat';

// Mock stores
vi.mock('@/stores/approvals');
vi.mock('@/stores/agents');
vi.mock('@/stores/chat');

describe('TaskCreationBubble', () => {
  const mockCreateTask = vi.fn();
  const mockOnConfirm = vi.fn();
  const mockOnCancel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock approvals store with selector function
    vi.mocked(useApprovalsStore).mockImplementation((selector: any) => {
      const state = {
        createTask: mockCreateTask,
      };
      return selector ? selector(state) : state;
    });

    // Mock agents store with selector function
    vi.mocked(useAgentsStore).mockImplementation((selector: any) => {
      const state = {
        agents: [
          { id: 'agent-1', name: 'Agent Alpha', teamRole: 'developer' },
          { id: 'agent-2', name: 'Agent Beta', teamRole: 'designer' },
        ],
      };
      return selector ? selector(state) : state;
    });

    // Mock chat store with selector function
    vi.mocked(useChatStore).mockImplementation((selector: any) => {
      const state = {
        currentAgentId: 'agent-1',
      };
      return selector ? selector(state) : state;
    });

    mockCreateTask.mockResolvedValue(undefined);
  });

  it('renders task title and assignee name', () => {
    render(
      <TaskCreationBubble
        title="Implement login feature"
        description="Add OAuth login"
        assigneeId="agent-1"
        priority="high"
      />
    );

    expect(screen.getByText('创建任务')).toBeInTheDocument();
    expect(screen.getByText('Implement login feature')).toBeInTheDocument();
    expect(screen.getByText('Agent Alpha')).toBeInTheDocument();
  });

  it('calls createTask with correct parameters when confirm button is clicked', async () => {
    render(
      <TaskCreationBubble
        title="Implement login feature"
        description="Add OAuth login"
        assigneeId="agent-1"
        priority="high"
        teamId="team-1"
        teamName="Frontend"
        deadline="2026-04-15T10:00:00Z"
        onConfirm={mockOnConfirm}
      />
    );

    const confirmButton = screen.getByText('确认');
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(mockCreateTask).toHaveBeenCalledWith({
        title: 'Implement login feature',
        description: 'Add OAuth login',
        priority: 'high',
        assigneeId: 'agent-1',
        assigneeRole: 'developer',
        teamId: 'team-1',
        teamName: 'Frontend',
        deadline: '2026-04-15T10:00:00Z',
      });
      expect(mockOnConfirm).toHaveBeenCalled();
    });
  });

  it('calls onCancel callback when cancel button is clicked', () => {
    render(
      <TaskCreationBubble
        title="Implement login feature"
        description="Add OAuth login"
        onCancel={mockOnCancel}
      />
    );

    const cancelButton = screen.getByText('取消');
    fireEvent.click(cancelButton);

    expect(mockOnCancel).toHaveBeenCalled();
  });

  it('uses soft accent background color', () => {
    const { container } = render(
      <TaskCreationBubble
        title="Implement login feature"
        description="Add OAuth login"
      />
    );

    const card = container.querySelector('.bg-accent\\/10');
    expect(card).toBeInTheDocument();
  });

  it('shows "任务已创建" message after confirmation', async () => {
    render(
      <TaskCreationBubble
        title="Implement login feature"
        description="Add OAuth login"
        assigneeId="agent-1"
      />
    );

    const confirmButton = screen.getByText('确认');
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(screen.getByText('✓ 任务已创建')).toBeInTheDocument();
      expect(screen.getByText('Implement login feature')).toBeInTheDocument();
    });
  });

  it('defaults to current agent when no assignee specified', () => {
    render(
      <TaskCreationBubble
        title="Implement login feature"
        description="Add OAuth login"
      />
    );

    // Should show current agent (agent-1 -> Agent Alpha)
    expect(screen.getByText('Agent Alpha')).toBeInTheDocument();
  });

  it('displays team name when provided', () => {
    render(
      <TaskCreationBubble
        title="Implement login feature"
        description="Add OAuth login"
        teamId="team-1"
        teamName="Frontend"
      />
    );

    expect(screen.getByText('Frontend')).toBeInTheDocument();
  });

  it('displays deadline when provided', () => {
    render(
      <TaskCreationBubble
        title="Implement login feature"
        description="Add OAuth login"
        deadline="2026-04-15T10:00:00Z"
      />
    );

    expect(screen.getByText(/2026/)).toBeInTheDocument();
  });
});
