/**
 * Task type definitions for KTClaw Kanban board
 * Phase 02: Task Board Redesign
 */

/**
 * Task status - 4 columns (backlog merged into todo per D-01)
 */
export type TaskStatus = 'todo' | 'in-progress' | 'review' | 'done';

/**
 * Task priority levels
 */
export type TaskPriority = 'low' | 'medium' | 'high';

/**
 * Work state - runtime execution status
 */
export type WorkState =
  | 'idle'
  | 'starting'
  | 'working'
  | 'blocked'
  | 'waiting_approval'
  | 'scheduled'
  | 'done'
  | 'failed';

/**
 * Kanban task with team metadata and runtime fields
 */
export interface KanbanTask {
  // Core fields
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId?: string;
  assigneeRole?: string;
  workState: WorkState;

  // Team metadata (D-13, D-14)
  teamId?: string;
  teamName?: string;
  isTeamTask: boolean;

  // Runtime fields (preserve from existing KanbanTicket)
  workStartedAt?: string;
  workError?: string;
  workResult?: string;
  runtimeSessionId?: string;
  runtimeParentSessionId?: string;
  runtimeRootSessionId?: string;
  runtimeDepth?: number;
  runtimeSessionKey?: string;
  runtimeParentSessionKey?: string;
  runtimeLineageSessionKeys?: string[];
  runtimeHistory?: Array<{ role: string; content: string }>;
  runtimeTranscript?: string[];
  runtimeChildSessionIds?: string[];

  // Cron fields (preserve from existing)
  cronJobId?: string;
  cronScheduleKind?: string;
  cronBaselineJobIds?: string[];
  cronNextRunAt?: string;
  cronLastRunAt?: string;

  // Timestamps
  createdAt: string;
  updatedAt: string;
  deadline?: string;
}
