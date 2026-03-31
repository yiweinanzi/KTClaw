/**
 * Task Kanban Page - Phase 02 Redesign
 * 4-column Agent swimlane layout with team task support
 */
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useAgentsStore } from '@/stores/agents';
import { useApprovalsStore } from '@/stores/approvals';
import { useRightPanelStore } from '@/stores/rightPanelStore';
import type { KanbanTask, TaskStatus, TaskPriority } from '@/types/task';
import type { AgentSummary } from '@/types/agent';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ManualTaskForm } from './ManualTaskForm';
import { CalendarView } from './CalendarView';

const COLUMNS: { key: TaskStatus; label: string }[] = [
  { key: 'todo', label: '待办' },
  { key: 'in-progress', label: '进行中' },
  { key: 'review', label: '审查' },
  { key: 'done', label: '完成' },
];

function getTaskBorderColor(task: KanbanTask): string {
  // Priority: team/employee > priority > status
  if (task.isTeamTask) return 'border-l-purple-500';

  // Priority-based colors
  if (task.priority === 'high') return 'border-l-blue-600';

  // Status-based colors
  if (task.status === 'in-progress') return 'border-l-green-500';
  if (task.status === 'review') return 'border-l-orange-500';

  // Default: employee task color
  return 'border-l-cyan-500';
}

function getPriorityLabel(priority: TaskPriority): string {
  const labels: Record<TaskPriority, string> = {
    low: '低',
    medium: '中',
    high: '高',
  };
  return labels[priority];
}

interface TaskCardProps {
  task: KanbanTask;
  onClick: (task: KanbanTask) => void;
}

function TaskCard({ task, onClick }: TaskCardProps) {
  return (
    <Card
      className={cn(
        'bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow cursor-pointer p-3 border-l-4',
        getTaskBorderColor(task)
      )}
      onClick={() => onClick(task)}
    >
      <h3 className="text-sm font-medium mb-1 line-clamp-2">
        {task.isTeamTask && task.teamName && `团队${task.teamName}：`}
        {task.title}
      </h3>
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <span>优先级: {getPriorityLabel(task.priority)}</span>
        {task.deadline && (
          <span>• {new Date(task.deadline).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })}</span>
        )}
      </div>
    </Card>
  );
}

interface AgentRowProps {
  agent: AgentSummary;
  tasks: KanbanTask[];
  onTaskClick: (task: KanbanTask) => void;
}

function AgentRow({ agent, tasks, onTaskClick }: AgentRowProps) {
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
  const isTeam = agent.teamRole === 'leader';

  return (
    <div className="flex gap-3 border-b border-gray-100 py-4 min-h-[120px]">
      {/* Agent Info Column */}
      <div className="w-[150px] shrink-0 flex flex-col items-center gap-2">
        <Avatar className="h-10 w-10">
          <AvatarFallback className={cn(isTeam ? 'bg-purple-100 text-purple-700' : 'bg-cyan-100 text-cyan-700')}>
            {agent.name.slice(0, 2)}
          </AvatarFallback>
        </Avatar>
        <div className="text-center">
          <p className="text-sm font-medium">{agent.name}</p>
          <Badge variant="outline" className={cn('text-xs mt-1', isTeam ? 'border-purple-500 text-purple-700' : 'border-cyan-500 text-cyan-700')}>
            {isTeam ? 'Team' : '员工'}
          </Badge>
        </div>
      </div>

      {/* Task Columns */}
      {COLUMNS.map((col) => {
        const columnTasks = tasksByStatus.get(col.key) || [];
        return (
          <div key={col.key} className="flex-1 min-w-[240px] max-w-[300px]">
            {columnTasks.length > 0 ? (
              <div className="flex flex-col gap-2">
                {columnTasks.map((task) => (
                  <TaskCard key={task.id} task={task} onClick={onTaskClick} />
                ))}
              </div>
            ) : (
              !hasAnyTasks && col.key === 'todo' && (
                <div className="text-center py-4">
                  <p className="text-sm text-gray-400">空闲中</p>
                </div>
              )
            )}
          </div>
        );
      })}
    </div>
  );
}

export function TaskKanban() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const agents = useAgentsStore((s) => s.agents) || [];
  const fetchAgents = useAgentsStore((s) => s.fetchAgents);
  const tasks = useApprovalsStore((s) => s.tasks) || [];
  const fetchTasks = useApprovalsStore((s) => s.fetchTasks);
  const openPanel = useRightPanelStore((s) => s.openPanel);
  const [manualFormOpen, setManualFormOpen] = useState(false);

  const currentView = searchParams.get('view') || 'board';

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

  const inProgressCount = Array.isArray(tasks) ? tasks.filter((t) => t.status === 'in-progress').length : 0;

  const handleTaskClick = (task: KanbanTask) => {
    openPanel('task', task.id);
  };

  const handleViewChange = (view: string) => {
    setSearchParams({ view });
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-gray-50">
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-white border-b border-gray-200">
        <div>
          <h1 className="text-2xl font-semibold">任务看板</h1>
          <p className="text-sm text-gray-500">{inProgressCount} 个进行中的任务</p>
        </div>
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

      {/* Tabs */}
      <Tabs value={currentView} onValueChange={handleViewChange} className="flex-1 flex flex-col overflow-hidden">
        <div className="px-4 pt-3 bg-white">
          <TabsList>
            <TabsTrigger value="board">看板</TabsTrigger>
            <TabsTrigger value="calendar">日程</TabsTrigger>
          </TabsList>
        </div>

        {/* Board View */}
        <TabsContent value="board" className="flex-1 overflow-auto m-0 p-4">
          {/* Column Headers */}
          <div className="flex gap-3 mb-2 sticky top-0 bg-gray-50 pb-2 z-10">
            <div className="w-[150px] shrink-0" />
            {COLUMNS.map((col) => (
              <div key={col.key} className="flex-1 min-w-[240px] max-w-[300px]">
                <h2 className="text-sm font-semibold text-gray-700">{col.label}</h2>
              </div>
            ))}
          </div>

          {/* Agent Rows */}
          <div className="space-y-0">
            {Array.isArray(agents) && agents.length > 0 ? (
              agents.map((agent) => (
                <AgentRow
                  key={agent.id}
                  agent={agent}
                  tasks={tasksByAgent.get(agent.id) || []}
                  onTaskClick={handleTaskClick}
                />
              ))
            ) : (
              <div className="text-center py-12 text-gray-400">
                <p>暂无 Agent</p>
                <p className="text-sm mt-1">在员工广场创建 Agent 后显示</p>
              </div>
            )}
          </div>

          {/* Legend */}
          <div className="mt-6 pt-4 border-t border-gray-200 flex items-center gap-6 text-xs text-gray-600">
            <span className="font-medium">图例：</span>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded border-2 border-purple-500" />
              <span>团队</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded border-2 border-cyan-500" />
              <span>员工</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-0.5 bg-blue-600" />
              <span>高优</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-0.5 bg-green-500" />
              <span>进行</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-0.5 bg-orange-500" />
              <span>审查</span>
            </div>
          </div>
        </TabsContent>

        {/* Calendar View */}
        <TabsContent value="calendar" className="flex-1 overflow-auto m-0">
          <CalendarView onTaskClick={(taskId) => openPanel('task', taskId)} />
        </TabsContent>
      </Tabs>

      <ManualTaskForm open={manualFormOpen} onOpenChange={setManualFormOpen} />
    </div>
  );
}
