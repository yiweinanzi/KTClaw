/**
 * Cron Page — Frame 06
 * 定时任务 / Cron 总览：自动化执行调度
 */
import { useEffect, useState } from 'react';
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

/* ─── Static schedule data (周历 demo) ─── */

interface ScheduleTask {
  agent: string;
  agentIcon: string;
  name: string;
  time: string;
  color: string;
  bg: string;
}

const DAYS = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

const MONKEY: Omit<ScheduleTask, 'name' | 'time'> = { agent: 'Monkey', agentIcon: '🤖', color: '#f97316', bg: '#fff7ed' };
const SECURITY: Omit<ScheduleTask, 'name' | 'time'> = { agent: '安全审核', agentIcon: '⚠️', color: '#8b5cf6', bg: '#f5f3ff' };
const KTCLAW_DARK: Omit<ScheduleTask, 'name' | 'time'> = { agent: 'KTClaw主脑', agentIcon: '✦', color: '#ffffff', bg: '#1c1c1e' };
const KTCLAW_LIGHT: Omit<ScheduleTask, 'name' | 'time'> = { agent: 'KTClaw主脑', agentIcon: '✦', color: '#3c3c43', bg: '#ffffff' };
const SICHEN: Omit<ScheduleTask, 'name' | 'time'> = { agent: '沉思小助手', agentIcon: '🔍', color: '#059669', bg: '#f0fdf4' };

function repeat5<T>(task: T): (T | null)[] { return [task, task, task, task, task, null]; }

type TimeBlock = { hour: string; entries: (ScheduleTask | null)[][] };

const TIME_BLOCKS: TimeBlock[] = [
  { hour: '05:00', entries: [repeat5({ ...MONKEY, name: 'monkey-discovery', time: '05:00' }), repeat5({ ...SECURITY, name: 'auth-watchman', time: '05:30' }), repeat5({ ...KTCLAW_DARK, name: 'vault-snapshot', time: '05:50' })] },
  { hour: '06:00', entries: [repeat5({ ...KTCLAW_DARK, name: 'builder-briefing', time: '06:00' })] },
  { hour: '07:00', entries: [repeat5({ ...SICHEN, name: 'outpost-mirror', time: '07:00' }), [null, { ...KTCLAW_LIGHT, name: 'robin-weekly-brief', time: '07:30' }, null, null, null, null]] },
];

const TABS = ['总览 Overview', '排期表 Schedule', '流水线 Pipelines'] as const;
type Tab = (typeof TABS)[number];

/* ─── Main component ─── */

