import { create } from 'zustand';
import { hostApiFetch } from '@/lib/host-api';
import type { KanbanTask, TaskStatus, TaskPriority } from '@/types/task';

const TASK_STORAGE_KEY = 'ktclaw-kanban-tasks';

export interface ApprovalItem {
  id: string;
  key?: string;
  sessionKey?: string;
  agentId?: string;
  state?: string;
  status?: string;
  decision?: string;
  command?: string;
  prompt?: string;
  reason?: string;
  createdAt?: string;
  requestedAt?: string;
  updatedAt?: string;
  expiresAt?: string;
  toolInput?: Record<string, unknown>;
}

interface ApprovalsState {
  // Approvals fields
  approvals: ApprovalItem[];
  loading: boolean;
  error: string | null;
  fetchApprovals: () => Promise<void>;
  approveItem: (id: string, reason?: string) => Promise<void>;
  rejectItem: (id: string, reason: string) => Promise<void>;

  // Task fields
  tasks: KanbanTask[];
  tasksLoading: boolean;
  tasksError: string | null;
  fetchTasks: () => Promise<void>;
  createTask: (input: {
    title: string;
    description: string;
    priority: TaskPriority;
    assigneeId?: string;
    assigneeRole?: string;
    teamId?: string;
    teamName?: string;
    deadline?: string;
  }) => Promise<void>;
  updateTaskStatus: (taskId: string, status: TaskStatus) => Promise<void>;
  updateTask: (taskId: string, updates: Partial<KanbanTask>) => Promise<void>;
  deleteTask: (taskId: string) => Promise<void>;
}

export const useApprovalsStore = create<ApprovalsState>((set, get) => ({
  // Approvals state
  approvals: [],
  loading: false,
  error: null,

  // Task state
  tasks: [],
  tasksLoading: false,
  tasksError: null,

  fetchApprovals: async () => {
    set({ loading: true, error: null });
    try {
      const data = await hostApiFetch<{ approvals?: ApprovalItem[] }>('/api/approvals');
      const raw = Array.isArray(data?.approvals) ? data.approvals : [];
      // Normalise: ensure every item has an id field
      const approvals = raw.map((item) => ({
        ...item,
        id: item.id ?? item.key ?? String(Math.random()),
      }));
      set({ approvals, loading: false });
    } catch (err) {
      set({ loading: false, error: String(err) });
    }
  },

  fetchTasks: async () => {
    set({ tasksLoading: true, tasksError: null });
    try {
      const stored = localStorage.getItem(TASK_STORAGE_KEY);
      const tasks: KanbanTask[] = stored ? JSON.parse(stored) : [];
      set({ tasks, tasksLoading: false });
    } catch (err) {
      set({ tasksLoading: false, tasksError: String(err) });
    }
  },

  createTask: async (input) => {
    const now = new Date().toISOString();
    const id = `task-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    const newTask: KanbanTask = {
      id,
      title: input.title,
      description: input.description,
      status: 'todo',
      priority: input.priority,
      assigneeId: input.assigneeId,
      assigneeRole: input.assigneeRole,
      workState: 'idle',
      teamId: input.teamId,
      teamName: input.teamName,
      isTeamTask: !!input.teamId,
      deadline: input.deadline,
      createdAt: now,
      updatedAt: now,
    };

    const tasks = [...get().tasks, newTask];
    localStorage.setItem(TASK_STORAGE_KEY, JSON.stringify(tasks));
    set({ tasks });
  },

  updateTaskStatus: async (taskId, status) => {
    const tasks = get().tasks.map((task) =>
      task.id === taskId
        ? { ...task, status, updatedAt: new Date().toISOString() }
        : task
    );
    localStorage.setItem(TASK_STORAGE_KEY, JSON.stringify(tasks));
    set({ tasks });
  },

  updateTask: async (taskId, updates) => {
    const tasks = get().tasks.map((task) =>
      task.id === taskId
        ? { ...task, ...updates, updatedAt: new Date().toISOString() }
        : task
    );
    localStorage.setItem(TASK_STORAGE_KEY, JSON.stringify(tasks));
    set({ tasks });
  },

  deleteTask: async (taskId) => {
    const tasks = get().tasks.filter((task) => task.id !== taskId);
    localStorage.setItem(TASK_STORAGE_KEY, JSON.stringify(tasks));
    set({ tasks });
  },

  approveItem: async (id: string, reason?: string) => {
    await hostApiFetch('/api/approvals/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approvalId: id, reason }),
    });
    await get().fetchApprovals();
  },

  rejectItem: async (id: string, reason: string) => {
    await hostApiFetch('/api/approvals/reject', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approvalId: id, reason }),
    });
    await get().fetchApprovals();
  },
}));
