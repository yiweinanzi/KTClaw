/**
 * CalendarView component for Task Kanban
 * Phase 02 Plan 02 Task 2 - Calendar view with FullCalendar integration
 */
import { useMemo } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { useApprovalsStore } from '@/stores/approvals';
import { useAgentsStore } from '@/stores/agents';
import type { EventInput } from '@fullcalendar/core';

interface CalendarViewProps {
  onTaskClick?: (taskId: string) => void;
}

export function CalendarView({ onTaskClick }: CalendarViewProps) {
  const tasks = useApprovalsStore((s) => s.tasks);
  const agents = useAgentsStore((s) => s.agents);

  // Filter tasks with deadlines and convert to calendar events (per D-08, D-10)
  const events = useMemo<EventInput[]>(() => {
    return tasks
      .filter((task) => task.deadline) // Only tasks with deadlines (D-08)
      .map((task) => {
        const agent = agents.find((a) => a.id === task.assigneeId);
        return {
          id: task.id,
          title: task.isTeamTask ? `团队${task.teamName}：${task.title}` : task.title,
          start: task.deadline,
          allDay: true,
          backgroundColor: task.isTeamTask ? 'hsl(var(--primary))' : 'hsl(var(--secondary))',
          borderColor: task.isTeamTask ? 'hsl(var(--primary))' : 'hsl(var(--border))',
          extendedProps: {
            taskId: task.id,
            assigneeName: agent?.name ?? '未分配',
            priority: task.priority,
            status: task.status,
          },
        };
      });
  }, [tasks, agents]);

  // Empty state (per UI-SPEC copywriting)
  if (events.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <p className="text-lg font-medium text-muted-foreground">暂无排期任务</p>
          <p className="text-sm text-muted-foreground mt-2">
            为任务设置截止日期后,将在日程视图中显示
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full p-4">
      <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView="dayGridMonth" // Default to month view (per UI-SPEC user choice B)
        headerToolbar={{
          left: 'prev,next today',
          center: 'title',
          right: 'timeGridWeek,dayGridMonth,dayGridYear', // Week/Month/Year toggle (D-07)
        }}
        events={events}
        eventClick={(info) => {
          if (onTaskClick) {
            onTaskClick(info.event.id);
          }
        }}
        height="100%"
        locale="zh-cn"
        buttonText={{
          today: '今天',
          month: '月视图',
          week: '周视图',
          year: '年视图',
        }}
        // Historical events preserved (D-09) - FullCalendar handles this by default
      />
    </div>
  );
}
