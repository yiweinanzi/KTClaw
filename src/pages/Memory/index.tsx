import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw, FolderOpen, BarChart3, BookOpen, Save, X, AlertTriangle, AlertCircle, Info, RotateCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { hostApiFetch } from '@/lib/host-api';

// ── Types ────────────────────────────────────────────────────────

type MemoryFileCategory = 'evergreen' | 'daily' | 'other';
type HealthSeverity = 'critical' | 'warning' | 'info' | 'ok';
type Tab = 'overview' | 'browser' | 'guide';
type SortKey = 'date' | 'name' | 'size';

interface MemoryFileInfo {
  label: string;
  path: string;
  relativePath: string;
  content: string;
  lastModified: string;
  sizeBytes: number;
  category: MemoryFileCategory;
}

interface MemoryConfig {
  memorySearch: {
    enabled: boolean;
    provider: string | null;
    model: string | null;
    hybrid: {
      enabled: boolean;
      vectorWeight: number;
      textWeight: number;
      temporalDecay: { enabled: boolean; halfLifeDays: number };
      mmr: { enabled: boolean; lambda: number };
    };
    cache: { enabled: boolean; maxEntries: number };
    extraPaths: string[];
  };
  memoryFlush: { enabled: boolean; softThresholdTokens: number };
  configFound: boolean;
}

interface MemoryStatus {
  indexed: boolean;
  lastIndexed: string | null;
  totalEntries: number | null;
  vectorAvailable: boolean | null;
  embeddingProvider: string | null;
  raw: string;
}

interface MemoryStats {
  totalFiles: number;
  totalSizeBytes: number;
  dailyLogCount: number;
  evergreenCount: number;
  oldestDaily: string | null;
  newestDaily: string | null;
  dailyTimeline: Array<{ date: string; sizeBytes: number } | null>;
}

interface MemoryHealthCheck {
  id: string;
  severity: HealthSeverity;
  title: string;
  description: string;
  affectedFiles: string[] | null;
  action: string | null;
}

interface StaleDailyLogInfo {
  relativePath: string;
  label: string;
  date: string;
  ageDays: number;
  sizeBytes: number;
}

interface MemoryHealthSummary {
  score: number;
  checks: MemoryHealthCheck[];
  staleDailyLogs: StaleDailyLogInfo[];
}

interface MemoryApiResponse {
  files: MemoryFileInfo[];
  config: MemoryConfig;
  status: MemoryStatus;
  stats: MemoryStats;
  health: MemoryHealthSummary;
  workspaceDir: string;
}

// ── Helpers ──────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)}KB`;
  return `${(kb / 1024).toFixed(1)}MB`;
}