export function Cron() {
  const [activeTab, setActiveTab] = useState<Tab>('总览 Overview');
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createMessage, setCreateMessage] = useState('');
  const [createSchedule, setCreateSchedule] = useState('0 7 * * *');
  const [createLoading, setCreateLoading] = useState(false);

  const { jobs, loading, error, fetchJobs, createJob, deleteJob, toggleJob, triggerJob } = useCronStore();

  useEffect(() => { void fetchJobs(); }, [fetchJobs]);

  const handleCreate = async () => {
    if (!createName.trim() || !createMessage.trim()) return;
    setCreateLoading(true);
    try {
      await createJob({ name: createName.trim(), message: createMessage.trim(), schedule: createSchedule.trim(), enabled: true });
      setCreateOpen(false);
      setCreateName('');
      setCreateMessage('');
      setCreateSchedule('0 7 * * *');
    } finally {
      setCreateLoading(false);
    }
  };

  const enabledCount = jobs.filter((j) => j.enabled).length;

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
              onClick={() => setCreateOpen(true)}
              className="rounded-lg bg-[#007aff] px-3 py-1.5 text-[13px] font-medium text-white hover:bg-[#0056b3]"
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
          <OverviewTab
            jobs={jobs}
            loading={loading}
            error={error}
            onToggle={(id, enabled) => void toggleJob(id, enabled)}
            onTrigger={(id) => void triggerJob(id)}
            onDelete={(id) => void deleteJob(id)}
          />
        )}

        {activeTab === '排期表 Schedule' && <ScheduleTab jobs={jobs} />}

        {activeTab === '流水线 Pipelines' && (
          <PipelinesTab
            jobs={jobs}
            loading={loading}
            onTrigger={(id) => void triggerJob(id)}
          />
        )}
      </div>

      {/* Create modal */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="w-[400px] rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-[16px] font-semibold text-[#000000]">新建定时任务</h2>
            <div className="mb-3">
              <p className="mb-1.5 text-[13px] font-medium text-[#000000]">任务名称</p>
              <input value={createName} onChange={(e) => setCreateName(e.target.value)} placeholder="例如：每日晨报" className="w-full rounded-lg border border-black/10 px-3 py-2 text-[13px] outline-none focus:border-[#007aff]" />
            </div>
            <div className="mb-3">
              <p className="mb-1.5 text-[13px] font-medium text-[#000000]">任务指令</p>
              <textarea value={createMessage} onChange={(e) => setCreateMessage(e.target.value)} placeholder="发送给 Agent 的指令内容..." rows={3} className="w-full resize-none rounded-lg border border-black/10 px-3 py-2 text-[13px] outline-none focus:border-[#007aff]" />
            </div>
            <div className="mb-5">
              <p className="mb-1.5 text-[13px] font-medium text-[#000000]">Cron 表达式</p>
              <input value={createSchedule} onChange={(e) => setCreateSchedule(e.target.value)} placeholder="0 7 * * *" className="w-full rounded-lg border border-black/10 px-3 py-2 font-mono text-[13px] outline-none focus:border-[#007aff]" />
              <p className="mt-1 text-[11px] text-[#8e8e93]">标准 5 段 cron 表达式，例如 <code>0 7 * * *</code> = 每天 07:00</p>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setCreateOpen(false)} className="flex-1 rounded-xl border border-black/10 py-2 text-[13px] text-[#3c3c43] hover:bg-[#f2f2f7]">取消</button>
              <button type="button" onClick={() => void handleCreate()} disabled={createLoading || !createName.trim() || !createMessage.trim()} className="flex-1 rounded-xl bg-[#007aff] py-2 text-[13px] font-medium text-white hover:bg-[#0056b3] disabled:opacity-50">
                {createLoading ? '创建中...' : '确认创建'}
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
  jobs, loading, error, onToggle, onTrigger, onDelete,
}: {
  jobs: CronJob[];
  loading: boolean;
  error: string | null;
  onToggle: (id: string, enabled: boolean) => void;
  onTrigger: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  if (loading) return <div className="flex flex-1 items-center justify-center text-[14px] text-[#8e8e93]">加载中...</div>;
  if (error) return <div className="flex flex-1 items-center justify-center text-[14px] text-[#ef4444]">{error}</div>;
  if (jobs.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
        <span className="text-[40px]">⏰</span>
        <p className="text-[14px] text-[#8e8e93]">暂无定时任务</p>
        <p className="text-[12px] text-[#c6c6c8]">点击右上角「+ 新建任务」开始</p>
      </div>
    );
  }
  return (
    <div className="flex-1 overflow-y-auto px-8 py-4">
      <div className="flex flex-col gap-3">
        {jobs.map((job) => (
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
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button type="button" onClick={() => onTrigger(job.id)} className="rounded-md border border-black/10 px-2.5 py-1 text-[12px] text-[#3c3c43] hover:bg-[#f2f2f7]">▶ 立即执行</button>
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
  // Build a simple "next runs" list from real jobs that have nextRun
  const upcoming = jobs
    .filter((j) => j.enabled && j.nextRun)
    .sort((a, b) => new Date(a.nextRun!).getTime() - new Date(b.nextRun!).getTime())
    .slice(0, 8);

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Left: static weekly grid (demo) */}
      <div className="flex w-[64px] shrink-0 flex-col">
        <div className="h-[42px] shrink-0" />
        {TIME_BLOCKS.map((block) => (
          <div key={block.hour} className="relative">
            <div className="flex min-h-[120px] flex-col justify-start pl-4 pt-2">
              <span className="text-[12px] font-medium text-[#8e8e93]">{block.hour}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-1 flex-col overflow-auto border-l border-black/[0.04]">
        <div className="flex shrink-0 border-b border-black/[0.06]">
          {DAYS.map((day) => (
            <div key={day} className="flex-1 py-3 text-center text-[12px] font-medium text-[#8e8e93]">{day}</div>
          ))}
        </div>
        {TIME_BLOCKS.map((block) => (
          <div key={block.hour} className="flex shrink-0 border-b border-black/[0.04]">
            {DAYS.map((_, dayIdx) => (
              <div key={dayIdx} className="flex flex-1 flex-col gap-2 border-r border-black/[0.04] p-2">
                {block.entries.map((row, rowIdx) => {
                  const task = row[dayIdx];
                  if (!task) return <div key={rowIdx} className="invisible h-[60px]" />;
                  return <ScheduleCard key={rowIdx} task={task} />;
                })}
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Right: upcoming real jobs panel */}
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
                  <p className="mt-0.5 text-[11px] text-[#007aff]">{formatTime(job.nextRun)}</p>
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

function ScheduleCard({ task }: { task: ScheduleTask }) {
  const isDark = task.bg === '#1c1c1e';
  return (
    <div className="rounded-lg px-2.5 py-2 text-left" style={{ background: task.bg, borderLeft: `3px solid ${task.color}` }}>
      <div className="mb-0.5 flex items-center gap-1">
        <span className="text-[10px]">{task.agentIcon}</span>
        <span className="text-[10px] font-medium" style={{ color: isDark ? '#9ca3af' : task.color }}>{task.agent}</span>
      </div>
      <p className="text-[12px] font-semibold leading-tight" style={{ color: isDark ? '#ffffff' : '#1c1c1e' }}>{task.name}</p>
      <p className="mt-0.5 text-[11px]" style={{ color: isDark ? '#6b7280' : '#8e8e93' }}>{task.time}</p>
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

function PipelinesTab({
  jobs,
  loading,
  onTrigger,
}: {
  jobs: CronJob[];
  loading: boolean;
  onTrigger: (id: string) => void;
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
        <StatPill label="已执行" value={String(ran.length)} color="#007aff" />
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
                return (
                  <tr key={job.id} className="group border-b border-black/[0.04] transition-colors hover:bg-[#f9f9f9]">
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        <span className={cn('h-2 w-2 shrink-0 rounded-full', job.enabled ? 'bg-[#10b981]' : 'bg-[#d1d5db]')} />
                        <span className="font-medium text-[#000000]">{job.name}</span>
                      </div>
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
                      <button
                        type="button"
                        onClick={() => onTrigger(job.id)}
                        className="rounded-md border border-black/10 px-2.5 py-1 text-[12px] text-[#3c3c43] opacity-0 transition-opacity group-hover:opacity-100 hover:bg-[#f2f2f7]"
                      >
                        ▶ 执行
                      </button>
                    </td>
                  </tr>
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
