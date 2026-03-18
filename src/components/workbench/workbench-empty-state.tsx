type WorkbenchEmptyStateProps = Record<string, never>;

export function WorkbenchEmptyState(_props: WorkbenchEmptyStateProps) {
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

  return (
    <div className="flex min-h-full flex-col items-center justify-center px-8 pb-8 pt-12 text-center">
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-black text-[26px] text-white dark:bg-white dark:text-black">
        ✦
      </div>
      <h2 className="mb-8 text-[26px] font-medium text-foreground">有什么我可以帮你的？</h2>
      <div className="mt-4 grid w-full max-w-[640px] grid-cols-2 gap-4 text-left">
        {suggestions.map((suggestion) => (
          <article
            key={suggestion.title}
            className="flex cursor-pointer flex-col gap-[6px] rounded-xl border border-black/[0.06] bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-all hover:-translate-y-0.5 hover:border-black/[0.15] hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)] dark:border-white/10 dark:bg-white/[0.04]"
          >
            <div className="flex items-center gap-2">
              <span className="text-[18px]">{suggestion.icon}</span>
              <span className="text-[15px] font-semibold text-foreground">{suggestion.title}</span>
            </div>
            <p className="text-[13px] leading-[1.4] text-[#3c3c43]">{suggestion.description}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