function relativeTime(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return '刚刚';
  if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`;
  return `${Math.floor(diff / 86400)}天前`;
}

const SEVERITY_COLOR: Record<HealthSeverity, string> = {
  critical: '#ef4444', warning: '#f59e0b', info: '#007aff', ok: '#10b981',
};

const CATEGORY_COLOR: Record<MemoryFileCategory, string> = {
  evergreen: '#10b981', daily: '#007aff', other: '#8e8e93',
};


// ── Score ring ───────────────────────────────────────────────────

function ScoreRing({ score }: { score: number }) {
  const r = 36;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const color = score >= 80 ? '#10b981' : score >= 60 ? '#f59e0b' : '#ef4444';
  return (
    <div className="relative flex h-24 w-24 items-center justify-center">
      <svg width="96" height="96" viewBox="0 0 96 96" className="-rotate-90">
        <circle cx="48" cy="48" r={r} fill="none" stroke="#e5e5ea" strokeWidth="8" />
        <circle cx="48" cy="48" r={r} fill="none" stroke={color} strokeWidth="8"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.6s ease' }} />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-[22px] font-bold leading-none" style={{ color }}>{score}</span>
        <span className="text-[10px] text-[#8e8e93]">/ 100</span>
      </div>
    </div>
  );
}

// ── Timeline chart ───────────────────────────────────────────────

function TimelineChart({ timeline }: { timeline: MemoryStats['dailyTimeline'] }) {
  const max = Math.max(...timeline.map((t) => t?.sizeBytes ?? 0), 1);
  return (
    <div className="flex h-14 items-end gap-[2px]">
      {timeline.map((entry, i) => {
        const h = entry ? Math.max(4, (entry.sizeBytes / max) * 52) : 4;
        return (
          <div key={i} title={entry ? `${entry.date}: ${formatBytes(entry.sizeBytes)}` : 'No log'}
            className="flex-1 rounded-sm transition-all"
            style={{ height: h, background: entry ? '#007aff' : '#e5e5ea', opacity: entry ? 1 : 0.4 }} />
        );
      })}
    </div>
  );
}

// ── Health check item ────────────────────────────────────────────

function HealthCheckItem({ check }: { check: MemoryHealthCheck }) {
  const [open, setOpen] = useState(false);
  const Icon = check.severity === 'critical' ? AlertCircle : check.severity === 'warning' ? AlertTriangle : Info;
  return (
    <div className="rounded-xl border border-black/[0.06] bg-white">
      <button type="button" onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start gap-3 px-4 py-3 text-left">
        <Icon className="mt-0.5 h-4 w-4 shrink-0" style={{ color: SEVERITY_COLOR[check.severity] }} />
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-medium text-[#000000]">{check.title}</div>
        </div>
        <span className="text-[11px] text-[#8e8e93]">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="border-t border-black/[0.04] px-4 pb-3 pt-2">
          <p className="text-[12px] leading-5 text-[#3c3c43]">{check.description}</p>
          {check.action && <p className="mt-1.5 text-[11px] text-[#007aff]">→ {check.action}</p>}
          {check.affectedFiles && check.affectedFiles.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {check.affectedFiles.map((f) => (
                <span key={f} className="rounded bg-[#f2f2f7] px-1.5 py-0.5 font-mono text-[10px] text-[#3c3c43]">{f}</span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Overview Tab ─────────────────────────────────────────────────

function OverviewTab({
  data,
  onReindex,
  reindexing,
}: {
  data: MemoryApiResponse;
  onReindex: () => void;
  reindexing: boolean;
}) {
  const { stats, status, config, health } = data;
  const scoreLabel = health.score >= 80 ? '健康' : health.score >= 60 ? '需关注' : '需修复';

  return (
    <div className="space-y-4">
      {/* Hero: score + stats */}
      <div className="flex items-center gap-6 rounded-2xl border border-black/[0.06] bg-white p-5">
        <ScoreRing score={health.score} />
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-semibold text-[#000000]">记忆健康度 · {scoreLabel}</div>
          <div className="mt-1 text-[12px] text-[#8e8e93]">
            {health.checks.filter((c) => c.severity === 'critical').length} 个严重问题 ·{' '}
            {health.checks.filter((c) => c.severity === 'warning').length} 个警告 ·{' '}
            {health.checks.filter((c) => c.severity === 'info').length} 个提示
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={onReindex}
              disabled={reindexing}
              className="flex items-center gap-1.5 rounded-lg bg-[#007aff] px-3 py-1.5 text-[12px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              <RotateCw className={cn('h-3 w-3', reindexing && 'animate-spin')} />
              {reindexing ? '重建中…' : '重建索引'}
            </button>
            <span className="text-[11px] text-[#8e8e93]">
              {status.indexed
                ? `已索引 · ${status.totalEntries ?? '?'} 条目`
                : '未建立向量索引'}
            </span>
          </div>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: '文件总数', value: String(stats.totalFiles), sub: `${stats.evergreenCount} 常青 · ${stats.dailyLogCount} 日志` },
          { label: '总大小', value: formatBytes(stats.totalSizeBytes), sub: stats.oldestDaily ? `${stats.oldestDaily} 起` : '无日志' },
          { label: '向量搜索', value: config.memorySearch.enabled ? '已启用' : '未启用', sub: config.memorySearch.provider ?? '默认' },
        ].map((card) => (
          <div key={card.label} className="rounded-xl border border-black/[0.06] bg-white p-4">
            <div className="text-[11px] font-medium text-[#8e8e93]">{card.label}</div>
            <div className="mt-1 text-[18px] font-bold text-[#000000]">{card.value}</div>
            <div className="mt-0.5 text-[10px] text-[#8e8e93]">{card.sub}</div>
          </div>
        ))}
      </div>

      {/* 30-day timeline */}
      {stats.dailyTimeline.length > 0 && (
        <div className="rounded-xl border border-black/[0.06] bg-white p-4">
          <div className="mb-3 text-[12px] font-medium text-[#3c3c43]">近 30 天日志活动</div>
          <TimelineChart timeline={stats.dailyTimeline} />
          <div className="mt-2 flex justify-between text-[10px] text-[#8e8e93]">
            <span>30天前</span><span>今天</span>
          </div>
        </div>
      )}

      {/* Health checks */}
      {health.checks.length > 0 && (
        <div className="space-y-2">
          <div className="text-[12px] font-medium text-[#3c3c43]">健康检查 ({health.checks.length})</div>
          {health.checks.map((c) => <HealthCheckItem key={c.id + c.title} check={c} />)}
        </div>
      )}

      {health.checks.length === 0 && (
        <div className="rounded-xl border border-black/[0.06] bg-white px-4 py-6 text-center">
          <div className="text-[13px] font-medium text-[#10b981]">✓ 所有检查通过</div>
          <div className="mt-1 text-[12px] text-[#8e8e93]">记忆系统运行良好</div>
        </div>
      )}

      {/* Config panel */}
      <div className="rounded-xl border border-black/[0.06] bg-white p-4">
        <div className="mb-3 text-[12px] font-medium text-[#3c3c43]">配置概览</div>
        <div className="space-y-2 text-[12px]">
          {[
            ['向量搜索', config.memorySearch.enabled ? '✓ 启用' : '✗ 禁用'],
            ['时间衰减', config.memorySearch.hybrid.temporalDecay.enabled ? `✓ 半衰期 ${config.memorySearch.hybrid.temporalDecay.halfLifeDays}天` : '✗ 禁用'],
            ['MMR 多样性', config.memorySearch.hybrid.mmr.enabled ? `✓ λ=${config.memorySearch.hybrid.mmr.lambda}` : '✗ 禁用'],
            ['记忆刷新', config.memoryFlush.enabled ? `✓ ${(config.memoryFlush.softThresholdTokens / 1000).toFixed(0)}K tokens` : '✗ 禁用'],
            ['配置来源', config.configFound ? 'openclaw.json' : '默认值'],
          ].map(([k, v]) => (
            <div key={k} className="flex items-center justify-between">
              <span className="text-[#8e8e93]">{k}</span>
              <span className={cn('font-medium', v.startsWith('✓') ? 'text-[#10b981]' : v.startsWith('✗') ? 'text-[#8e8e93]' : 'text-[#000000]')}>{v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Browser Tab ──────────────────────────────────────────────────

function BrowserTab({
  files,
  onSave,
}: {
  files: MemoryFileInfo[];
  onSave: (relativePath: string, content: string) => Promise<void>;
}) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('date');
  const [selected, setSelected] = useState<MemoryFileInfo | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const filtered = useMemo(() => {
    let list = files;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((f) => f.label.toLowerCase().includes(q) || f.relativePath.toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => {
      if (sort === 'name') return a.label.localeCompare(b.label);
      if (sort === 'size') return b.sizeBytes - a.sizeBytes;
      return new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime();
    });
  }, [files, search, sort]);

  const handleSelect = (f: MemoryFileInfo) => {
    setSelected(f);
    setEditing(false);
    setDraft(f.content);
  };

  const handleEdit = () => {
    setEditing(true);
    setDraft(selected?.content ?? '');
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  const handleCancel = () => {
    setEditing(false);
    setDraft(selected?.content ?? '');
  };

  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await onSave(selected.relativePath, draft);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 gap-3" style={{ height: 'calc(100vh - 200px)' }}>
      {/* Left: file list */}
      <div className="flex w-[220px] shrink-0 flex-col gap-2">
        <input
          type="text"
          placeholder="搜索文件…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-black/[0.08] bg-white px-3 py-2 text-[12px] outline-none focus:border-[#007aff]"
        />
        <div className="flex gap-1">
          {(['date', 'name', 'size'] as SortKey[]).map((k) => (
            <button key={k} type="button" onClick={() => setSort(k)}
              className={cn('flex-1 rounded-md py-1 text-[11px] font-medium transition-colors',
                sort === k ? 'bg-[#007aff] text-white' : 'bg-white text-[#8e8e93] hover:bg-[#f2f2f7]')}>
              {k === 'date' ? '时间' : k === 'name' ? '名称' : '大小'}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
          {filtered.length === 0 && (
            <div className="py-8 text-center text-[12px] text-[#8e8e93]">无文件</div>
          )}
          {filtered.map((f) => (
            <button key={f.relativePath} type="button" onClick={() => handleSelect(f)}
              className={cn('w-full rounded-xl px-3 py-2.5 text-left transition-colors',
                selected?.relativePath === f.relativePath
                  ? 'bg-[#007aff] text-white'
                  : 'bg-white hover:bg-[#f2f2f7]')}>
              <div className="flex items-center gap-2">
                <span className="text-[13px]" style={{ color: selected?.relativePath === f.relativePath ? 'white' : CATEGORY_COLOR[f.category] }}>●</span>
                <span className="flex-1 truncate text-[12px] font-medium">{f.label}</span>
              </div>
              <div className={cn('mt-0.5 flex items-center justify-between text-[10px]',
                selected?.relativePath === f.relativePath ? 'text-white/70' : 'text-[#8e8e93]')}>
                <span>{formatBytes(f.sizeBytes)}</span>
                <span>{relativeTime(f.lastModified)}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Right: viewer/editor */}
      <div className="flex flex-1 min-w-0 flex-col rounded-2xl border border-black/[0.06] bg-white overflow-hidden">
        {!selected ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-[#8e8e93]">
            <FolderOpen className="h-10 w-10 opacity-30" />
            <span className="text-[13px]">选择左侧文件查看内容</span>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center justify-between border-b border-black/[0.06] px-4 py-3">
              <div className="min-w-0">
                <div className="truncate text-[13px] font-semibold text-[#000000]">{selected.label}</div>
                <div className="text-[11px] text-[#8e8e93]">{selected.relativePath} · {formatBytes(selected.sizeBytes)}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {!editing ? (
                  <button type="button" onClick={handleEdit}
                    className="flex items-center gap-1 rounded-lg bg-[#f2f2f7] px-3 py-1.5 text-[12px] font-medium text-[#3c3c43] hover:bg-[#e5e5ea]">
                    <span>编辑</span>
                  </button>
                ) : (
                  <>
                    <button type="button" onClick={handleCancel}
                      className="flex items-center gap-1 rounded-lg bg-[#f2f2f7] px-3 py-1.5 text-[12px] font-medium text-[#3c3c43] hover:bg-[#e5e5ea]">
                      <X className="h-3 w-3" /> 取消
                    </button>
                    <button type="button" onClick={handleSave} disabled={saving}
                      className="flex items-center gap-1 rounded-lg bg-[#007aff] px-3 py-1.5 text-[12px] font-medium text-white hover:opacity-90 disabled:opacity-50">
                      <Save className="h-3 w-3" /> {saving ? '保存中…' : '保存'}
                    </button>
                  </>
                )}
              </div>
            </div>
            {/* Content */}
            <div className="flex-1 overflow-auto min-h-0">
              {editing ? (
                <textarea
                  ref={textareaRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  className="h-full w-full resize-none p-4 font-mono text-[12px] leading-5 text-[#000000] outline-none"
                  spellCheck={false}
                />
              ) : (
                <pre className="whitespace-pre-wrap break-words p-4 font-mono text-[12px] leading-5 text-[#000000]">
                  {selected.content || <span className="text-[#8e8e93]">（空文件）</span>}
                </pre>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Guide Tab ────────────────────────────────────────────────────

function GuideTab({ config }: { config: MemoryConfig }) {
  const vw = config.memorySearch.hybrid.vectorWeight;
  const tw = config.memorySearch.hybrid.textWeight;
  const total = vw + tw || 1;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-black/[0.06] bg-white p-5">
        <div className="mb-3 text-[13px] font-semibold text-[#000000]">记忆文件最佳实践</div>
        <div className="space-y-3 text-[12px] leading-5 text-[#3c3c43]">
          {[
            ['MEMORY.md', '根目录长期记忆，保持 200 行以内。超出部分会被截断，不会加载到 Agent 上下文。'],
            ['memory/YYYY-MM-DD.md', '每日日志，记录当天的决策、进展和临时信息。超过 30 天后建议归档或删除。'],
            ['memory/topic.md', '常青主题文件，如 patterns.md、debugging.md。聚焦单一主题，建议 50KB 以内。'],
            ['文件大小', '单文件建议 < 50KB，超过 100KB 会严重影响向量检索质量。'],
            ['内容结构', '使用 Markdown 标题分节，每节聚焦一个主题，便于向量分块检索。'],
          ].map(([title, desc]) => (
            <div key={title} className="flex gap-3">
              <span className="mt-0.5 shrink-0 rounded bg-[#f2f2f7] px-1.5 py-0.5 font-mono text-[10px] text-[#3c3c43]">{title}</span>
              <span>{desc}</span>
            </div>
          ))}
        </div>
      </div>

      {config.memorySearch.enabled && (
        <div className="rounded-2xl border border-black/[0.06] bg-white p-5">
          <div className="mb-3 text-[13px] font-semibold text-[#000000]">混合检索权重</div>
          <div className="mb-2 flex items-center justify-between text-[11px] text-[#8e8e93]">
            <span>向量 {Math.round((vw / total) * 100)}%</span>
            <span>文本 {Math.round((tw / total) * 100)}%</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-[#e5e5ea]">
            <div className="h-full rounded-full bg-[#007aff]" style={{ width: `${(vw / total) * 100}%` }} />
          </div>
          <div className="mt-3 space-y-1.5 text-[12px] text-[#3c3c43]">
            <div className="flex justify-between">
              <span className="text-[#8e8e93]">时间衰减</span>
              <span>{config.memorySearch.hybrid.temporalDecay.enabled ? `半衰期 ${config.memorySearch.hybrid.temporalDecay.halfLifeDays} 天` : '禁用'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#8e8e93]">MMR 多样性</span>
              <span>{config.memorySearch.hybrid.mmr.enabled ? `λ = ${config.memorySearch.hybrid.mmr.lambda}` : '禁用'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#8e8e93]">缓存条目</span>
              <span>{config.memorySearch.cache.maxEntries}</span>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-black/[0.06] bg-white p-5">
        <div className="mb-3 text-[13px] font-semibold text-[#000000]">记忆刷新（Memory Flush）</div>
        <div className="space-y-1.5 text-[12px] text-[#3c3c43]">
          <div className="flex justify-between">
            <span className="text-[#8e8e93]">状态</span>
            <span className={config.memoryFlush.enabled ? 'text-[#10b981]' : 'text-[#8e8e93]'}>
              {config.memoryFlush.enabled ? '已启用' : '未启用'}
            </span>
          </div>
          {config.memoryFlush.enabled && (
            <div className="flex justify-between">
              <span className="text-[#8e8e93]">触发阈值</span>
              <span>{(config.memoryFlush.softThresholdTokens / 1000).toFixed(0)}K tokens</span>
            </div>
          )}
        </div>
        <p className="mt-3 text-[11px] leading-4 text-[#8e8e93]">
          Memory Flush 在上下文接近限制时自动将重要信息写入记忆文件，防止信息丢失。
        </p>
      </div>
    </div>
  );
}

// ── Main export ──────────────────────────────────────────────────

export function Memory() {
  const [tab, setTab] = useState<Tab>('overview');
  const [data, setData] = useState<MemoryApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reindexing, setReindexing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const json = await hostApiFetch<MemoryApiResponse>('/api/memory');
      setData(json);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleSave = useCallback(async (relativePath: string, content: string) => {
    await hostApiFetch<{ ok: boolean }>('/api/memory/file', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ relativePath, content }),
    });
    await load();
  }, [load]);

  const handleReindex = useCallback(async () => {
    setReindexing(true);
    try {
      await hostApiFetch<{ ok: boolean }>('/api/memory/reindex', { method: 'POST' });
      await load();
    } finally {
      setReindexing(false);
    }
  }, [load]);

  const TABS: { key: Tab; label: string; Icon: typeof BarChart3 }[] = [
    { key: 'overview', label: '概览', Icon: BarChart3 },
    { key: 'browser', label: '文件浏览', Icon: FolderOpen },
    { key: 'guide', label: '使用指南', Icon: BookOpen },
  ];

  return (
    <div className="flex h-full flex-col bg-[#f2f2f7]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-black/[0.06] bg-white px-6 py-4">
        <div>
          <h1 className="text-[17px] font-semibold text-[#000000]">🧠 记忆知识库</h1>
          <p className="mt-0.5 text-[12px] text-[#8e8e93]">
            {data ? `${data.workspaceDir}` : '管理 Agent 的长期记忆文件'}
          </p>
        </div>
        <button type="button" onClick={load} disabled={loading}
          className="flex items-center gap-1.5 rounded-lg bg-[#f2f2f7] px-3 py-2 text-[12px] font-medium text-[#3c3c43] hover:bg-[#e5e5ea] disabled:opacity-50">
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          刷新
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-black/[0.06] bg-white px-6">
        {TABS.map(({ key, label, Icon }) => (
          <button key={key} type="button" onClick={() => setTab(key)}
            className={cn('flex items-center gap-1.5 border-b-2 px-3 py-3 text-[13px] font-medium transition-colors',
              tab === key
                ? 'border-[#007aff] text-[#007aff]'
                : 'border-transparent text-[#8e8e93] hover:text-[#3c3c43]')}>
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading && (
          <div className="flex items-center justify-center py-20 text-[13px] text-[#8e8e93]">
            <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> 加载中…
          </div>
        )}
        {error && !loading && (
          <div className="rounded-xl border border-[#ef4444]/20 bg-[#ef4444]/5 p-4 text-[13px] text-[#ef4444]">
            加载失败：{error}
          </div>
        )}
        {data && !loading && (
          <>
            {tab === 'overview' && <OverviewTab data={data} onReindex={handleReindex} reindexing={reindexing} />}
            {tab === 'browser' && <BrowserTab files={data.files} onSave={handleSave} />}
            {tab === 'guide' && <GuideTab config={data.config} />}
          </>
        )}
      </div>
    </div>
  );
}
