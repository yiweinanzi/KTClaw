/**
 * Task Kanban Page - Phase 02 Redesign
 * 4-column Agent swimlane layout with team task support
 */
import { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { useAgentsStore } from '@/stores/agents';
import { useApprovalsStore } from '@/stores/approvals';
import { useRightPanelStore } from '@/stores/rightPanelStore';
import type { KanbanTask, TaskStatus, WorkState } from '@/types/task';
import type { AgentSummary } from '@/types/agent';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ManualTaskForm } from './ManualTaskForm';

const COLUMNS: { key: TaskStatus; label: string }[] = [
  { key: 'todo', label: '待办' },
  { key: 'in-progress', label: '进行中' },
  { key: 'review', label: '审查' },
  { key: 'done', label: '完成' },
];

function getWorkStateDotColor(workState: WorkState): string {
  const colors: Record<WorkState, string> = {
    idle: 'bg-gray-400',
    starting: 'bg-blue-400',
    working: 'bg-blue-500',
    blocked: 'bg-red-500',
    waiting_approval: 'bg-yellow-500',
    scheduled: 'bg-purple-500',
    done: 'bg-green-500',
    failed: 'bg-red-600',
  };
  return colors[workState] || 'bg-gray-400';
}

function getWorkStateLabel(workState: WorkState, t: (key: string) => string): string {
  const labels: Record<WorkState, string> = {
    idle: t('kanban.workState.idle'),
    starting: t('kanban.workState.starting'),
    working: t('kanban.workState.working'),
    blocked: t('kanban.workState.blocked'),
    waiting_approval: t('kanban.workState.waitingApproval'),
    scheduled: t('kanban.workState.scheduled'),
    done: t('kanban.workState.done'),
    failed: t('kanban.workState.failed'),
  };
  return labels[workState] || workState;
}

function formatDate(dateString: string): string {
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  } catch {
    return dateString;
  }
}

interface TaskCardProps {
  task: KanbanTask;
  agents: AgentSummary[];
  onClick: (task: KanbanTask) => void;
}

