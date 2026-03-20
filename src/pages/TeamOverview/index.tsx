/**
 * Team Overview Page — Frame 03
 * 员工与分工总览：Agent 卡片，对接 useAgentsStore
 */
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { useAgentsStore } from '@/stores/agents';
import { useChatStore } from '@/stores/chat';
import { useGatewayStore } from '@/stores/gateway';
import type { AgentSummary } from '@/types/agent';

/* ─── Color palette for agent avatars ─── */

const AVATAR_GRADIENTS = [
  'linear-gradient(135deg, #10b981, #059669)',
  'linear-gradient(135deg, #60a5fa, #3b82f6)',
  'linear-gradient(135deg, #fb923c, #f97316)',
  'linear-gradient(135deg, #fbbf24, #f59e0b)',
  'linear-gradient(135deg, #c084fc, #a855f7)',
  'linear-gradient(135deg, #f472b6, #ec4899)',
];

const AVATAR_ICONS = ['✦', '🔍', '🤖', '⚡', '🧠', '🛡️'];

function agentGradient(idx: number) { return AVATAR_GRADIENTS[idx % AVATAR_GRADIENTS.length]; }
function agentIcon(idx: number) { return AVATAR_ICONS[idx % AVATAR_ICONS.length]; }

/* ─── Time helper ─── */

function formatLastActive(ts: number | undefined): string {
  if (!ts) return '从未';
  const diff = Date.now() - ts;
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  return `${Math.floor(diff / 86_400_000)} 天前`;
}

/* ─── Channel icon map ─── */

const CHANNEL_ICONS: Record<string, string> = {
  feishu: '🪶',
  dingtalk: '📎',
  wecom: '💬',
  qqbot: '🐧',
};

/* ─── Create Agent Modal ─── */

