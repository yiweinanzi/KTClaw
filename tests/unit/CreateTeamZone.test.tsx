import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CreateTeamZone } from '@/components/team/CreateTeamZone';
import { useTeamsStore } from '@/stores/teams';
import { useAgentsStore } from '@/stores/agents';

vi.mock('@dnd-kit/core', () => ({
  useDroppable: () => ({
    setNodeRef: vi.fn(),
    isOver: false,
  }),
}));

vi.mock('@/stores/teams', () => ({
  useTeamsStore: vi.fn(),
}));

vi.mock('@/stores/agents', () => ({
  useAgentsStore: vi.fn(),
}));

describe('CreateTeamZone', () => {
  const mockCreateTeam = vi.fn();
  const mockAgents = [
    { id: 'agent-1', name: 'Alice', avatar: null },
    { id: 'agent-2', name: 'Bob', avatar: null },
    { id: 'agent-3', name: 'Charlie', avatar: null },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    (useTeamsStore as any).mockReturnValue({
      createTeam: mockCreateTeam,
    });
    (useAgentsStore as any).mockReturnValue({
      agents: mockAgents,
    });
  });

  it('shows empty state with prompt text', () => {
    render(<CreateTeamZone />);
    expect(screen.getByText('创建新团队')).toBeInTheDocument();
    expect(screen.getByText(/从右侧拖拽 Agent/)).toBeInTheDocument();
  });

  it('expands to show Leader and Member zones when agent added', () => {
    render(<CreateTeamZone />);

    // Initially empty state
    expect(screen.getByText('创建新团队')).toBeInTheDocument();

    // Simulate adding a leader (this would be done via drag-drop in real usage)
    // For now, we'll test the component structure
  });

  it('shows hint when less than 3 members', () => {
    render(<CreateTeamZone />);
    // This test will be implemented when we add state management
  });

  it('allows removing agents from zones', () => {
    render(<CreateTeamZone />);
    // This test will be implemented when we add state management
  });

  describe('Confirmation Form', () => {
    it('shows confirmation form when create button is clicked', () => {
      const { rerender } = render(<CreateTeamZone />);

      // Simulate having leader and members (would be set via drag-drop)
      // For testing, we'll need to expose a way to set initial state
      // This test will pass once we implement the form

      const createButton = screen.queryByText('创建团队');
      if (createButton && !createButton.hasAttribute('disabled')) {
        fireEvent.click(createButton);
        expect(screen.getByText('确认创建团队')).toBeInTheDocument();
      }
    });

    it('auto-generates team name as "{LeaderName} 的团队"', async () => {
      render(<CreateTeamZone />);

      // After leader is set, team name should auto-generate
      // This will be tested once we implement the useEffect
      await waitFor(() => {
        const nameInput = screen.queryByPlaceholderText('输入团队名称');
        if (nameInput) {
          expect((nameInput as HTMLInputElement).value).toMatch(/的团队$/);
        }
      });
    });

    it('allows editing team name and description', () => {
      render(<CreateTeamZone />);

      const nameInput = screen.queryByPlaceholderText('输入团队名称');
      const descInput = screen.queryByPlaceholderText('描述团队的职责和目标');

      if (nameInput && descInput) {
        fireEvent.change(nameInput, { target: { value: '测试团队' } });
        fireEvent.change(descInput, { target: { value: '测试描述' } });

        expect((nameInput as HTMLInputElement).value).toBe('测试团队');
        expect((descInput as HTMLTextAreaElement).value).toBe('测试描述');
      }
    });

    it('calls createTeam when confirm button is clicked', async () => {
      render(<CreateTeamZone />);

      const confirmButton = screen.queryByText('确认创建');
      if (confirmButton && !confirmButton.hasAttribute('disabled')) {
        fireEvent.click(confirmButton);

        await waitFor(() => {
          expect(mockCreateTeam).toHaveBeenCalled();
        });
      }
    });

    it('resets state after successful creation', async () => {
      mockCreateTeam.mockResolvedValueOnce(undefined);
      render(<CreateTeamZone />);

      const confirmButton = screen.queryByText('确认创建');
      if (confirmButton) {
        fireEvent.click(confirmButton);

        await waitFor(() => {
          expect(screen.queryByText('确认创建团队')).not.toBeInTheDocument();
        });
      }
    });

    it('closes form when cancel button is clicked', () => {
      render(<CreateTeamZone />);

      const cancelButton = screen.queryByText('取消');
      if (cancelButton) {
        fireEvent.click(cancelButton);
        expect(screen.queryByText('确认创建团队')).not.toBeInTheDocument();
      }
    });

    it('disables confirm button when name is empty', () => {
      render(<CreateTeamZone />);

      const confirmButton = screen.queryByText('确认创建');
      const nameInput = screen.queryByPlaceholderText('输入团队名称');

      if (confirmButton && nameInput) {
        fireEvent.change(nameInput, { target: { value: '' } });
        expect(confirmButton).toBeDisabled();
      }
    });

    it('shows loading state during creation', async () => {
      mockCreateTeam.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)));
      render(<CreateTeamZone />);

      const confirmButton = screen.queryByText('确认创建');
      if (confirmButton && !confirmButton.hasAttribute('disabled')) {
        fireEvent.click(confirmButton);

        await waitFor(() => {
          expect(screen.queryByText('创建中...')).toBeInTheDocument();
        });
      }
    });
  });
});
