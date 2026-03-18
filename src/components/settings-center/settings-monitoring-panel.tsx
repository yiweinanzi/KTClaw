import { startTransition, useState } from 'react';
import { AlertTriangle, ShieldCheck, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SettingsSectionCard } from './settings-section-card';

type MonitoringTabId = 'dashboard' | 'usage' | 'alerts';

const KPI_CARDS = [
  { label: '总预估花费', value: '$142.50', meta: '较上周 +27% (+$30)', tone: 'text-rose-500' },
  { label: '本周花费', value: '$34.12', meta: '上周 $28.00', tone: 'text-[#667085]' },
  { label: '缓存节省', value: '$89.40', meta: 'Hit Rate: 68%', tone: 'text-emerald-600' },
  { label: '异常情况', value: '0', meta: '全部服务正常运行', tone: 'text-[#667085]' },
] as const;

const COST_SPIKES = [
  { name: 'x-radar-collect', value: '$45.20', meta: '60 次执行 · 均价 $0.75/次', accent: 'bg-rose-500' },
  { name: 'daily-digest-news', value: '$28.90', meta: '30 次执行 · 均价 $0.96/次', accent: 'bg-amber-500' },
  { name: 'github-issue-triage', value: '$15.40', meta: '120 次执行 · 均价 $0.12/次', accent: 'bg-sky-500' },
] as const;

const DAILY_COST = [
  { day: 'Mon', value: 80 },
  { day: 'Tue', value: 60 },
  { day: 'Wed', value: 140 },
  { day: 'Thu', value: 92 },
  { day: 'Fri', value: 112 },
  { day: 'Sat', value: 42 },
  { day: 'Sun', value: 52 },
] as const;

const TOKEN_SPLIT = [
  { label: 'Input', value: '15% (1.8M)', color: '#0a7aff' },
  { label: 'Output', value: '20% (2.4M)', color: '#10b981' },
  { label: 'Cache Hit', value: '65% (7.8M)', color: '#dbe2ea' },
] as const;

const RECENT_TASKS = [
  { name: 'x-radar-collect', runs: '60', input: '240k', output: '120k', cache: '1.2M', cost: '$45.20' },
  { name: 'daily-digest-news', runs: '30', input: '180k', output: '80k', cache: '800k', cost: '$28.90' },
  { name: 'github-issue-triage', runs: '120', input: '80k', output: '40k', cache: '300k', cost: '$15.40' },
] as const;

const USAGE_ROWS = [
  { name: 'x-radar-collect', value: '32.48% (924.5k)', color: '#ef4444' },
  { name: 'daily-digest-news', value: '16.58% (471.8k)', color: '#f59e0b' },
  { name: 'github-issue-triage', value: '13.20% (375.6k)', color: '#10b981' },
  { name: 'auth-watchman', value: '8.60% (244.7k)', color: '#3b82f6' },
  { name: 'monkey-discovery', value: '6.40% (182.1k)', color: '#8b5cf6' },
  { name: 'vault-snapshot', value: '5.30% (150.8k)', color: '#ec4899' },
  { name: 'builder-briefing', value: '4.30% (122.3k)', color: '#6366f1' },
  { name: 'outpost-mirror', value: '3.70% (105.2k)', color: '#14b8a6' },
  { name: 'robin-weekly-brief', value: '3.30% (93.9k)', color: '#0ea5e9' },
  { name: '其他 Others (32 个任务)', value: '6.14% (174.6k)', color: '#64748b' },
] as const;

const ALERT_ROWS = [
  {
    title: 'Quota & Billing Alert',
    description: '对日均 Token 与预估花费设置静态阈值骨架，用于后续接入真实策略。',
    icon: Wallet,
    body: [
      { label: '日均 Token 警戒阈值', value: '200,000' },
      { label: '预估费用提醒上限', value: '$1.50 / Day' },
    ],
  },
  {
    title: '数据清洗与下沉',
    description: '保留日志留存、归档下沉与孤儿执行件清理等治理入口。',
    icon: ShieldCheck,
    body: [
      { label: '日志及运行调试包保留策略', value: '保留 30 天后转冷存储' },
      { label: '自动删除孤儿执行件', value: '已启用' },
    ],
  },
  {
    title: '异常响应升级',
    description: '当成本异常、失败重试或缓存命中下降时，触发更严格的告警链路。',
    icon: AlertTriangle,
    body: [
      { label: '升级到 IM 通道阈值', value: '2 次 / 小时' },
      { label: '升级到人工审批阈值', value: '5 次 / 小时' },
    ],
  },
] as const;

