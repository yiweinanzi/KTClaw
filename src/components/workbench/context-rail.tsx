import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useSettingsStore } from '@/stores/settings';
import { useAgentsStore } from '@/stores/agents';
import { useChatStore } from '@/stores/chat';
import { CHANNEL_ICONS } from '@/types/channel';

export function ContextRail() {
  const rightPanelMode = useSettingsStore((state) => state.rightPanelMode);
  const setRightPanelMode = useSettingsStore((state) => state.setRightPanelMode);
  const [openModules, setOpenModules] = useState({
    about: true,
    capabilities: true,
    context: false,
    memory: false,
  });

  const currentAgentId = useChatStore((s) => s.currentAgentId);
  const agents = useAgentsStore((s) => s.agents);
  const defaultAgentId = useAgentsStore((s) => s.defaultAgentId);
  const currentAgent = agents.find((a) => a.id === (currentAgentId ?? defaultAgentId)) ?? agents[0] ?? null;

  const toggleModule = (key: keyof typeof openModules) => {
    setOpenModules((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  if (rightPanelMode === null) return null;

  if (rightPanelMode === 'files') {
    return (
      <aside className="flex h-full w-[320px] shrink-0 flex-col overflow-y-auto border-l border-black/[0.06] bg-white dark:border-white/10 dark:bg-background">
        <header className="flex h-[52px] shrink-0 items-center justify-between border-b border-black/[0.06] px-5">
          <span className="text-[14px] font-semibold text-[#000000]">会话文件</span>
          <button
            type="button"
            aria-label="关闭文件面板"
            onClick={() => setRightPanelMode(null)}
            className="flex h-7 w-7 items-center justify-center rounded-full text-[16px] text-[#8e8e93] transition-colors hover:bg-[#f2f2f7] hover:text-[#000000]"
          >
            ✕
          </button>
        </header>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-5 text-center">
          <span className="text-[40px]">📂</span>
          <p className="text-[13px] text-[#8e8e93]">当前会话暂无文件</p>
        </div>
      </aside>
    );
  }

  return (
    <aside className="flex h-full w-[320px] shrink-0 flex-col overflow-y-auto border-l border-black/[0.06] bg-white dark:border-white/10 dark:bg-background">
      {/* Header */}
      <header className="flex h-[52px] shrink-0 items-center justify-between border-b border-black/[0.06] px-5">
        <span className="text-[14px] font-semibold text-[#000000]">Agent 检查器</span>
        <button
          type="button"
          aria-label="关闭 Agent 检查器"
          onClick={() => setRightPanelMode(null)}
          className="flex h-7 w-7 items-center justify-center rounded-full text-[16px] text-[#8e8e93] transition-colors hover:bg-[#f2f2f7] hover:text-[#000000]"
        >
          ✕
        </button>
      </header>

      {/* Agent Profile */}
      <div className="flex flex-col items-center px-5 py-6">
        <div className="mb-3 flex h-[80px] w-[80px] items-center justify-center rounded-full bg-[#007aff] text-[32px] text-white shadow-[0_4px_16px_rgba(0,122,255,0.25)]">
          ✦
        </div>
        <p className="text-[16px] font-semibold text-[#000000]">{currentAgent?.name ?? 'KTClaw 主脑'}</p>
        <p className="mt-0.5 text-[13px] text-[#8e8e93]">{currentAgent?.id ?? 'AI coworker'}</p>
      </div>

      {/* Accordions */}
      <div className="flex flex-col gap-0 border-t border-black/[0.06] px-4 pb-6 pt-2">

        {/* 基础设定（关于我） */}
        <AccordionRow
          label="基础设定（关于我）"
          open={openModules.about}
          onToggle={() => toggleModule('about')}
        >
          <KVRow label="模型" value={currentAgent?.modelDisplay ?? '—'} />
          {currentAgent?.inheritedModel && <KVRow label="继承" value="是" />}
          {currentAgent?.isDefault && <KVRow label="默认 Agent" value="是" />}
        </AccordionRow>

        {/* 能力与工具 */}
        <AccordionRow
          label="能力与工具"
          open={openModules.capabilities}
          onToggle={() => toggleModule('capabilities')}
        >
          {currentAgent && currentAgent.channelTypes.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {currentAgent.channelTypes.map((ch) => (
                <span key={ch} className="rounded-md bg-[#f2f2f7] px-2 py-0.5 text-[12px] text-[#3c3c43]">
                  {CHANNEL_ICONS[ch as keyof typeof CHANNEL_ICONS] ?? '📡'} {ch}
                </span>
              ))}
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {['file_system', 'terminal', 'browser', 'git_ops'].map((tag) => (
                <span key={tag} className="rounded-md bg-[#f2f2f7] px-2 py-0.5 text-[12px] text-[#3c3c43]">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </AccordionRow>

        {/* 我眼中的你 */}
        <AccordionRow
          label="我眼中的你"
          open={openModules.context}
          onToggle={() => toggleModule('context')}
        >
          <KVRow label="专注" value="coding" />
          <KVRow label="时区" value="Asia/Shanghai" />
        </AccordionRow>

        {/* 工作记忆 */}
        <AccordionRow
          label="工作记忆"
          open={openModules.memory}
          onToggle={() => toggleModule('memory')}
        >
          <div className="space-y-2">
            <div>
              <p className="text-[12px] font-medium text-[#3c3c43]">
                最近笔记 <span className="text-[#8e8e93]">🔗</span>
              </p>
              <p className="mt-0.5 text-[11px] text-[#8e8e93]">当前项目暂无记录</p>
            </div>
            <div className="rounded-lg border border-[#f59e0b]/30 bg-[#fffbeb] px-3 py-2">
              <p className="text-[12px] font-medium text-[#92400e]">重要教训</p>
              <p className="mt-0.5 text-[11px] text-[#b45309]">
                执行高风险操作前请先确认...
              </p>
            </div>
          </div>
        </AccordionRow>
      </div>
    </aside>
  );
}

function AccordionRow({
  label,
  open,
  onToggle,
  children,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-black/[0.06] py-3">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="text-[13px] font-medium text-[#3c3c43]">{label}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 text-[#8e8e93] transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && <div className="mt-2">{children}</div>}
    </div>
  );
}

function KVRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-[12px] text-[#8e8e93]">{label}</span>
      <span className="text-[12px] text-[#3c3c43]">{value}</span>
    </div>
  );
}
