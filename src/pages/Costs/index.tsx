/**
 * Costs Page — 费用 / Token 用量统计
 * 对接 /api/usage/recent-token-history
 */
import { useCallback, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { hostApiFetch } from '@/lib/host-api';
import { RefreshCw, TrendingUp, Zap, DollarSign, BarChart3 } from 'lucide-react';

/* ─── Types ─── */

interface TokenUsageEntry {
  timestamp: string;
  sessionId: string;
  agentId: string;
  model?: string;
  provider?: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens: number;
  costUsd?: number;
}

/* ─── Helpers ─── */

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatCost(usd?: number): string {
  if (usd == null) return '—';
  if (usd < 0.001) return '<$0.001';
  return `$${usd.toFixed(4)}`;
}

function formatDate(ts: string): string {
  try {
    return new Date(ts).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch {
    return ts;
  }
}

/* ─── Main component ─── */

export function Costs() {
  const [entries, setEntries] = useState<TokenUsageEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState(200);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await hostApiFetch<TokenUsageEntry[]>(
        `/api/usage/recent-token-history?limit=${limit}`,
      );
      setEntries(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  /* ─── Aggregates ─── */
  const totalInput = entries.reduce((s, e) => s + e.inputTokens, 0);
  const totalOutput = entries.reduce((s, e) => s + e.outputTokens, 0);
  const totalCache = entries.reduce((s, e) => s + e.cacheReadTokens + e.cacheWriteTokens, 0);
  const totalCost = entries.reduce((s, e) => s + (e.costUsd ?? 0), 0);

  // Per-model breakdown
  const modelMap = new Map<string, { tokens: number; cost: number; count: number }>();
  for (const e of entries) {
    const key = e.model ?? '未知模型';
    const prev = modelMap.get(key) ?? { tokens: 0, cost: 0, count: 0 };
    modelMap.set(key, {
      tokens: prev.tokens + e.totalTokens,
      cost: prev.cost + (e.costUsd ?? 0),
      count: prev.count + 1,
    });
  }
  const modelRows = [...modelMap.entries()].sort((a, b) => b[1].tokens - a[1].tokens);

  return (
    <div className="flex h-full flex-col bg-[#f2f2f7]">
      {/* Header */}
      <div className="flex h-[52px] shrink-0 items-center justify-between border-b border-[#c6c6c8] bg-white px-5">
        <h1 className="text-[15px] font-semibold text-[#000000]">费用 / 用量</h1>
        <div className="flex items-center gap-3">
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="h-8 rounded-lg border border-[#c6c6c8] bg-[#f2f2f7] px-2 text-[12px] text-[#3c3c43] outline-none"
          >
            <option value={50}>最近 50 条</option>
            <option value={200}>最近 200 条</option>
            <option value={500}>最近 500 条</option>
          </select>
          <button
            type="button"
            onClick={() => void fetchData()}
            disabled={loading}
            className="flex h-8 items-center gap-1.5 rounded-lg px-3 text-[13px] text-[#3c3c43] transition-colors hover:bg-[#f2f2f7] disabled:opacity-50"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            刷新
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {error && (
          <div className="rounded-xl bg-[#fef2f2] px-4 py-3 text-[13px] text-[#ef4444]">{error}</div>
        )}

        {/* Summary cards */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { icon: <Zap className="h-4 w-4" />, label: '输入 Token', value: formatTokens(totalInput), color: '#007aff' },
            { icon: <TrendingUp className="h-4 w-4" />, label: '输出 Token', value: formatTokens(totalOutput), color: '#10b981' },
            { icon: <BarChart3 className="h-4 w-4" />, label: '缓存 Token', value: formatTokens(totalCache), color: '#f59e0b' },
            { icon: <DollarSign className="h-4 w-4" />, label: '总费用 (USD)', value: formatCost(totalCost), color: '#ff6a00' },
          ].map((card) => (
            <div key={card.label} className="rounded-xl bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
              <div className="flex items-center gap-2 mb-2" style={{ color: card.color }}>
                {card.icon}
                <span className="text-[11px] font-semibold uppercase tracking-[0.5px] text-[#8e8e93]">{card.label}</span>
              </div>
              <p className="text-[22px] font-semibold text-[#000000]">{card.value}</p>
            </div>
          ))}
        </div>

        {/* Model breakdown */}
        {modelRows.length > 0 && (
          <div className="rounded-xl bg-white shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
            <div className="border-b border-[#f2f2f7] px-5 py-3">
              <span className="text-[13px] font-semibold text-[#000000]">模型用量分布</span>
            </div>
            <div className="divide-y divide-[#f2f2f7]">
              {modelRows.map(([model, stats]) => {
                const pct = totalInput + totalOutput > 0
                  ? Math.round((stats.tokens / (totalInput + totalOutput)) * 100)
                  : 0;
                return (
                  <div key={model} className="flex items-center gap-4 px-5 py-3">
                    <span className="w-[180px] truncate text-[13px] font-medium text-[#000000]">{model}</span>
                    <div className="flex-1">
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#f2f2f7]">
                        <div
                          className="h-full rounded-full bg-[#007aff]"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                    <span className="w-[60px] text-right text-[12px] text-[#8e8e93]">{pct}%</span>
                    <span className="w-[70px] text-right text-[12px] text-[#3c3c43]">{formatTokens(stats.tokens)}</span>
                    <span className="w-[80px] text-right text-[12px] text-[#8e8e93]">{formatCost(stats.cost)}</span>
                    <span className="w-[50px] text-right text-[11px] text-[#c6c6c8]">{stats.count}次</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Recent entries table */}
        <div className="rounded-xl bg-white shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
          <div className="border-b border-[#f2f2f7] px-5 py-3">
            <span className="text-[13px] font-semibold text-[#000000]">最近记录 ({entries.length})</span>
          </div>
          {entries.length === 0 && !loading ? (
            <div className="py-8 text-center text-[13px] text-[#8e8e93]">暂无用量数据</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-[#f2f2f7] text-left text-[11px] font-semibold uppercase tracking-[0.5px] text-[#8e8e93]">
                    <th className="px-5 py-2.5">时间</th>
                    <th className="px-3 py-2.5">Agent</th>
                    <th className="px-3 py-2.5">模型</th>
                    <th className="px-3 py-2.5 text-right">输入</th>
                    <th className="px-3 py-2.5 text-right">输出</th>
                    <th className="px-3 py-2.5 text-right">缓存</th>
                    <th className="px-5 py-2.5 text-right">费用</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f2f2f7]">
                  {entries.map((e, i) => (
                    <tr key={`${e.timestamp}-${i}`} className="hover:bg-[#f9f9fb]">
                      <td className="px-5 py-2.5 text-[#8e8e93]">{formatDate(e.timestamp)}</td>
                      <td className="max-w-[120px] truncate px-3 py-2.5 text-[#3c3c43]">{e.agentId}</td>
                      <td className="max-w-[140px] truncate px-3 py-2.5 text-[#3c3c43]">{e.model ?? '—'}</td>
                      <td className="px-3 py-2.5 text-right text-[#000000]">{formatTokens(e.inputTokens)}</td>
                      <td className="px-3 py-2.5 text-right text-[#000000]">{formatTokens(e.outputTokens)}</td>
                      <td className="px-3 py-2.5 text-right text-[#8e8e93]">{formatTokens(e.cacheReadTokens + e.cacheWriteTokens)}</td>
                      <td className="px-5 py-2.5 text-right font-medium text-[#ff6a00]">{formatCost(e.costUsd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
