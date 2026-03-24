import { useState } from 'react';
import { useChatStore } from '@/stores/chat';
import { useGatewayStore } from '@/stores/gateway';

type WorkbenchEmptyStateProps = Record<string, never>;

const quickActions = [
  { label: '解释代码', prompt: '请解释这段代码的作用和原理' },
  { label: '写单测', prompt: '为这个函数编写单元测试，覆盖边界情况' },
  { label: '代码审查', prompt: '请帮我做代码审查，找出潜在的 bug 和改进点' },
  { label: '优化性能', prompt: '分析并优化这段代码的性能瓶颈' },
  { label: 'SQL 生成', prompt: '根据以下需求生成对应的 SQL 查询语句：' },
  { label: '文档生成', prompt: '为这段代码生成清晰的注释和 API 文档' },
];

const suggestions = [
  {
    icon: '🔧',
    title: '代码重构方案',
    description: '提取 src/utils 核心逻辑并编写单测',
  },
  {
    icon: '📊',
    title: '检查系统健康度',
    description: '调出监控面板，查昨日定时任务状态',
  },
  {
    icon: '📝',
    title: '撰写周报汇总',
    description: '收集近 5 天 Git commit 生成团队周报',
  },
  {
    icon: '🧠',
    title: '查看团队记忆',
    description: '总结关于架构设计的长期记忆',
  },
];

export function WorkbenchEmptyState(_props: WorkbenchEmptyStateProps) {
  const sendMessage = useChatStore((s) => s.sendMessage);
  const isGatewayRunning = useGatewayStore((s) => s.status.state === 'running');
  const [selectedQuickActionIndex, setSelectedQuickActionIndex] = useState(0);

  const selectedQuickAction = quickActions[selectedQuickActionIndex] ?? quickActions[0];

  const runQuickAction = (prompt: string) => {
    if (!isGatewayRunning) return;
    void sendMessage(prompt);
  };

  return (
    <div className="flex min-h-full flex-col items-center justify-center px-8 pb-8 pt-12 text-center">
      <div
        className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl text-[26px] text-white"
        style={{ background: 'linear-gradient(135deg, #10b981, #059669)', boxShadow: '0 4px 12px rgba(16, 185, 129, 0.2)' }}
      >
        ✦
      </div>

      <h2 className="mb-4 text-[26px] font-medium text-foreground">有什么我可以帮你的？</h2>

      {!isGatewayRunning && (
        <div className="mb-5 rounded-lg border border-amber-200/80 bg-amber-50 px-3 py-2 text-[12px] text-amber-700">
          Gateway disconnected. Start the Gateway to enable actions.
        </div>
      )}

      {/* Quick Action Bar */}
      <div
        role="toolbar"
        aria-label="Quick action bar"
        className="mb-6 w-full max-w-[640px] rounded-2xl border border-black/[0.08] bg-white/95 p-3 text-left shadow-[0_10px_30px_rgba(0,0,0,0.06)] backdrop-blur-sm"
      >
        <div className="flex flex-wrap items-center gap-2">
          {quickActions.map((action, index) => {
            const isSelected = index === selectedQuickActionIndex;
            return (
              <button
                key={action.label}
                type="button"
                aria-label={`Quick action: ${action.label}`}
                aria-pressed={isSelected}
                onClick={() => {
                  setSelectedQuickActionIndex(index);
                  runQuickAction(action.prompt);
                }}
                disabled={!isGatewayRunning}
                className={`rounded-full border px-4 py-1.5 text-[13px] font-medium shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-all disabled:cursor-not-allowed disabled:opacity-40 ${
                  isSelected
                    ? 'border-clawx-ac/40 bg-clawx-ac/10 text-clawx-ac'
                    : 'border-black/[0.08] bg-white text-[#3c3c43] hover:-translate-y-[1px] hover:border-clawx-ac/30 hover:bg-clawx-ac/5 hover:text-clawx-ac hover:shadow-[0_4px_12px_rgba(0,122,255,0.1)]'
                }`}
              >
                {action.label}
              </button>
            );
          })}
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-black/[0.06] bg-[#f8faff] px-3 py-2.5">
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wide text-[#6b7280]">Ready to run</p>
            <p className="truncate text-[13px] font-semibold text-foreground">{selectedQuickAction.label}</p>
          </div>
          <button
            type="button"
            aria-label="Use selected action"
            onClick={() => runQuickAction(selectedQuickAction.prompt)}
            disabled={!isGatewayRunning}
            className="shrink-0 rounded-lg border border-clawx-ac/40 bg-clawx-ac/10 px-3 py-1.5 text-[12px] font-semibold text-clawx-ac transition-all hover:bg-clawx-ac/15 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Use selected action
          </button>
        </div>
      </div>

      {/* Suggestion Cards */}
      <div className="grid w-full max-w-[640px] grid-cols-2 gap-4 text-left">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion.title}
            type="button"
            onClick={() => isGatewayRunning && sendMessage(suggestion.description)}
            disabled={!isGatewayRunning}
            className={`flex flex-col gap-[6px] rounded-xl border border-black/[0.06] bg-white p-4 text-left shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-all dark:border-white/10 dark:bg-white/[0.04] ${
              isGatewayRunning
                ? 'cursor-pointer hover:-translate-y-0.5 hover:border-black/[0.15] hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)]'
                : 'cursor-not-allowed opacity-50'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="text-[18px]">{suggestion.icon}</span>
              <span className="text-[15px] font-semibold text-foreground">{suggestion.title}</span>
            </div>
            <p className="text-[13px] leading-[1.4] text-[#3c3c43]">{suggestion.description}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