const TABS: Array<{ id: MonitoringTabId; label: string }> = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'usage', label: 'Usage Breakdown' },
  { id: 'alerts', label: 'Alerts & Policies' },
];

export function SettingsMonitoringPanel() {
  const [activeTab, setActiveTab] = useState<MonitoringTabId>('dashboard');

  return (
    <div className="space-y-6">
      <div className="border-b border-black/[0.08]">
        <div role="tablist" aria-label="Monitoring tabs" className="flex flex-wrap gap-6">
          {TABS.map((tab) => {
            const active = tab.id === activeTab;

            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  startTransition(() => setActiveTab(tab.id));
                }}
                className={cn(
                  'border-b-2 pb-3 text-[13px] font-medium transition-colors',
                  active
                    ? 'border-[#0a7aff] text-[#0a7aff]'
                    : 'border-transparent text-[#8e8e93] hover:text-[#111827]',
                )}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {activeTab === 'dashboard' ? <DashboardTab /> : null}
      {activeTab === 'usage' ? <UsageTab /> : null}
      {activeTab === 'alerts' ? <AlertsTab /> : null}
    </div>
  );
}

function DashboardTab() {
  return (
    <section role="tabpanel" aria-label="Dashboard" className="space-y-5">
      <div className="grid gap-4 xl:grid-cols-4">
        {KPI_CARDS.map((item) => (
          <div
            key={item.label}
            className="rounded-[18px] border border-black/[0.06] bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.06)]"
          >
            <div className="text-[13px] text-[#8e8e93]">{item.label}</div>
            <div className="mt-2 text-[28px] font-bold tracking-[-0.03em] text-[#111827]">{item.value}</div>
            <div className={cn('mt-2 text-[12px] font-medium', item.tone)}>{item.meta}</div>
          </div>
        ))}
      </div>

      <div>
        <div className="mb-3 text-[14px] font-semibold text-[#334155]">消耗最高定时任务 (30 Days)</div>
        <div className="grid gap-4 xl:grid-cols-3">
          {COST_SPIKES.map((item) => (
            <div
              key={item.name}
              className="overflow-hidden rounded-[18px] border border-black/[0.06] bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)]"
            >
              <div className={cn('h-1 w-full', item.accent)} />
              <div className="p-5">
                <div className="text-[15px] font-semibold text-[#111827]">{item.name}</div>
                <div className="mt-2 text-[24px] font-bold tracking-[-0.03em] text-[#111827]">{item.value}</div>
                <div className="mt-2 text-[12px] text-[#8e8e93]">{item.meta}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <SettingsSectionCard title="每日预估花费 (7 Days)">
          <div className="relative flex h-48 items-end gap-4 border-b border-[#eef2f6] pb-4">
            {[32, 72, 112, 152].map((offset) => (
              <div
                key={offset}
                className="absolute inset-x-0 border-t border-dashed border-[#eef2f6]"
                style={{ top: `${offset}px` }}
              />
            ))}
            {DAILY_COST.map((bar) => (
              <div key={bar.day} className="relative z-[1] flex flex-1 flex-col items-center justify-end gap-2">
                <div
                  className="w-7 rounded-t-[6px] bg-[#0a7aff]/85"
                  style={{ height: `${bar.value}px` }}
                />
                <span className="text-[10px] text-[#8e8e93]">{bar.day}</span>
              </div>
            ))}
          </div>
        </SettingsSectionCard>

        <SettingsSectionCard title="Token 分布">
          <div className="flex flex-col items-center gap-5">
            <div
              className="relative h-32 w-32 rounded-full"
              style={{
                background:
                  'conic-gradient(#0a7aff 0% 15%, #10b981 15% 35%, #dbe2ea 35% 100%)',
              }}
            >
              <div className="absolute inset-5 flex flex-col items-center justify-center rounded-full bg-white">
                <span className="text-[20px] font-bold text-[#111827]">12M</span>
                <span className="text-[10px] text-[#8e8e93]">Tokens</span>
              </div>
            </div>

            <div className="w-full space-y-3">
              {TOKEN_SPLIT.map((item) => (
                <div key={item.label} className="flex items-center justify-between gap-4 text-[12px]">
                  <span className="flex items-center gap-2 text-[#667085]">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: item.color }}
                    />
                    {item.label}
                  </span>
                  <span className="font-semibold text-[#111827]">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        </SettingsSectionCard>
      </div>

      <SettingsSectionCard title="明细数据 (Recent Tasks)">
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-left text-[13px]">
            <thead>
              <tr className="border-b border-[#eef2f6] text-[#8e8e93]">
                <th className="px-0 py-3 font-medium">任务名称 (Job Name)</th>
                <th className="px-0 py-3 font-medium">执行次数</th>
                <th className="px-0 py-3 font-medium">Input</th>
                <th className="px-0 py-3 font-medium">Output</th>
                <th className="px-0 py-3 font-medium">Cache Hit</th>
                <th className="px-0 py-3 text-right font-medium">总消耗 ($)</th>
              </tr>
            </thead>
            <tbody>
              {RECENT_TASKS.map((row) => (
                <tr key={row.name} className="border-b border-[#f7f8fa] last:border-b-0">
                  <td className="px-0 py-3 font-medium text-[#111827]">{row.name}</td>
                  <td className="px-0 py-3 text-[#667085]">{row.runs}</td>
                  <td className="px-0 py-3 text-[#667085]">{row.input}</td>
                  <td className="px-0 py-3 text-[#667085]">{row.output}</td>
                  <td className="px-0 py-3 font-medium text-emerald-600">{row.cache}</td>
                  <td className="px-0 py-3 text-right font-semibold text-[#111827]">{row.cost}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SettingsSectionCard>
    </section>
  );
}

function UsageTab() {
  return (
    <section role="tabpanel" aria-label="Usage Breakdown">
      <SettingsSectionCard
        title="Usage Breakdown"
        description="统计范围: 定时任务会话累计 (15 Days)"
        className="p-6"
      >
        <div className="text-[28px] font-bold tracking-[-0.04em] text-[#111827]">
          2,845,910 Total Tokens
        </div>

        <div className="grid gap-8 xl:grid-cols-[280px_minmax(0,1fr)]">
          <div
            className="relative mx-auto h-[280px] w-[280px] rounded-full"
            style={{
              background:
                'conic-gradient(#ef4444 0% 32.5%, #f59e0b 32.5% 49%, #10b981 49% 62.2%, #3b82f6 62.2% 70.8%, #8b5cf6 70.8% 77.2%, #ec4899 77.2% 82.5%, #6366f1 82.5% 86.8%, #14b8a6 86.8% 90.5%, #0ea5e9 90.5% 93.8%, #64748b 93.8% 100%)',
            }}
          >
            <div className="absolute inset-10 flex flex-col items-center justify-center rounded-full bg-white text-center">
              <span className="text-[14px] font-semibold text-[#667085]">定时任务</span>
              <span className="mt-1 text-[20px] font-bold text-[#111827]">2.84M</span>
            </div>
          </div>

          <div className="space-y-1.5">
            {USAGE_ROWS.map((item) => (
              <div
                key={item.name}
                className="flex items-center gap-3 rounded-xl px-3 py-2 text-[13px] transition-colors hover:bg-[#f8fafc]"
              >
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                <span className={cn('flex-1', item.name.startsWith('其他') ? 'text-[#8e8e93]' : 'font-medium text-[#111827]')}>
                  {item.name}
                </span>
                <span className="text-[#8e8e93]">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </SettingsSectionCard>
    </section>
  );
}

function AlertsTab() {
  return (
    <section role="tabpanel" aria-label="Alerts & Policies" className="space-y-5">
      {ALERT_ROWS.map((panel) => {
        const Icon = panel.icon;

        return (
          <SettingsSectionCard
            key={panel.title}
            title={panel.title}
            description={panel.description}
          >
            <div className="flex items-start gap-4 rounded-2xl bg-[#f8fafc] px-4 py-3">
              <div className="rounded-xl bg-white p-2 shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
                <Icon className="h-4 w-4 text-[#0a7aff]" />
              </div>
              <div className="flex-1 space-y-3">
                {panel.body.map((row) => (
                  <div key={row.label} className="flex flex-col gap-1 rounded-xl border border-black/[0.05] bg-white px-4 py-3">
                    <span className="text-[12px] font-medium text-[#667085]">{row.label}</span>
                    <span className="text-[14px] text-[#111827]">{row.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </SettingsSectionCard>
        );
      })}
    </section>
  );
}
