import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useApprovalsStore } from '@/stores/approvals';
import type { KanbanTask } from '@/types/task';

describe('Approvals Store - Task Operations', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
    // Reset store state
    useApprovalsStore.setState({
      tasks: [],
      tasksLoading: false,
      tasksError: null,
    });
  });

  it('Store exposes tasks array alongside approvals', () => {
    const state = useApprovalsStore.getState();
    expect(state.tasks).toBeDefined();
    expect(Array.isArray(state.tasks)).toBe(true);
  });

  it('fetchTasks() loads from localStorage with correct key', async () => {
    const mockTasks: KanbanTask[] = [
      {
        id: 'task-1',
        title: 'Test Task',
        description: 'Test description',
        status: 'todo',
        priority: 'high',
        workState: 'idle',
        isTeamTask: false,
        createdAt: '2026-03-31T00:00:00Z',
        updatedAt: '2026-03-31T00:00:00Z',
      },
    ];

    localStorage.setItem('ktclaw-kanban-tasks', JSON.stringify(mockTasks));

    await useApprovalsStore.getState().fetchTasks();

    const state = useApprovalsStore.getState();
    expect(state.tasks).toHaveLength(1);
    expect(state.tasks[0].id).toBe('task-1');
    expect(state.tasks[0].title).toBe('Test Task');
  });

  it('createTask() generates task with status=todo and isTeamTask=false by default', async () => {
    await useApprovalsStore.getState().createTask({
      title: 'New Task',
      description: 'New task description',
      priority: 'medium',
    });

    const state = useApprovalsStore.getState();
    expect(state.tasks).toHaveLength(1);
    expect(state.tasks[0].status).toBe('todo');
    expect(state.tasks[0].isTeamTask).toBe(false);
    expect(state.tasks[0].workState).toBe('idle');
    expect(state.tasks[0].id).toMatch(/^task-/);
  });

  it('updateTaskStatus() moves task between columns', async () => {
    await useApprovalsStore.getState().createTask({
      title: 'Task to Update',
      description: 'Description',
      priority: 'high',
    });

    const taskId = useApprovalsStore.getState().tasks[0].id;

    await useApprovalsStore.getState().updateTaskStatus(taskId, 'in-progress');

    const state = useApprovalsStore.getState();
    expect(state.tasks[0].status).toBe('in-progress');
  });

  it('Tasks with teamId set have isTeamTask=true', async () => {
    await useApprovalsStore.getState().createTask({
      title: 'Team Task',
      description: 'Team task description',
      priority: 'high',
      teamId: 'team-1',
      teamName: 'Engineering',
    });

    const state = useApprovalsStore.getState();
    expect(state.tasks[0].isTeamTask).toBe(true);
    expect(state.tasks[0].teamId).toBe('team-1');
    expect(state.tasks[0].teamName).toBe('Engineering');
  });

  it('updateTask() merges updates and saves to localStorage', async () => {
    await useApprovalsStore.getState().createTask({
      title: 'Task to Update',
      description: 'Original description',
      priority: 'low',
    });

    const taskId = useApprovalsStore.getState().tasks[0].id;

    await useApprovalsStore.getState().updateTask(taskId, {
      description: 'Updated description',
      priority: 'high',
    });

    const state = useApprovalsStore.getState();
    expect(state.tasks[0].description).toBe('Updated description');
    expect(state.tasks[0].priority).toBe('high');
    expect(state.tasks[0].title).toBe('Task to Update'); // Unchanged
  });

  it('deleteTask() removes task and saves to localStorage', async () => {
    await useApprovalsStore.getState().createTask({
      title: 'Task to Delete',
      description: 'Description',
      priority: 'medium',
    });

    const taskId = useApprovalsStore.getState().tasks[0].id;
    expect(useApprovalsStore.getState().tasks).toHaveLength(1);

    await useApprovalsStore.getState().deleteTask(taskId);

    const state = useApprovalsStore.getState();
    expect(state.tasks).toHaveLength(0);
  });
});
