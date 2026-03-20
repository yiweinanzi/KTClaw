/**
 * Team Map Page — Frame 03b
 * 团队层级拓扑图：Org chart 显示 Agent 层级关系
 */
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { useAgentsStore } from '@/stores/agents';
import { useChatStore } from '@/stores/chat';
import type { AgentSummary } from '@/types/agent';

/* ─── Color palette ─── */

const GRADIENTS = [
  'linear-gradient(135deg, #60a5fa, #3b82f6)',
  'linear-gradient(135deg, #fb923c, #f97316)',
  'linear-gradient(135deg, #fbbf24, #f59e0b)',
  'linear-gradient(135deg, #c084fc, #a855f7)',
  'linear-gradient(135deg, #f472b6, #ec4899)',
  'linear-gradient(135deg, #34d399, #10b981)',
];

const ICONS = ['🔍', '🤖', '⚡', '🧠', '🛡️', '📊'];

function agentGradient(idx: number) { return GRADIENTS[idx % GRADIENTS.length]; }
function agentIcon(idx: number) { return ICONS[idx % ICONS.length]; }

/* ─── Recent activity helper ─── */

const RECENT_MS = 5 * 60 * 1000; // 5 min

function isRecentlyActive(ts: number | undefined): boolean {
  return !!ts && Date.now() - ts < RECENT_MS;
}

/* ─── Node card ─── */

function AgentNode({
  agent,
  idx,
  isRoot,
  isActive,
}: {
  agent: AgentSummary;
  idx: number;
  isRoot: boolean;
  isActive: boolean;
}) {
  const gradient = isRoot ? 'linear-gradient(135deg, #10b981, #059669)' : agentGradient(idx);
  const icon = isRoot ? '✦' : agentIcon(idx);

  return (
    <div
      className={cn(
        'rounded-2xl bg-white p-5 text-center shadow-[0_1px_4px_rgba(0,0,0,0.06)] cursor-pointer transition-all hover:-translate-y-0.5',
        isRoot
          ? 'w-[184px] border-2 border-[#007aff] shadow-[0_2px_16px_rgba(0,122,255,0.12)] hover:shadow-[0_4px_20px_rgba(0,122,255,0.18)]'
          : 'w-[160px] border border-black/[0.06] hover:shadow-[0_4px_16px_rgba(0,0,0,0.1)]',
      )}
    >
      <div
        className={cn(
          'mx-auto mb-3 flex items-center justify-center rounded-2xl text-white',
          isRoot ? 'h-[52px] w-[52px] text-[24px]' : 'h-[48px] w-[48px] text-[20px]',
        )}
        style={{ background: gradient }}
      >
        {icon}
      </div>
      <p className={cn('font-semibold text-[#000000]', isRoot ? 'text-[15px]' : 'text-[14px]')}>
        {agent.name}
      </p>
      <p className="text-[12px] text-[#8e8e93]">{agent.id}</p>
      <div className="mt-2 flex items-center justify-center gap-2 text-[12px]">
        <span className={cn('flex items-center gap-1', isActive ? 'text-[#007aff]' : 'text-[#8e8e93]')}>
          <span className={cn('h-[6px] w-[6px] rounded-full', isActive ? 'bg-[#007aff]' : 'bg-[#d1d5db]')} />
          {isActive ? '活跃' : '待命'}
        </span>
        {agent.channelTypes.length > 0 && (
          <span className="text-[#10b981]">{agent.channelTypes.length} ch</span>
        )}
      </div>
    </div>
  );
}

/* ─── Dynamic SVG connector lines ─── */

