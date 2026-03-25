/**
 * Cron Page — Frame 06
 * 定时任务 / Cron 总览：自动化执行调度
 */
import { Fragment, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { useCronStore } from '@/stores/cron';
import type { CronJob } from '@/types/cron';

/* ─── Helpers ─── */

function formatSchedule(schedule: CronJob['schedule']): string {
  if (typeof schedule === 'string') return schedule;
  if (schedule.kind === 'cron') return schedule.expr;
  if (schedule.kind === 'every') {
    const ms = schedule.everyMs;
    if (ms < 60_000) return `每 ${ms / 1000}秒`;
    if (ms < 3_600_000) return `每 ${ms / 60_000}分钟`;
    if (ms < 86_400_000) return `每 ${ms / 3_600_000}小时`;
    return `每 ${ms / 86_400_000}天`;
  }
  if (schedule.kind === 'at') return `固定时间 ${schedule.at}`;
  return '—';
}

function formatTime(iso?: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

function formatDelivery(job: CronJob): string {
  const delivery = job.delivery;
  if (!delivery || delivery.mode === 'none') return 'Chat only';
  if (delivery.channel) {
    return delivery.to
      ? `${delivery.channel} → ${delivery.to}`
      : delivery.channel;
  }
  return delivery.mode;
}

function formatSessionTarget(sessionTarget?: string): string {
  if (!sessionTarget) return 'default';
  return sessionTarget;
}

/* ─── Schedule helpers ─── */

const DAYS = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'];
// ISO weekday: 1=Mon … 7=Sun; cron dow: 0=Sun, 1=Mon … 6=Sat, 7=Sun

/** Parse cron DOW field → set of ISO weekdays (1-7) */
function parseCronDow(expr: string): Set<number> {
  const all = new Set([1, 2, 3, 4, 5, 6, 7]);
  if (!expr || expr === '*' || expr === '?') return all;
  const result = new Set<number>();
  for (const part of expr.split(',')) {
    if (part.includes('-')) {
      const [lo, hi] = part.split('-').map(Number);
      for (let d = lo; d <= hi; d++) result.add(d === 0 || d === 7 ? 7 : d);
    } else if (part === '*') {
      return all;
    } else {
      const n = Number(part);
      result.add(n === 0 ? 7 : n);
    }
  }
  return result;
}

/** Which ISO weekdays (1-7) does this job run on? */
function jobWeekdays(job: CronJob): Set<number> {
  const sched = job.schedule;
  if (typeof sched === 'string') {
    const parts = sched.trim().split(/\s+/);
    if (parts.length >= 5) return parseCronDow(parts[4]);
    return new Set([1, 2, 3, 4, 5, 6, 7]);
  }
  if (sched.kind === 'cron') {
    const parts = sched.expr.trim().split(/\s+/);
    if (parts.length >= 5) return parseCronDow(parts[4]);
  }
  // 'every' and 'at' schedules run every day
  return new Set([1, 2, 3, 4, 5, 6, 7]);
}

/** Extract hour from cron expression (or return undefined) */
function jobHour(job: CronJob): number | undefined {
  const sched = job.schedule;
  const expr = typeof sched === 'string' ? sched : sched.kind === 'cron' ? sched.expr : null;
  if (!expr) return undefined;
  const parts = expr.trim().split(/\s+/);
  if (parts.length < 2) return undefined;
  const h = Number(parts[1]);
  return Number.isFinite(h) ? h : undefined;
}

const JOB_COLORS = [
  { color: '#3b82f6', bg: '#eff6ff' },
  { color: '#f97316', bg: '#fff7ed' },
  { color: '#10b981', bg: '#f0fdf4' },
  { color: '#8b5cf6', bg: '#f5f3ff' },
  { color: '#ec4899', bg: '#fdf2f8' },
  { color: '#f59e0b', bg: '#fffbeb' },
];

const TABS = ['总览 Overview', '排期表 Schedule', '流水线 Pipelines'] as const;
type Tab = (typeof TABS)[number];
type StatusFilter = 'all' | 'failed' | 'enabled';

function resolveDeepLinkedTab(raw: string | null): Tab | null {
  if (raw === 'overview') return '总览 Overview';
  if (raw === 'schedule') return '排期表 Schedule';
  if (raw === 'pipelines') return '流水线 Pipelines';
  return null;
}

/* ─── Main component ─── */

export function Cron() {
  const deepLinkParams = new URLSearchParams(window.location.search);
  const deepLinkedJobId = deepLinkParams.get('jobId');
  const initialTab = resolveDeepLinkedTab(deepLinkParams.get('tab'));
  const [activeTab, setActiveTab] = useState<Tab>(deepLinkedJobId ? '流水线 Pipelines' : initialTab ?? '总览 Overview');
  const [expandedPipelineJobId, setExpandedPipelineJobId] = useState<string | null>(deepLinkedJobId);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<CronJob | null>(null);
  const [createName, setCreateName] = useState('');
  const [createMessage, setCreateMessage] = useState('');
  const [createSchedule, setCreateSchedule] = useState('0 7 * * *');
  const [createDeliveryMode, setCreateDeliveryMode] = useState('none');
  const [createDeliveryChannel, setCreateDeliveryChannel] = useState('');
  const [createDeliveryTo, setCreateDeliveryTo] = useState('');
  const [createFailureAlertAfter, setCreateFailureAlertAfter] = useState('3');
  const [createFailureAlertCooldownSeconds, setCreateFailureAlertCooldownSeconds] = useState('600');
  const [createFailureAlertChannel, setCreateFailureAlertChannel] = useState('ops-alerts');
  const [createDeliveryBestEffort, setCreateDeliveryBestEffort] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);

  const { jobs, loading, error, fetchJobs, createJob, updateJob, deleteJob, toggleJob, triggerJob } = useCronStore();

  useEffect(() => { void fetchJobs(); }, [fetchJobs]);

  const resetWizard = () => {
    setCreateName('');
    setCreateMessage('');
    setCreateSchedule('0 7 * * *');
    setCreateDeliveryMode('none');
    setCreateDeliveryChannel('');
    setCreateDeliveryTo('');
    setCreateFailureAlertAfter('3');
    setCreateFailureAlertCooldownSeconds('600');
    setCreateFailureAlertChannel('ops-alerts');
    setCreateDeliveryBestEffort(false);
    setEditingJob(null);
  };

  const openCreateWizard = () => {
    resetWizard();
    setCreateOpen(true);
  };

  const openEditWizard = (job: CronJob) => {
    setEditingJob(job);
    setCreateName(job.name);
    setCreateMessage(job.message);
    setCreateSchedule(typeof job.schedule === 'string' ? job.schedule : formatSchedule(job.schedule));
    setCreateDeliveryMode(job.delivery?.mode ?? 'none');
    setCreateDeliveryChannel(job.delivery?.channel ?? '');
    setCreateDeliveryTo(job.delivery?.to ?? '');
    setCreateFailureAlertAfter(String(job.failureAlertAfter ?? 3));
    setCreateFailureAlertCooldownSeconds(String(job.failureAlertCooldownSeconds ?? 600));
    setCreateFailureAlertChannel(job.failureAlertChannel ?? 'ops-alerts');
    setCreateDeliveryBestEffort(job.deliveryBestEffort ?? false);
    setCreateOpen(true);
  };

  const handleCreate = async () => {
    if (!createName.trim() || !createMessage.trim()) return;
    setCreateLoading(true);
    try {
      const payload = {
        name: createName.trim(),
        message: createMessage.trim(),
        schedule: createSchedule.trim(),
        enabled: true,
        delivery: {
          mode: createDeliveryMode,
          ...(createDeliveryChannel.trim() ? { channel: createDeliveryChannel.trim() } : {}),
          ...(createDeliveryTo.trim() ? { to: createDeliveryTo.trim() } : {}),
        },
        failureAlertAfter: Number(createFailureAlertAfter) || undefined,
        failureAlertCooldownSeconds: Number(createFailureAlertCooldownSeconds) || undefined,
        failureAlertChannel: createFailureAlertChannel.trim() || undefined,
        deliveryBestEffort: createDeliveryBestEffort,
      };

      if (editingJob) {
        await updateJob(editingJob.id, payload);
      } else {
        await createJob(payload);
      }
      setCreateOpen(false);
      resetWizard();
    } finally {
      setCreateLoading(false);
    }
  };

  const enabledCount = jobs.filter((j) => j.enabled).length;
  const latestUpdatedAt = jobs.reduce<string | null>((latest, job) => {
    if (!latest) return job.updatedAt;
    return new Date(job.updatedAt).getTime() > new Date(latest).getTime() ? job.updatedAt : latest;
  }, null);
  const hasJobErrors = jobs.some((job) => job.lastRun?.error);

  useEffect(() => {
    if (!deepLinkedJobId) return;
    if (!jobs.some((job) => job.id === deepLinkedJobId)) return;
    setActiveTab('流水线 Pipelines');
    setExpandedPipelineJobId(deepLinkedJobId);
  }, [deepLinkedJobId, jobs]);

  return (
    <div className="flex h-full flex-col bg-[#f2f2f7] p-6">
      <div className="flex flex-1 flex-col overflow-hidden rounded-2xl bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">

        {/* Header */}
        <div className="flex shrink-0 items-start justify-between px-8 pb-1 pt-8">
          <div>
            <h1 className="text-[26px] font-semibold text-[#000000]">Cron 监控面板</h1>
            <p className="mt-1 text-[13px] text-[#8e8e93]">
              {loading ? '加载中...' : error ? '加载失败' : `${jobs.length} 个定时任务 · ${enabledCount} 个启用中`}
            </p>
            {!loading && !error && latestUpdatedAt && (
              <p className="mt-1 text-[12px] text-[#8e8e93]">最近更新时间：{formatTime(latestUpdatedAt)}</p>
            )}
          </div>
          <div className="mt-1 flex items-center gap-2">
            <button
              type="button"
              onClick={() => void fetchJobs()}
              className="text-[13px] text-[#8e8e93] transition-colors hover:text-[#3c3c43]"
            >
              ↻ 刷新
            </button>
            <button
              type="button"
              onClick={openCreateWizard}
              className="rounded-lg bg-clawx-ac px-3 py-1.5 text-[13px] font-medium text-white hover:bg-[#0056b3]"
            >
              + 新建任务
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex shrink-0 items-center gap-0 border-b border-black/[0.06] px-8 pt-4">
          {TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={cn(
                'relative mr-6 pb-3 text-[14px] font-medium transition-colors',
                activeTab === tab ? 'text-[#10b981]' : 'text-[#8e8e93] hover:text-[#3c3c43]',
              )}
            >
              {tab}
              {activeTab === tab && <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-[#10b981]" />}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === '总览 Overview' && (
          <>
            <div className="border-b border-black/[0.06] px-8 py-3">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setStatusFilter('all')}
                  className={cn('rounded-full px-3 py-1 text-[12px] font-medium transition-colors', statusFilter === 'all' ? 'bg-[#10b981] text-white' : 'bg-[#f2f2f7] text-[#3c3c43] hover:bg-[#e5e7eb]')}
                >
                  全部状态
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('failed')}
                  className={cn('rounded-full px-3 py-1 text-[12px] font-medium transition-colors', statusFilter === 'failed' ? 'bg-[#ef4444] text-white' : 'bg-[#fef2f2] text-[#ef4444] hover:bg-[#fee2e2]')}
                >
                  仅失败
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('enabled')}
                  className={cn('rounded-full px-3 py-1 text-[12px] font-medium transition-colors', statusFilter === 'enabled' ? 'bg-[#3b82f6] text-white' : 'bg-[#eff6ff] text-[#1d4ed8] hover:bg-[#dbeafe]')}
                >
                  仅启用中
                </button>
              </div>
              {hasJobErrors && (
                <div className="rounded-xl border border-[#fca5a5] bg-[#fef2f2] px-4 py-3 text-[13px] text-[#b91c1c]">
                  配置或执行异常：当前有任务最近一次执行失败，请优先检查 delivery 配置和错误详情。
                </div>
              )}
            </div>
            <OverviewTab
              jobs={jobs}
              statusFilter={statusFilter}
              loading={loading}
              error={error}
              onToggle={(id, enabled) => void toggleJob(id, enabled)}
              onTrigger={(id) => void triggerJob(id)}
              onDelete={(id) => void deleteJob(id)}
              onEdit={openEditWizard}
            />
          </>
        )}

        {activeTab === '排期表 Schedule' && <ScheduleTab jobs={jobs} />}

        {activeTab === '流水线 Pipelines' && (
          <PipelinesTab
            jobs={jobs}
            loading={loading}
            expandedJobId={expandedPipelineJobId}
            onExpandedJobChange={setExpandedPipelineJobId}
            onTrigger={(id) => void triggerJob(id)}
            onEdit={openEditWizard}
          />
        )}
      </div>

      {/* Create modal */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="w-[400px] rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-[16px] font-semibold text-[#000000]">新建定时任务</h2>
            <div className="mb-4 rounded-xl border border-black/[0.06] bg-[#f8fafc] px-4 py-3">
              <p className="text-[12px] font-medium text-[#6b7280]">Pipeline Wizard</p>
              <p className="mt-1 text-[13px] text-[#334155]">Trigger → Agent → Delivery → Failure Alert</p>
            </div>
            <div className="mb-3">
              <p className="mb-1.5 text-[13px] font-medium text-[#000000]">任务名称</p>
              <input value={createName} onChange={(e) => setCreateName(e.target.value)} placeholder="例如：每日晨报" className="w-full rounded-lg border border-black/10 px-3 py-2 text-[13px] outline-none focus:border-clawx-ac" />
            </div>
            <div className="mb-3">
              <p className="mb-1.5 text-[13px] font-medium text-[#000000]">任务指令</p>
              <textarea value={createMessage} onChange={(e) => setCreateMessage(e.target.value)} placeholder="发送给 Agent 的指令内容..." rows={3} className="w-full resize-none rounded-lg border border-black/10 px-3 py-2 text-[13px] outline-none focus:border-clawx-ac" />
            </div>
            <div className="mb-5">
              <p className="mb-1.5 text-[13px] font-medium text-[#000000]">Cron 表达式</p>
              <input value={createSchedule} onChange={(e) => setCreateSchedule(e.target.value)} placeholder="0 7 * * *" className="w-full rounded-lg border border-black/10 px-3 py-2 font-mono text-[13px] outline-none focus:border-clawx-ac" />
              <p className="mt-1 text-[11px] text-[#8e8e93]">标准 5 段 cron 表达式，例如 <code>0 7 * * *</code> = 每天 07:00</p>
            </div>
            <div className="mb-3 grid grid-cols-2 gap-3">
              <label className="block">
                <p className="mb-1.5 text-[13px] font-medium text-[#000000]">Delivery mode</p>
                <select
                  aria-label="Delivery mode"
                  value={createDeliveryMode}
                  onChange={(e) => setCreateDeliveryMode(e.target.value)}
                  className="w-full rounded-lg border border-black/10 px-3 py-2 text-[13px] outline-none focus:border-clawx-ac"
                >
                  <option value="none">none</option>
                  <option value="announce">announce</option>
                </select>
              </label>
              <label className="block">
                <p className="mb-1.5 text-[13px] font-medium text-[#000000]">Delivery channel</p>
                <input
                  value={createDeliveryChannel}
                  onChange={(e) => setCreateDeliveryChannel(e.target.value)}
                  placeholder="feishu"
                  className="w-full rounded-lg border border-black/10 px-3 py-2 text-[13px] outline-none focus:border-clawx-ac"
                />
              </label>
            </div>
            <div className="mb-3 grid grid-cols-2 gap-3">
              <label className="block">
                <p className="mb-1.5 text-[13px] font-medium text-[#000000]">Delivery target</p>
                <input
                  value={createDeliveryTo}
                  onChange={(e) => setCreateDeliveryTo(e.target.value)}
                  placeholder="release-room"
                  className="w-full rounded-lg border border-black/10 px-3 py-2 text-[13px] outline-none focus:border-clawx-ac"
                />
              </label>
              <label className="block">
                <p className="mb-1.5 text-[13px] font-medium text-[#000000]">Failure alert after</p>
                <input
                  value={createFailureAlertAfter}
                  onChange={(e) => setCreateFailureAlertAfter(e.target.value)}
                  placeholder="3"
                  className="w-full rounded-lg border border-black/10 px-3 py-2 text-[13px] outline-none focus:border-clawx-ac"
                />
              </label>
            </div>
            <div className="mb-5 grid grid-cols-2 gap-3">
              <label className="block">
                <p className="mb-1.5 text-[13px] font-medium text-[#000000]">Failure alert cooldown</p>
                <input
                  value={createFailureAlertCooldownSeconds}
                  onChange={(e) => setCreateFailureAlertCooldownSeconds(e.target.value)}
                  placeholder="600"
                  className="w-full rounded-lg border border-black/10 px-3 py-2 text-[13px] outline-none focus:border-clawx-ac"
                />
              </label>
              <label className="block">
                <p className="mb-1.5 text-[13px] font-medium text-[#000000]">Failure alert channel</p>
                <input
                  value={createFailureAlertChannel}
                  onChange={(e) => setCreateFailureAlertChannel(e.target.value)}
                  placeholder="ops-alerts"
                  className="w-full rounded-lg border border-black/10 px-3 py-2 text-[13px] outline-none focus:border-clawx-ac"
                />
              </label>
            </div>
            <label className="mb-5 flex items-center gap-2 text-[13px] text-[#3c3c43]">
              <input
                aria-label="Best effort delivery"
                type="checkbox"
                checked={createDeliveryBestEffort}
                onChange={(e) => setCreateDeliveryBestEffort(e.target.checked)}
              />
              Best effort delivery
            </label>
            <div className="flex gap-2">
              <button type="button" onClick={() => { setCreateOpen(false); resetWizard(); }} className="flex-1 rounded-xl border border-black/10 py-2 text-[13px] text-[#3c3c43] hover:bg-[#f2f2f7]">取消</button>
              <button type="button" onClick={() => void handleCreate()} disabled={createLoading || !createName.trim() || !createMessage.trim()} className="flex-1 rounded-xl bg-clawx-ac py-2 text-[13px] font-medium text-white hover:bg-[#0056b3] disabled:opacity-50">
                {createLoading ? (editingJob ? '保存中...' : '创建中...') : (editingJob ? '保存修改' : '确认创建')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Overview Tab ─── */

function OverviewTab({
  jobs, statusFilter, loading, error, onToggle, onTrigger, onDelete, onEdit,
}: {
  jobs: CronJob[];
  statusFilter: StatusFilter;
  loading: boolean;
  error: string | null;
  onToggle: (id: string, enabled: boolean) => void;
  onTrigger: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (job: CronJob) => void;
}) {
  if (loading) return <div className="flex flex-1 items-center justify-center text-[14px] text-[#8e8e93]">加载中...</div>;
  if (error) return <div className="flex flex-1 items-center justify-center text-[14px] text-[#ef4444]">{error}</div>;
  const filteredJobs = jobs.filter((job) => {
    if (statusFilter === 'failed') return Boolean(job.lastRun && !job.lastRun.success);
    if (statusFilter === 'enabled') return job.enabled;
    return true;
  });
  if (filteredJobs.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
        <span className="text-[40px]">⏰</span>
        <p className="text-[14px] text-[#8e8e93]">{statusFilter === 'all' ? '暂无定时任务' : '当前筛选下暂无任务'}</p>
        <p className="text-[12px] text-[#c6c6c8]">{statusFilter === 'all' ? '点击右上角「+ 新建任务」开始' : '切换筛选查看其他任务'}</p>
      </div>
    );
  }
  return (
    <div className="flex-1 overflow-y-auto px-8 py-4">
      <div className="flex flex-col gap-3">
        {filteredJobs.map((job) => (
          <div key={job.id} className="flex items-center gap-4 rounded-xl border border-black/[0.06] bg-white px-5 py-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
            <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', job.enabled ? 'bg-[#10b981]' : 'bg-[#d1d5db]')} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-[14px] font-semibold text-[#000000]">{job.name}</p>
                {job.lastRun && (
                  <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium', job.lastRun.success ? 'bg-[#dcfce7] text-[#059669]' : 'bg-[#fee2e2] text-[#ef4444]')}>
                    {job.lastRun.success ? '上次成功' : '上次失败'}
                  </span>
                )}
              </div>
              <p className="mt-0.5 truncate text-[12px] text-[#8e8e93]">{job.message}</p>
              <div className="mt-1 flex items-center gap-3 text-[11px] text-[#c6c6c8]">
                <span>⏱ {formatSchedule(job.schedule)}</span>
                {job.nextRun && <span>下次：{formatTime(job.nextRun)}</span>}
                {job.lastRun && <span>上次：{formatTime(job.lastRun.time)}</span>}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-[#8e8e93]">
                <span>{`Delivery: ${formatDelivery(job)}`}</span>
                <span>{`Session target: ${formatSessionTarget(job.sessionTarget)}`}</span>
                {typeof job.failureAlertAfter === 'number' && (
                  <span>{`Alert after ${job.failureAlertAfter} failures`}</span>
                )}
              </div>
              {job.lastRun?.error ? (
                <p className="mt-1 truncate text-[11px] text-[#ef4444]">{job.lastRun.error}</p>
              ) : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button type="button" onClick={() => onTrigger(job.id)} className="rounded-md border border-black/10 px-2.5 py-1 text-[12px] text-[#3c3c43] hover:bg-[#f2f2f7]">▶ 立即执行</button>
              <button type="button" onClick={() => onEdit(job)} className="rounded-md border border-black/10 px-2.5 py-1 text-[12px] text-[#3c3c43] hover:bg-[#f2f2f7]">编辑</button>
              <button type="button" onClick={() => onToggle(job.id, !job.enabled)} className={cn('rounded-md border px-2.5 py-1 text-[12px] transition-colors', job.enabled ? 'border-[#f59e0b]/30 text-[#b45309] hover:bg-[#fef9c3]' : 'border-[#10b981]/30 text-[#059669] hover:bg-[#dcfce7]')}>
                {job.enabled ? '暂停' : '启用'}
              </button>
              <button type="button" onClick={() => onDelete(job.id)} className="rounded-md border border-[#ef4444]/20 px-2.5 py-1 text-[12px] text-[#ef4444] hover:bg-[#fef2f2]">删除</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Schedule Tab ─── */

function ScheduleTab({ jobs }: { jobs: CronJob[] }) {
  const upcoming = jobs
    .filter((j) => j.enabled && j.nextRun)
    .sort((a, b) => new Date(a.nextRun!).getTime() - new Date(b.nextRun!).getTime())
    .slice(0, 10);

  // Build per-day job lists (ISO weekday 1=Mon … 7=Sun → index 0-6)
  const dayJobs: CronJob[][] = Array.from({ length: 7 }, () => []);
  for (const job of jobs) {
    const days = jobWeekdays(job);
    for (const d of days) {
      dayJobs[d - 1].push(job);
    }
  }

  const hasAnyJob = jobs.length > 0;

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Weekly grid */}
      <div className="flex flex-1 flex-col overflow-auto">
        {/* Day headers */}
        <div className="flex shrink-0 border-b border-black/[0.06]">
          {DAYS.map((day, i) => (
            <div key={day} className={cn('flex-1 py-3 text-center text-[12px] font-medium', i < 5 ? 'text-[#3c3c43]' : 'text-[#c6c6c8]')}>
              {day}
            </div>
          ))}
        </div>

        {/* Job cells */}
        <div className="flex flex-1 overflow-y-auto">
          {!hasAnyJob ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
              <span className="text-[32px]">📅</span>
              <p className="text-[13px] text-[#8e8e93]">暂无定时任务</p>
              <p className="text-[12px] text-[#c6c6c8]">创建任务后将显示在对应星期列</p>
            </div>
          ) : (
            DAYS.map((day, dayIdx) => (
              <div key={day} className="flex flex-1 flex-col gap-2 border-r border-black/[0.04] p-2">
                {dayJobs[dayIdx].length === 0 ? (
                  <div className="flex flex-1 items-center justify-center">
                    <span className="text-[11px] text-[#e5e5ea]">—</span>
                  </div>
                ) : (
                  dayJobs[dayIdx].map((job, i) => {
                    const { color, bg } = JOB_COLORS[i % JOB_COLORS.length];
                    const hour = jobHour(job);
                    return (
                      <div
                        key={job.id}
                        className="rounded-lg px-2.5 py-2"
                        style={{ background: bg, borderLeft: `3px solid ${color}` }}
                      >
                        <p className="text-[12px] font-semibold leading-tight text-[#1c1c1e]">{job.name}</p>
                        <p className="mt-0.5 text-[10px]" style={{ color }}>
                          {hour !== undefined ? `${String(hour).padStart(2, '0')}:00` : formatSchedule(job.schedule)}
                        </p>
                        <span className={cn('mt-1 inline-block h-1.5 w-1.5 rounded-full', job.enabled ? 'bg-[#10b981]' : 'bg-[#d1d5db]')} />
                      </div>
                    );
                  })
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right: upcoming panel */}
      <div className="flex w-[220px] shrink-0 flex-col border-l border-black/[0.06] bg-[#f9f9f9]">
        <div className="border-b border-black/[0.06] px-4 py-3">
          <p className="text-[12px] font-semibold text-[#3c3c43]">即将执行</p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {upcoming.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-1 py-8 text-center">
              <span className="text-[24px]">⏰</span>
              <p className="text-[12px] text-[#c6c6c8]">暂无排期</p>
            </div>
          ) : (
            <div className="flex flex-col gap-0">
              {upcoming.map((job) => (
                <div key={job.id} className="border-b border-black/[0.04] px-4 py-3">
                  <p className="truncate text-[13px] font-medium text-[#000000]">{job.name}</p>
                  <p className="mt-0.5 text-[11px] text-clawx-ac">{formatTime(job.nextRun)}</p>
                  <p className="mt-0.5 font-mono text-[10px] text-[#c6c6c8]">{formatSchedule(job.schedule)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Pipelines Tab ─── */

function formatDuration(ms?: number): string {
  if (!ms) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
}

interface RunEntry {
  sessionId?: string;
  status: string;
  summary?: string;
  error?: string;
  durationMs?: number;
  ts?: number;
  model?: string;
  provider?: string;
}

function RunDetailPanel({ job, onClose }: { job: CronJob; onClose: () => void }) {
  const [runs, setRuns] = useState<RunEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    import('@/lib/host-api').then(({ hostApiFetch }) =>
      hostApiFetch<{ runs: RunEntry[] }>(`/api/cron/runs/${encodeURIComponent(job.id)}`)
        .then((data) => setRuns(data.runs ?? []))
        .catch(() => setRuns([]))
        .finally(() => setLoading(false))
    );
  }, [job.id]);

  return (
    <tr>
      <td colSpan={6} className="bg-[#f9fafb] px-8 pb-4 pt-2">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[12px] font-semibold text-[#3c3c43]">运行详情</span>
          <button type="button" onClick={onClose} className="text-[11px] text-[#8e8e93] hover:text-[#3c3c43]">收起</button>
        </div>
        <div className="mb-3 grid grid-cols-2 gap-2 rounded-xl border border-black/[0.06] bg-white px-3 py-3 text-[12px] text-[#3c3c43]">
          <div>
            <span className="text-[#8e8e93]">Delivery: </span>
            <span>{formatDelivery(job)}</span>
          </div>
          <div>
            <span className="text-[#8e8e93]">Session target: </span>
            <span>{formatSessionTarget(job.sessionTarget)}</span>
          </div>
          <div>
            <span className="text-[#8e8e93]">Schedule: </span>
            <span>{formatSchedule(job.schedule)}</span>
          </div>
          <div>
            <span className="text-[#8e8e93]">Next run: </span>
            <span>{job.nextRun ? formatTime(job.nextRun) : '—'}</span>
          </div>
        </div>
        {job.lastRun?.error ? (
          <div className="mb-3 rounded-xl border border-[#ef4444]/20 bg-[#fef2f2] px-3 py-2 text-[12px] text-[#b91c1c]">
            {job.lastRun.error}
          </div>
        ) : null}
        {loading ? (
          <p className="text-[12px] text-[#8e8e93]">加载中...</p>
        ) : runs.length === 0 ? (
          <p className="text-[12px] text-[#c6c6c8]">暂无历史记录</p>
        ) : (
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="border-b border-black/[0.06]">
                {['执行时间', '状态', '耗时', '模型', '摘要'].map((h) => (
                  <th key={h} className="pb-1.5 text-left text-[10px] font-semibold uppercase tracking-[0.4px] text-[#c6c6c8]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {runs.map((r, i) => {
                const isOk = (r.status || '').toLowerCase() !== 'error';
                const summary = r.summary || r.error || (isOk ? '执行完成' : '执行失败');
                return (
                  <tr key={r.sessionId ?? i} className="border-b border-black/[0.04]">
                    <td className="py-2 pr-4 text-[#3c3c43]">
                      {r.ts ? new Date(r.ts).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                    </td>
                    <td className="py-2 pr-4">
                      {isOk ? (
                        <span className="rounded-full bg-[#dcfce7] px-2 py-0.5 text-[10px] font-medium text-[#059669]">成功</span>
                      ) : (
                        <span className="rounded-full bg-[#fee2e2] px-2 py-0.5 text-[10px] font-medium text-[#ef4444]">失败</span>
                      )}
                    </td>
                    <td className="py-2 pr-4 font-mono text-[#8e8e93]">{formatDuration(r.durationMs)}</td>
                    <td className="py-2 pr-4 text-[#8e8e93]">{r.model ?? '—'}</td>
                    <td className="py-2 max-w-[320px] truncate text-[#3c3c43]" title={summary}>{summary}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </td>
    </tr>
  );
}

function PipelinesTab({
  jobs,
  loading,
  expandedJobId,
  onExpandedJobChange,
  onTrigger,
  onEdit,
}: {
  jobs: CronJob[];
  loading: boolean;
  expandedJobId: string | null;
  onExpandedJobChange: (jobId: string | null) => void;
  onTrigger: (id: string) => void;
  onEdit: (job: CronJob) => void;
}) {
  const ran = jobs.filter((j) => j.lastRun);
  const succeeded = ran.filter((j) => j.lastRun?.success).length;
  const failed = ran.filter((j) => !j.lastRun?.success).length;
  const successRate = ran.length > 0 ? Math.round((succeeded / ran.length) * 100) : null;

  const sorted = [...jobs].sort((a, b) => {
    const ta = a.lastRun?.time ? new Date(a.lastRun.time).getTime() : 0;
    const tb = b.lastRun?.time ? new Date(b.lastRun.time).getTime() : 0;
    return tb - ta;
  });

  if (loading) return <div className="flex flex-1 items-center justify-center text-[14px] text-[#8e8e93]">加载中...</div>;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Stats bar */}
      <div className="flex shrink-0 items-center gap-6 border-b border-black/[0.06] px-8 py-4">
        <StatPill label="任务总数" value={String(jobs.length)} color="#3c3c43" />
        <StatPill label="已执行" value={String(ran.length)} color="var(--ac)" />
        <StatPill label="成功" value={String(succeeded)} color="#10b981" />
        <StatPill label="失败" value={String(failed)} color={failed > 0 ? '#ef4444' : '#c6c6c8'} />
        {successRate !== null && (
          <StatPill label="成功率" value={`${successRate}%`} color={successRate >= 80 ? '#10b981' : successRate >= 50 ? '#f59e0b' : '#ef4444'} />
        )}
      </div>

      {/* Run log */}
      {jobs.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
          <span className="text-[40px]">🔁</span>
          <p className="text-[14px] text-[#8e8e93]">暂无执行记录</p>
          <p className="text-[12px] text-[#c6c6c8]">创建任务并执行后，流水线记录将显示在这里</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto px-8 py-4">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-black/[0.06]">
                {['任务名称', '调度', '上次执行', '耗时', '状态', '操作'].map((h) => (
                  <th key={h} className="pb-2 text-left text-[11px] font-semibold uppercase tracking-[0.5px] text-[#8e8e93]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((job) => {
                const run = job.lastRun;
                const isExpanded = expandedJobId === job.id;
                return (
                  <Fragment key={job.id}>
                    <tr className="group border-b border-black/[0.04] transition-colors hover:bg-[#f9f9f9]">
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          <span className={cn('h-2 w-2 shrink-0 rounded-full', job.enabled ? 'bg-[#10b981]' : 'bg-[#d1d5db]')} />
                          <span className="font-medium text-[#000000]">{job.name}</span>
                        </div>
                        <p className="mt-0.5 truncate pl-4 text-[11px] text-[#3c3c43]">Trigger → Agent → Delivery</p>
                        <p className="mt-0.5 truncate pl-4 text-[11px] text-[#8e8e93]">{`Delivery: ${formatDelivery(job)}`}</p>
                        {typeof job.failureAlertAfter === 'number' && (
                          <p className="mt-0.5 truncate pl-4 text-[11px] text-[#8e8e93]">
                            {`Alert after ${job.failureAlertAfter} failures${job.failureAlertChannel ? ` → ${job.failureAlertChannel}` : ''}`}
                          </p>
                        )}
                        {run?.error && (
                          <p className="mt-0.5 truncate pl-4 text-[11px] text-[#ef4444]">{run.error}</p>
                        )}
                      </td>
                      <td className="py-3 pr-4">
                        <code className="rounded bg-[#f2f2f7] px-1.5 py-0.5 font-mono text-[11px] text-[#3c3c43]">
                          {formatSchedule(job.schedule)}
                        </code>
                      </td>
                      <td className="py-3 pr-4 text-[#3c3c43]">{run ? formatTime(run.time) : <span className="text-[#c6c6c8]">从未执行</span>}</td>
                      <td className="py-3 pr-4 font-mono text-[#3c3c43]">{run ? formatDuration(run.duration) : '—'}</td>
                      <td className="py-3 pr-4">
                        {!run ? (
                          <span className="text-[12px] text-[#c6c6c8]">—</span>
                        ) : run.success ? (
                          <span className="rounded-full bg-[#dcfce7] px-2.5 py-0.5 text-[11px] font-medium text-[#059669]">成功</span>
                        ) : (
                          <span className="rounded-full bg-[#fee2e2] px-2.5 py-0.5 text-[11px] font-medium text-[#ef4444]">失败</span>
                        )}
                      </td>
                      <td className="py-3">
                        <div className="flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                          <button
                            type="button"
                            onClick={() => onTrigger(job.id)}
                            className="rounded-md border border-black/10 px-2.5 py-1 text-[12px] text-[#3c3c43] hover:bg-[#f2f2f7]"
                          >
                            ▶ 执行
                          </button>
                          <button
                            type="button"
                            onClick={() => onEdit(job)}
                            className="rounded-md border border-black/10 px-2.5 py-1 text-[12px] text-[#3c3c43] hover:bg-[#f2f2f7]"
                          >
                            编辑
                          </button>
                          <button
                            type="button"
                            onClick={() => onExpandedJobChange(isExpanded ? null : job.id)}
                            className={cn('rounded-md border px-2.5 py-1 text-[12px] transition-colors', isExpanded ? 'border-clawx-ac/30 bg-clawx-ac/5 text-clawx-ac' : 'border-black/10 text-[#3c3c43] hover:bg-[#f2f2f7]')}
                          >
                            {isExpanded ? '收起' : '详情'}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <RunDetailPanel
                        key={`history-${job.id}`}
                        job={job}
                        onClose={() => onExpandedJobChange(null)}
                      />
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatPill({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[12px] text-[#8e8e93]">{label}</span>
      <span className="text-[20px] font-semibold" style={{ color }}>{value}</span>
    </div>
  );
}

export default Cron;
