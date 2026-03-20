/**
 * Task Kanban Page — Frame 05
 * 任务看板 / 自动化工作流：拖拽式任务管理
 */
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { useAgentsStore } from '@/stores/agents';
import { useApprovalsStore } from '@/stores/approvals';
import type { AgentSummary } from '@/types/agent';

/* ─── Types ─── */

type TicketStatus = 'backlog' | 'todo' | 'in-progress' | 'review' | 'done';
type TicketPriority = 'low' | 'medium' | 'high';
type WorkState = 'idle' | 'starting' | 'working' | 'done' | 'failed';

interface KanbanTicket {
  id: string;
  title: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  assigneeId?: string;
  workState: WorkState;
  workStartedAt?: string;
  workError?: string;
  workResult?: string;
  createdAt: string;
  updatedAt: string;
}

/* ─── Persistence ─── */

const STORAGE_KEY = 'clawport-kanban';

function loadTickets(): KanbanTicket[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as KanbanTicket[]) : [];
  } catch {
    return [];
  }
}

function saveTickets(tickets: KanbanTicket[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tickets));
}

function createTicket(input: { title: string; description: string; priority: TicketPriority; assigneeId?: string }): KanbanTicket {
  const now = new Date().toISOString();
  return {
    id: `ticket-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title: input.title,
    description: input.description,
    status: 'backlog',
    priority: input.priority,
    assigneeId: input.assigneeId,
    workState: 'idle',
    createdAt: now,
    updatedAt: now,
  };
}

/* ─── Constants ─── */

const COLUMNS: { key: TicketStatus; label: string }[] = [
  { key: 'backlog',     label: 'Backlog 积压' },
  { key: 'todo',        label: 'To Do 待办' },
  { key: 'in-progress', label: 'In Progress 进行中' },
  { key: 'review',      label: 'Review 审查' },
  { key: 'done',        label: 'Done 完成' },
];

const PRIORITY_STYLES: Record<TicketPriority, { dot: string; text: string; bg: string; label: string }> = {
  high:   { dot: '#ef4444', text: '#ef4444', bg: '#fef2f2', label: '高优' },
  medium: { dot: '#f59e0b', text: '#d97706', bg: '#fffbeb', label: '中优' },
  low:    { dot: '#10b981', text: '#059669', bg: '#f0fdf4', label: '低优' },
};

const WORK_STATE_STYLES: Record<WorkState, { label: string; color: string }> = {
  idle:     { label: '',       color: '' },
  starting: { label: '启动中', color: '#f59e0b' },
  working:  { label: '执行中', color: '#3b82f6' },
  done:     { label: '已完成', color: '#10b981' },
  failed:   { label: '失败',   color: '#ef4444' },
};

/* ─── Agent color helper ─── */

const AGENT_COLORS = ['#10b981', '#3b82f6', '#8b5cf6', '#f97316', '#ef4444', '#06b6d4'];
function agentColor(idx: number) { return AGENT_COLORS[idx % AGENT_COLORS.length]; }

/* ─── Main component ─── */

export function TaskKanban() {
  const [tickets, setTickets] = useState<KanbanTicket[]>(() => loadTickets());
  const [filterAgentId, setFilterAgentId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailTicket, setDetailTicket] = useState<KanbanTicket | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<TicketStatus | null>(null);

  const { agents, fetchAgents } = useAgentsStore();
  const { approvals, fetchApprovals, approveItem, rejectItem } = useApprovalsStore();

  useEffect(() => { void fetchAgents(); }, [fetchAgents]);
  useEffect(() => { void fetchApprovals(); }, [fetchApprovals]);

  // Persist on every change
  useEffect(() => { saveTickets(tickets); }, [tickets]);

  const updateTicket = (id: string, updates: Partial<KanbanTicket>) => {
    setTickets((prev) =>
      prev.map((t) => t.id === id ? { ...t, ...updates, updatedAt: new Date().toISOString() } : t)
    );
    if (detailTicket?.id === id) {
      setDetailTicket((prev) => prev ? { ...prev, ...updates, updatedAt: new Date().toISOString() } : prev);
    }
  };

  const deleteTicket = (id: string) => {
    setTickets((prev) => prev.filter((t) => t.id !== id));
    if (detailTicket?.id === id) setDetailTicket(null);
  };

  const moveTicket = (id: string, status: TicketStatus) => {
    updateTicket(id, { status });
  };

  const handleCreate = (input: { title: string; description: string; priority: TicketPriority; assigneeId?: string }) => {
    const ticket = createTicket(input);
    setTickets((prev) => [ticket, ...prev]);
    setCreateOpen(false);
  };

  /* Drag handlers */
  const handleDragStart = (id: string) => setDragId(id);
  const handleDragEnd = () => { setDragId(null); setDragOverCol(null); };
  const handleDrop = (col: TicketStatus) => {
    if (dragId) moveTicket(dragId, col);
    setDragId(null);
    setDragOverCol(null);
  };

  const filtered = filterAgentId
    ? tickets.filter((t) => t.assigneeId === filterAgentId)
    : tickets;

  const activeCount = tickets.filter((t) => t.status !== 'done').length;

  return (
    <div className="flex h-full flex-col bg-[#f2f2f7] p-6">
      <div className="flex flex-1 flex-col overflow-hidden rounded-2xl bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">

        {/* Header */}
        <div className="flex shrink-0 items-start justify-between px-8 pb-5 pt-8">
          <div>
            <h1 className="text-[26px] font-semibold text-[#000000]">任务看板 Kanban</h1>
            <p className="mt-1 text-[13px] text-[#8e8e93]">{activeCount} 个活跃任务</p>
          </div>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-1.5 rounded-lg bg-[#ef4444] px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#dc2626]"
          >
            + 新建任务
          </button>
        </div>

        {/* Pending Approvals */}
        {approvals.length > 0 && (
          <ApprovalsSection
            approvals={approvals}
            onApprove={(id) => void approveItem(id)}
            onReject={(id, reason) => void rejectItem(id, reason)}
          />
        )}

        {/* Agent filter pills */}
        <div className="flex shrink-0 items-center gap-2 overflow-x-auto px-8 pb-5">
          <button
            type="button"
            onClick={() => setFilterAgentId(null)}
            className={cn(
              'flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors',
              filterAgentId === null
                ? 'bg-[#10b981] text-white'
                : 'border border-black/10 bg-white text-[#3c3c43] hover:bg-[#f2f2f7]',
            )}
          >
            全部任务
          </button>
          {agents.map((agent, idx) => (
            <button
              key={agent.id}
              type="button"
              onClick={() => setFilterAgentId(agent.id)}
              className={cn(
                'flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors',
                filterAgentId === agent.id
                  ? 'bg-[#10b981] text-white'
                  : 'border border-black/10 bg-white text-[#3c3c43] hover:bg-[#f2f2f7]',
              )}
            >
              <span className="h-2 w-2 rounded-full" style={{ background: agentColor(idx) }} />
              {agent.name}
            </button>
          ))}
        </div>

        {/* Kanban columns */}
        <div className="flex min-h-0 flex-1 gap-4 overflow-x-auto px-8 pb-6">
          {COLUMNS.map((col) => {
            const colTickets = filtered.filter((t) => t.status === col.key);
            const isOver = dragOverCol === col.key;
            return (
              <div
                key={col.key}
                className="flex w-[280px] shrink-0 flex-col"
                onDragOver={(e) => { e.preventDefault(); setDragOverCol(col.key); }}
                onDragLeave={() => setDragOverCol(null)}
                onDrop={() => handleDrop(col.key)}
              >
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-[14px] font-semibold text-[#000000]">{col.label}</span>
                  <span className="text-[13px] text-[#8e8e93]">{colTickets.length}</span>
                </div>
                <div className={cn(
                  'flex min-h-[120px] flex-1 flex-col gap-3 rounded-xl p-3 transition-colors',
                  isOver ? 'bg-[#f0f7ff] ring-2 ring-[#007aff]/30' : 'bg-[#f9f9f9]',
                )}>
                  {colTickets.length === 0 ? (
                    <div className="flex items-center justify-center py-8 text-[13px] text-[#c6c6c8]">
                      拖拽到此处
                    </div>
                  ) : (
                    colTickets.map((ticket) => (
                      <TicketCard
                        key={ticket.id}
                        ticket={ticket}
                        agents={agents}
                        isDragging={dragId === ticket.id}
                        onClick={() => setDetailTicket(ticket)}
                        onDragStart={() => handleDragStart(ticket.id)}
                        onDragEnd={handleDragEnd}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Create modal */}
      {createOpen && (
        <CreateModal
          agents={agents}
          onClose={() => setCreateOpen(false)}
          onCreate={handleCreate}
        />
      )}

      {/* Detail panel */}
      {detailTicket && (
        <DetailPanel
          ticket={detailTicket}
          agents={agents}
          onClose={() => setDetailTicket(null)}
          onUpdate={(updates) => updateTicket(detailTicket.id, updates)}
          onDelete={() => deleteTicket(detailTicket.id)}
        />
      )}
    </div>
  );
}

/* ─── Ticket Card ─── */

function TicketCard({
  ticket, agents, isDragging, onClick, onDragStart, onDragEnd,
}: {
  ticket: KanbanTicket;
  agents: AgentSummary[];
  isDragging: boolean;
  onClick: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const p = PRIORITY_STYLES[ticket.priority];
  const agentIdx = agents.findIndex((a) => a.id === ticket.assigneeId);
  const agent = agentIdx >= 0 ? agents[agentIdx] : null;
  const color = agent ? agentColor(agentIdx) : '#8e8e93';
  const ws = WORK_STATE_STYLES[ticket.workState];

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className={cn(
        'cursor-pointer rounded-xl bg-white p-3.5 shadow-[0_1px_3px_rgba(0,0,0,0.06)] transition-all hover:shadow-[0_2px_8px_rgba(0,0,0,0.1)]',
        isDragging && 'opacity-40 scale-95',
      )}
      style={{ borderLeft: `3px solid ${color}` }}
    >
      {agent && (
        <div className="mb-2 flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: color }} />
          <span className="text-[12px] font-medium" style={{ color }}>{agent.name}</span>
        </div>
      )}
      <p className="mb-1 text-[14px] font-semibold leading-snug text-[#000000]">{ticket.title}</p>
      {ticket.description && (
        <p className="mb-3 line-clamp-2 text-[12px] leading-snug text-[#8e8e93]">{ticket.description}</p>
      )}
      <div className="flex items-center justify-between">
        <span
          className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
          style={{ background: p.bg, color: p.text }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: p.dot }} />
          {p.label}
        </span>
        {ws.label && (
          <span className="text-[11px] font-medium" style={{ color: ws.color }}>{ws.label}</span>
        )}
      </div>
    </div>
  );
}

/* ─── Create Modal ─── */

function CreateModal({
  agents, onClose, onCreate,
}: {
  agents: AgentSummary[];
  onClose: () => void;
  onCreate: (input: { title: string; description: string; priority: TicketPriority; assigneeId?: string }) => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TicketPriority>('medium');
  const [assigneeId, setAssigneeId] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleSubmit = () => {
    if (!title.trim()) return;
    onCreate({ title: title.trim(), description: description.trim(), priority, assigneeId: assigneeId || undefined });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="w-[420px] rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-[16px] font-semibold text-[#000000]">新建任务</h2>
        <div className="mb-3">
          <p className="mb-1.5 text-[13px] font-medium text-[#000000]">任务标题</p>
          <input
            ref={inputRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            placeholder="简短描述任务目标..."
            className="w-full rounded-lg border border-black/10 px-3 py-2 text-[13px] outline-none focus:border-[#007aff]"
          />
        </div>
        <div className="mb-3">
          <p className="mb-1.5 text-[13px] font-medium text-[#000000]">任务描述</p>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="详细说明..."
            rows={3}
            className="w-full resize-none rounded-lg border border-black/10 px-3 py-2 text-[13px] outline-none focus:border-[#007aff]"
          />
        </div>
        <div className="mb-3">
          <p className="mb-1.5 text-[13px] font-medium text-[#000000]">优先级</p>
          <div className="flex gap-2">
            {(['high', 'medium', 'low'] as TicketPriority[]).map((p) => {
              const s = PRIORITY_STYLES[p];
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriority(p)}
                  className={cn(
                    'flex-1 rounded-lg border py-1.5 text-[13px] font-medium transition-colors',
                    priority === p ? 'border-transparent' : 'border-black/10 bg-white',
                  )}
                  style={priority === p ? { background: s.bg, color: s.text, borderColor: s.dot } : { color: s.text }}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>
        {agents.length > 0 && (
          <div className="mb-5">
            <p className="mb-1.5 text-[13px] font-medium text-[#000000]">指派 Agent</p>
            <select
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              className="w-full appearance-none rounded-lg border border-black/10 bg-white px-3 py-2 text-[13px] text-[#000000] outline-none focus:border-[#007aff]"
            >
              <option value="">不指派</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
        )}
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-black/10 py-2 text-[13px] text-[#3c3c43] hover:bg-[#f2f2f7]">取消</button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!title.trim()}
            className="flex-1 rounded-xl bg-[#ef4444] py-2 text-[13px] font-medium text-white hover:bg-[#dc2626] disabled:opacity-50"
          >
            创建任务
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Detail Panel ─── */

function DetailPanel({
  ticket, agents, onClose, onUpdate, onDelete,
}: {
  ticket: KanbanTicket;
  agents: AgentSummary[];
  onClose: () => void;
  onUpdate: (updates: Partial<KanbanTicket>) => void;
  onDelete: () => void;
}) {
  const agentIdx = agents.findIndex((a) => a.id === ticket.assigneeId);
  const agent = agentIdx >= 0 ? agents[agentIdx] : null;
  const color = agent ? agentColor(agentIdx) : '#8e8e93';
  const p = PRIORITY_STYLES[ticket.priority];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/20" onClick={onClose}>
      <div
        className="flex h-full w-[380px] flex-col bg-white shadow-[-4px_0_24px_rgba(0,0,0,0.08)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-black/[0.06] px-5 py-4">
          <span className="text-[14px] font-semibold text-[#000000]">任务详情</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onDelete}
              className="rounded-md border border-[#ef4444]/20 px-2.5 py-1 text-[12px] text-[#ef4444] hover:bg-[#fef2f2]"
            >
              删除
            </button>
            <button type="button" onClick={onClose} className="text-[18px] text-[#8e8e93] hover:text-[#3c3c43]">×</button>
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
          <div>
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-[#8e8e93]">标题</p>
            <p className="text-[15px] font-semibold text-[#000000]">{ticket.title}</p>
          </div>

          {ticket.description && (
            <div>
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-[#8e8e93]">描述</p>
              <p className="text-[13px] leading-relaxed text-[#3c3c43]">{ticket.description}</p>
            </div>
          )}

          <div className="flex gap-4">
            <div>
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-[#8e8e93]">优先级</p>
              <span
                className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-medium"
                style={{ background: p.bg, color: p.text }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: p.dot }} />
                {p.label}
              </span>
            </div>
            <div>
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-[#8e8e93]">状态</p>
              <span className="text-[13px] text-[#3c3c43]">
                {COLUMNS.find((c) => c.key === ticket.status)?.label ?? ticket.status}
              </span>
            </div>
          </div>

          {agent && (
            <div>
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-[#8e8e93]">指派 Agent</p>
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
                <span className="text-[13px] font-medium" style={{ color }}>{agent.name}</span>
              </div>
            </div>
          )}

          {ticket.workState !== 'idle' && (
            <div>
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-[#8e8e93]">执行状态</p>
              <span className="text-[13px] font-medium" style={{ color: WORK_STATE_STYLES[ticket.workState].color }}>
                {WORK_STATE_STYLES[ticket.workState].label}
              </span>
              {ticket.workError && (
                <p className="mt-1 text-[12px] text-[#ef4444]">{ticket.workError}</p>
              )}
              {ticket.workResult && (
                <p className="mt-1 text-[12px] text-[#3c3c43]">{ticket.workResult}</p>
              )}
            </div>
          )}

          {/* Move to column */}
          <div>
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-[#8e8e93]">移动到</p>
            <div className="flex flex-wrap gap-2">
              {COLUMNS.filter((c) => c.key !== ticket.status).map((col) => (
                <button
                  key={col.key}
                  type="button"
                  onClick={() => onUpdate({ status: col.key })}
                  className="rounded-lg border border-black/10 px-3 py-1.5 text-[12px] text-[#3c3c43] hover:bg-[#f2f2f7]"
                >
                  {col.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default TaskKanban;

/* ─── Approvals Section ─── */

import type { ApprovalItem } from '@/stores/approvals';

function ApprovalsSection({
  approvals,
  onApprove,
  onReject,
}: {
  approvals: ApprovalItem[];
  onApprove: (id: string) => void;
  onReject: (id: string, reason: string) => void;
}) {
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  return (
    <div className="shrink-0 border-b border-black/[0.06] px-8 pb-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#f59e0b] text-[11px] font-bold text-white">
          {approvals.length}
        </span>
        <span className="text-[13px] font-semibold text-[#000000]">待审批 Approvals</span>
      </div>
      <div className="flex flex-col gap-2">
        {approvals.map((item) => (
          <div
            key={item.id}
            className="flex items-start justify-between gap-4 rounded-xl border border-[#f59e0b]/30 bg-[#fffbeb] px-4 py-3"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-[#000000]">
                {item.command ?? item.prompt ?? item.id}
              </p>
              {item.agentId && (
                <p className="mt-0.5 text-[11px] text-[#8e8e93]">Agent: {item.agentId}</p>
              )}
              {(item.createdAt ?? item.requestedAt) && (
                <p className="mt-0.5 text-[11px] text-[#8e8e93]">
                  {new Date(item.createdAt ?? item.requestedAt ?? '').toLocaleString('zh-CN')}
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {rejectingId === item.id ? (
                <>
                  <input
                    autoFocus
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="拒绝原因..."
                    className="w-[140px] rounded-lg border border-black/10 px-2 py-1 text-[12px] outline-none focus:border-[#007aff]"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (rejectReason.trim()) {
                        onReject(item.id, rejectReason.trim());
                        setRejectingId(null);
                        setRejectReason('');
                      }
                    }}
                    className="rounded-lg bg-[#ef4444] px-2.5 py-1 text-[12px] font-medium text-white hover:bg-[#dc2626]"
                  >
                    确认
                  </button>
                  <button
                    type="button"
                    onClick={() => { setRejectingId(null); setRejectReason(''); }}
                    className="rounded-lg border border-black/10 px-2.5 py-1 text-[12px] text-[#3c3c43] hover:bg-[#f2f2f7]"
                  >
                    取消
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => onApprove(item.id)}
                    className="rounded-lg bg-[#10b981] px-2.5 py-1 text-[12px] font-medium text-white hover:bg-[#059669]"
                  >
                    批准
                  </button>
                  <button
                    type="button"
                    onClick={() => setRejectingId(item.id)}
                    className="rounded-lg border border-[#ef4444]/30 px-2.5 py-1 text-[12px] text-[#ef4444] hover:bg-[#fef2f2]"
                  >
                    拒绝
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
