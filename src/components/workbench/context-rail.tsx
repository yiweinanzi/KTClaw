import { FALLBACK_WORKBENCH_DATA, shapeWorkbenchData } from '@/components/workbench/workbench-data';
import { useSettingsStore } from '@/stores/settings';

export function ContextRail() {
  const contextRailCollapsed = useSettingsStore((state) => state.contextRailCollapsed);
  const setContextRailCollapsed = useSettingsStore((state) => state.setContextRailCollapsed);
  const data = shapeWorkbenchData(FALLBACK_WORKBENCH_DATA);

  if (contextRailCollapsed) {
    return (
      <aside className="flex h-full items-center border-l border-black/5 bg-[linear-gradient(180deg,#faf8f4_0%,#f4f1ec_100%)] px-2 py-3 dark:border-white/10 dark:bg-background">
        <button
          type="button"
          aria-label="展开上下文栏 Expand context rail"
          onClick={() => setContextRailCollapsed(false)}
          className="rounded-full border border-black/10 bg-white/80 px-3 py-1.5 text-xs text-foreground/80 shadow-sm transition-colors hover:bg-white dark:border-white/10 dark:bg-white/[0.06] dark:hover:bg-white/[0.1]"
        >
          {'>'}
        </button>
      </aside>
    );
  }

  return (
    <aside className="h-full w-[320px] space-y-4 border-l border-black/5 bg-[linear-gradient(180deg,#faf8f4_0%,#f4f1ec_100%)] px-4 py-5 dark:border-white/10 dark:bg-background">
      <header className="flex items-center justify-between px-1">
        <p className="text-[14px] font-medium tracking-wide text-muted-foreground">上下文</p>
        <button
          type="button"
          aria-label="收起上下文栏 Collapse context rail"
          onClick={() => setContextRailCollapsed(true)}
          className="text-[13px] text-muted-foreground transition-colors hover:text-foreground"
        >
          折叠
        </button>
      </header>

      <section className="rounded-[28px] border border-black/5 bg-white/80 p-5 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
        <h3 className="text-[15px] font-semibold text-foreground">当前任务</h3>
        <p className="mt-3 text-[14px] leading-7 text-muted-foreground">
          {data.task.title}，下一次 Cron 执行时间 {data.task.due}。
        </p>
      </section>

      <section className="rounded-[28px] border border-black/5 bg-white/80 p-5 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
        <h3 className="text-[15px] font-semibold text-foreground">当前 Agent</h3>
        <p className="mt-3 text-[14px] leading-7 text-muted-foreground">
          {data.team.description}
        </p>
      </section>

      <section className="rounded-[28px] border border-black/5 bg-white/80 p-5 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
        <h3 className="text-[15px] font-semibold text-foreground">当前文件</h3>
        <p className="mt-3 text-[14px] leading-7 text-muted-foreground">
          已引用 产品文档.md、渠道清单和历史会话摘要。
        </p>
      </section>

      <section className="rounded-[28px] border border-black/5 bg-white/80 p-5 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
        <h3 className="text-[15px] font-semibold text-foreground">通道状态</h3>
        <p className="mt-3 text-[14px] leading-7 text-muted-foreground">
          {data.channel.name}，{data.channel.status}。
        </p>
      </section>
    </aside>
  );
}