function TaskCard({ task, agents, onClick }: TaskCardProps) {
  const { t } = useTranslation();
  const assignee = agents.find((a) => a.id === task.assigneeId);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Card
            className={cn(
              'w-[280px] min-h-[120px] p-4 cursor-pointer hover:shadow-md transition-shadow',
              task.isTeamTask && 'border-l-4 border-l-primary'
            )}
            onClick={() => onClick(task)}
          >
            <h3 className="text-sm font-semibold mb-2">
              {task.isTeamTask && task.teamName && `团队${task.teamName}：`}
              {task.title}
            </h3>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{assignee?.name || '未指派'}</span>
              {task.workState !== 'idle' && (
                <Badge variant="outline" className="flex items-center gap-1">
                  <span className={cn('h-2 w-2 rounded-full', getWorkStateDotColor(task.workState))} />
                  {getWorkStateLabel(task.workState, t)}
                </Badge>
              )}
            </div>
            {task.deadline && (
              <p className="text-xs text-muted-foreground mt-2">
                截止: {formatDate(task.deadline)}
              </p>
            )}
          </Card>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <div className="space-y-1 text-xs">
            <p><strong>创建时间:</strong> {new Date(task.createdAt).toLocaleString('zh-CN')}</p>
            <p><strong>更新时间:</strong> {new Date(task.updatedAt).toLocaleString('zh-CN')}</p>
            {task.workState !== 'idle' && (
              <p><strong>运行状态:</strong> {getWorkStateLabel(task.workState, t)}</p>
            )}
            {task.runtimeSessionId && (
              <p><strong>Session ID:</strong> {task.runtimeSessionId.slice(0, 16)}...</p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface AgentRowProps {
  agent: AgentSummary;
  tasks: KanbanTask[];
  allAgents: AgentSummary[];
  onTaskClick: (task: KanbanTask) => void;
}

function AgentRow({ agent, tasks, allAgents, onTaskClick }: AgentRowProps) {
  const { t } = useTranslation();
  const tasksByStatus = useMemo(() => {
    const map = new Map<TaskStatus, KanbanTask[]>();
    COLUMNS.forEach((col) => map.set(col.key, []));
    tasks.forEach((task) => {
      const list = map.get(task.status);
      if (list) list.push(task);
    });
    return map;
  }, [tasks]);

  const hasAnyTasks = tasks.length > 0;

  return (
    <div className="flex gap-4 border-b border-border py-4">
      <div className="w-32 shrink-0">
        <p className="text-sm font-medium">{agent.name}</p>
        <p className="text-xs text-muted-foreground">{agent.teamRole}</p>
      </div>
      {COLUMNS.map((col) => {
        const columnTasks = tasksByStatus.get(col.key) || [];
        return (
          <div key={col.key} className="flex-1 min-w-[280px]">
            {columnTasks.length > 0 ? (
              <div className="flex flex-col gap-2">
                {columnTasks.map((task) => (
                  <TaskCard key={task.id} task={task} agents={allAgents} onClick={onTaskClick} />
                ))}
              </div>
            ) : (
              !hasAnyTasks && col.key === 'todo' && (
                <p className="text-sm text-muted-foreground">{t('kanban.emptyAgent')}</p>
              )
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function TaskKanban() {
  const { t } = useTranslation();
  const agents = useAgentsStore((s) => s.agents) || [];
  const fetchAgents = useAgentsStore((s) => s.fetchAgents);
  const tasks = useApprovalsStore((s) => s.tasks) || [];
  const fetchTasks = useApprovalsStore((s) => s.fetchTasks);
  const openPanel = useRightPanelStore((s) => s.openPanel);
  const [manualFormOpen, setManualFormOpen] = useState(false);

  useEffect(() => {
    if (fetchAgents) fetchAgents();
    if (fetchTasks) fetchTasks();
  }, [fetchAgents, fetchTasks]);

  const tasksByAgent = useMemo(() => {
    const map = new Map<string, KanbanTask[]>();
    if (Array.isArray(agents)) {
      agents.forEach((agent) => map.set(agent.id, []));
    }
    if (Array.isArray(tasks)) {
      tasks.forEach((task) => {
        if (task.assigneeId && map.has(task.assigneeId)) {
          map.get(task.assigneeId)!.push(task);
        }
      });
    }
    return map;
  }, [agents, tasks]);

  const handleTaskClick = (task: KanbanTask) => {
    openPanel('task', task.id);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div>
          <h1 className="text-2xl font-semibold">{t('kanban.title')}</h1>
          <p className="text-sm text-muted-foreground">
            {t('kanban.subtitle', { count: Array.isArray(tasks) ? tasks.filter((t) => t.status === 'in-progress').length : 0 })}
          </p>
        </div>
        {/* Weakened manual creation entry (per D-29, UI-SPEC) */}
        <Button
          size="sm"
          variant="outline"
          onClick={() => setManualFormOpen(true)}
          className="gap-2"
        >
          <Plus className="h-4 w-4" />
          创建任务
        </Button>
      </div>
      <Tabs defaultValue="board" className="flex-1 flex flex-col overflow-hidden">
        <div className="px-4 pt-2">
          <TabsList>
            <TabsTrigger value="board">看板</TabsTrigger>
            <TabsTrigger value="calendar">日程</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="board" className="flex-1 overflow-auto m-0">
          <div className="p-4">
            <div className="flex gap-4 mb-4">
              <div className="w-32 shrink-0" />
              {COLUMNS.map((col) => (
                <div key={col.key} className="flex-1 min-w-[280px]">
                  <h2 className="text-sm font-semibold text-muted-foreground">{col.label}</h2>
                </div>
              ))}
            </div>
            {Array.isArray(agents) && agents.map((agent) => (
              <AgentRow key={agent.id} agent={agent} tasks={tasksByAgent.get(agent.id) || []} allAgents={agents} onTaskClick={handleTaskClick} />
            ))}
            {(!Array.isArray(agents) || agents.length === 0) && (
              <div className="text-center py-12 text-muted-foreground">
                <p>暂无 Agent</p>
                <p className="text-sm">在员工广场创建 Agent 后显示</p>
              </div>
            )}
          </div>
        </TabsContent>
        <TabsContent value="calendar" className="flex-1 overflow-auto m-0">
          <div className="p-4 text-center text-muted-foreground">
            <p>日程视图</p>
            <p className="text-sm">将在后续计划中实现</p>
          </div>
        </TabsContent>
      </Tabs>
      <ManualTaskForm open={manualFormOpen} onOpenChange={setManualFormOpen} />
    </div>
  );
}