function ConnectorLines({ childCount }: { childCount: number }) {
  if (childCount === 0) return null;

  // Each child node is 160px wide with 24px gap
  const nodeW = 160;
  const gap = 24;
  const totalW = childCount * nodeW + (childCount - 1) * gap;
  const svgW = Math.max(totalW, 200);
  const cx = svgW / 2;
  const midY = 28;

  // x centers of each child
  const childCenters = Array.from({ length: childCount }, (_, i) => {
    const startX = (svgW - totalW) / 2;
    return startX + i * (nodeW + gap) + nodeW / 2;
  });

  const leftX = childCenters[0];
  const rightX = childCenters[childCenters.length - 1];

  return (
    <svg
      width={svgW}
      height={56}
      className="-my-px overflow-visible"
      style={{ display: 'block' }}
    >
      {/* Vertical from root down to horizontal bar */}
      <line x1={cx} y1={0} x2={cx} y2={midY} stroke="#d1d5db" strokeWidth="1.5" />
      {/* Horizontal bar */}
      {childCount > 1 && (
        <line x1={leftX} y1={midY} x2={rightX} y2={midY} stroke="#d1d5db" strokeWidth="1.5" />
      )}
      {/* Vertical drops to each child */}
      {childCenters.map((x, i) => (
        <line key={i} x1={x} y1={midY} x2={x} y2={56} stroke="#d1d5db" strokeWidth="1.5" />
      ))}
    </svg>
  );
}

/* ─── Empty state ─── */

function EmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
      <span className="text-[40px]">🤖</span>
      <p className="text-[14px] text-[#8e8e93]">暂无 Agent</p>
      <p className="text-[12px] text-[#c6c6c8]">在「员工总览」页面创建 Agent 后显示</p>
    </div>
  );
}

/* ─── Main component ─── */

export function TeamMap() {
  const [activeTab, setActiveTab] = useState<'Teams' | 'Hierarchy'>('Hierarchy');

  const { agents, loading, fetchAgents, defaultAgentId } = useAgentsStore();
  const sessionLastActivity = useChatStore((s) => s.sessionLastActivity);

  useEffect(() => { void fetchAgents(); }, [fetchAgents]);

  const rootAgent = agents.find((a) => a.id === defaultAgentId) ?? agents[0] ?? null;
  const childAgents = agents.filter((a) => a.id !== rootAgent?.id);

  return (
    <div className="flex h-full flex-col bg-[#f2f2f7] p-6">
      <div className="relative flex flex-1 flex-col overflow-hidden rounded-2xl bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">

        {/* Legend top-right */}
        <div className="absolute right-5 top-4 flex items-center gap-4 text-[12px] text-[#3c3c43]">
          <span className="flex items-center gap-1.5">
            <span className="h-[7px] w-[7px] rounded-full bg-[#007aff]" />
            活跃
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-[7px] w-[7px] rounded-full bg-[#8e8e93]" />
            待命
          </span>
          {loading && (
            <span className="text-[#c6c6c8]">加载中...</span>
          )}
        </div>

        {/* Org chart */}
        {!loading && !rootAgent ? (
          <EmptyState />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center pb-16 pt-8">
            {/* Root node */}
            {rootAgent && (
              <AgentNode
                agent={rootAgent}
                idx={0}
                isRoot
                isActive={isRecentlyActive(sessionLastActivity[rootAgent.mainSessionKey])}
              />
            )}

            {/* Connector lines */}
            {childAgents.length > 0 && rootAgent && (
              <ConnectorLines childCount={childAgents.length} />
            )}

            {/* Children row */}
            {childAgents.length > 0 && (
              <div className="flex flex-wrap justify-center gap-6">
                {childAgents.map((agent, idx) => (
                  <AgentNode
                    key={agent.id}
                    agent={agent}
                    idx={idx}
                    isRoot={false}
                    isActive={isRecentlyActive(sessionLastActivity[agent.mainSessionKey])}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Zoom controls (bottom-left) */}
        <div className="absolute bottom-4 left-4 flex flex-col gap-1">
          {['+', '−', '⛶'].map((icon) => (
            <button
              key={icon}
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-black/10 bg-white text-[14px] text-[#3c3c43] shadow-sm transition-colors hover:bg-[#f2f2f7]"
            >
              {icon}
            </button>
          ))}
        </div>

        {/* Tab switcher (bottom-center) */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
          <div className="flex rounded-lg border border-black/10 bg-white p-0.5 shadow-sm">
            {(['Teams', 'Hierarchy'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={cn(
                  'rounded-md px-4 py-1.5 text-[13px] transition-colors',
                  activeTab === tab
                    ? 'bg-[#1c1c1e] font-medium text-white'
                    : 'text-[#3c3c43] hover:bg-[#f2f2f7]',
                )}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default TeamMap;