function CreateAgentModal({ onClose, onCreate }: { onClose: () => void; onCreate: (name: string) => Promise<void> }) {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setLoading(true);
    try {
      await onCreate(name.trim());
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="w-[360px] rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-[16px] font-semibold text-[#000000]">雇佣新员工</h2>
        <div className="mb-5">
          <p className="mb-1.5 text-[13px] font-medium text-[#000000]">Agent 名称</p>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void handleSubmit()}
            placeholder="例如：数据分析师"
            className="w-full rounded-lg border border-black/10 px-3 py-2 text-[13px] outline-none focus:border-[#007aff]"
          />
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-black/10 py-2 text-[13px] text-[#3c3c43] hover:bg-[#f2f2f7]">取消</button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={loading || !name.trim()}
            className="flex-1 rounded-xl bg-[#007aff] py-2 text-[13px] font-medium text-white hover:bg-[#0056b3] disabled:opacity-50"
          >
            {loading ? '创建中...' : '确认创建'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Main component ─── */

export function TeamOverview() {
  const [createOpen, setCreateOpen] = useState(false);

  const { agents, loading, error, fetchAgents, createAgent, deleteAgent } = useAgentsStore();
  const sessionLastActivity = useChatStore((s) => s.sessionLastActivity);
  const gatewayStatus = useGatewayStore((s) => s.status);

  useEffect(() => { void fetchAgents(); }, [fetchAgents]);

  const isGatewayUp = gatewayStatus?.state === 'running';

  return (
    <div className="flex h-full flex-col bg-[#f2f2f7] p-6">
      <div className="flex flex-1 flex-col overflow-y-auto rounded-2xl bg-white p-8 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">

        {/* Header */}
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-[26px] font-semibold text-[#000000]">员工与分工总览</h1>
            <p className="mt-1 text-[13px] text-[#8e8e93]">
              {loading
                ? '加载中...'
                : error
                  ? '加载失败'
                  : `${agents.length} 个 Agent · ${isGatewayUp ? 'Gateway 在线' : 'Gateway 离线'}`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-black/10 bg-white px-4 py-2 text-[13px] font-medium text-[#000000] shadow-[0_1px_3px_rgba(0,0,0,0.06)] transition-all hover:-translate-y-[1px] hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)]"
          >
            + 雇佣新员工
          </button>
        </div>

        {/* States */}
        {loading && (
          <div className="flex flex-1 items-center justify-center text-[14px] text-[#8e8e93]">加载中...</div>
        )}
        {!loading && error && (
          <div className="flex flex-1 items-center justify-center text-[14px] text-[#ef4444]">{error}</div>
        )}
        {!loading && !error && agents.length === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
            <span className="text-[40px]">🤖</span>
            <p className="text-[14px] text-[#8e8e93]">暂无 Agent</p>
            <p className="text-[12px] text-[#c6c6c8]">点击右上角「+ 雇佣新员工」开始</p>
          </div>
        )}

        {/* Cards */}
        {!loading && !error && agents.length > 0 && (
          <div className="grid grid-cols-4 gap-4">
            {agents.map((agent, idx) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                idx={idx}
                lastActivity={sessionLastActivity[agent.mainSessionKey]}
                onDelete={() => void deleteAgent(agent.id)}
              />
            ))}
          </div>
        )}
      </div>

      {createOpen && (
        <CreateAgentModal
          onClose={() => setCreateOpen(false)}
          onCreate={createAgent}
        />
      )}
    </div>
  );
}

/* ─── Agent Card ─── */

function AgentCard({
  agent, idx, lastActivity, onDelete,
}: {
  agent: AgentSummary;
  idx: number;
  lastActivity: number | undefined;
  onDelete: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="flex flex-col rounded-2xl border border-black/[0.06] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)]">

      {/* Avatar + Name */}
      <div className="mb-4 flex items-center gap-3">
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-[20px] text-white"
          style={{ background: agentGradient(idx) }}
        >
          {agentIcon(idx)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-[15px] font-semibold text-[#000000]">{agent.name}</p>
            {agent.isDefault && (
              <span className="shrink-0 rounded-full bg-[#f0f7ff] px-1.5 py-0.5 text-[10px] font-medium text-[#007aff]">默认</span>
            )}
          </div>
          <p className="truncate text-[12px] text-[#8e8e93]">{agent.id}</p>
        </div>
      </div>

      {/* Divider */}
      <div className="mb-3 h-px bg-black/[0.05]" />

      {/* Stats */}
      <div className="space-y-2">
        <Row label="模型">
          <span className={cn('font-mono text-[12px]', agent.inheritedModel ? 'text-[#8e8e93]' : 'text-[#3c3c43]')}>
            {agent.modelDisplay}
            {agent.inheritedModel && <span className="ml-1 text-[10px] text-[#c6c6c8]">(继承)</span>}
          </span>
        </Row>
        <Row label="最近活跃">
          <span className="text-[13px] text-[#3c3c43]">{formatLastActive(lastActivity)}</span>
        </Row>
        <Row label="频道">
          {agent.channelTypes.length === 0 ? (
            <span className="text-[13px] text-[#c6c6c8]">未配置</span>
          ) : (
            <div className="flex items-center gap-1">
              {agent.channelTypes.map((ch) => (
                <span key={ch} title={ch} className="text-[14px]">
                  {CHANNEL_ICONS[ch] ?? '📡'}
                </span>
              ))}
            </div>
          )}
        </Row>
      </div>

      {/* Delete */}
      <div className="mt-4 flex justify-end">
        {confirmDelete ? (
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-[#8e8e93]">确认删除？</span>
            <button
              type="button"
              onClick={() => { onDelete(); setConfirmDelete(false); }}
              className="rounded-md bg-[#ef4444] px-2 py-0.5 text-[11px] font-medium text-white hover:bg-[#dc2626]"
            >
              删除
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="text-[11px] text-[#8e8e93] hover:text-[#3c3c43]"
            >
              取消
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="text-[11px] text-[#c6c6c8] hover:text-[#ef4444]"
          >
            解雇
          </button>
        )}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="shrink-0 text-[12px] text-[#8e8e93]">{label}</span>
      <span className="min-w-0 truncate text-right">{children}</span>
    </div>
  );
}

export default TeamOverview;
