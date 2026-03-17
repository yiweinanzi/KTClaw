import { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Bot,
  Clock,
  Network,
  PanelLeft,
  PanelLeftClose,
  Plus,
  Settings as SettingsIcon,
  Trash2,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/stores/settings';
import { useChatStore } from '@/stores/chat';
import { useGatewayStore } from '@/stores/gateway';
import { useAgentsStore } from '@/stores/agents';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useTranslation } from 'react-i18next';
import { AccordionGroup } from '@/components/workbench/accordion-group';
import logoSvg from '@/assets/logo.svg';

function getAgentIdFromSessionKey(sessionKey: string): string {
  if (!sessionKey.startsWith('agent:')) return 'main';
  const [, agentId] = sessionKey.split(':');
  return agentId || 'main';
}

function getAgentDescription(agentName: string): string {
  if (agentName === 'KaiTianClaw' || agentName === 'KTClaw' || agentName === 'main') {
    return '默认主分身，负责通用对话与调度。';
  }
  if (agentName.includes('沉思')) {
    return '长文本分析 / 总结 / 复盘';
  }
  if (agentName.includes('监控')) {
    return '异常提醒、心跳检测、失败重试建议';
  }
  if (agentName.includes('Browser')) {
    return '浏览、搜索、页面操作';
  }
  return '当前活跃工作会话';
}

function getAvatarTone(agentName: string): string {
  if (agentName.includes('Browser')) return 'from-sky-400 to-indigo-500';
  if (agentName.includes('监控')) return 'from-emerald-400 to-teal-500';
  if (agentName.includes('沉思')) return 'from-neutral-100 to-neutral-200';
  return 'from-rose-400 via-orange-400 to-amber-300';
}

type SidebarMetaItem = {
  name: string;
  summary?: string;
  meta: string;
};

export function Sidebar() {
  const sidebarCollapsed = useSettingsStore((state) => state.sidebarCollapsed);
  const setSidebarCollapsed = useSettingsStore((state) => state.setSidebarCollapsed);

  const sessions = useChatStore((s) => s.sessions);
  const currentSessionKey = useChatStore((s) => s.currentSessionKey);
  const sessionLabels = useChatStore((s) => s.sessionLabels);
  const sessionLastActivity = useChatStore((s) => s.sessionLastActivity);
  const switchSession = useChatStore((s) => s.switchSession);
  const deleteSession = useChatStore((s) => s.deleteSession);
  const loadSessions = useChatStore((s) => s.loadSessions);
  const loadHistory = useChatStore((s) => s.loadHistory);

  const gatewayStatus = useGatewayStore((s) => s.status);
  const isGatewayRunning = gatewayStatus.state === 'running';

  useEffect(() => {
    if (!isGatewayRunning) return;
    let cancelled = false;
    const hasExistingMessages = useChatStore.getState().messages.length > 0;
    (async () => {
      await loadSessions();
      if (cancelled) return;
      await loadHistory(hasExistingMessages);
    })();
    return () => {
      cancelled = true;
    };
  }, [isGatewayRunning, loadHistory, loadSessions]);

  const agents = useAgentsStore((s) => s.agents);
  const fetchAgents = useAgentsStore((s) => s.fetchAgents);

  useEffect(() => {
    void fetchAgents();
  }, [fetchAgents]);

  const navigate = useNavigate();
  const isOnChat = useLocation().pathname === '/';
  const { t } = useTranslation(['common', 'chat']);
  const [sessionToDelete, setSessionToDelete] = useState<{ key: string; label: string } | null>(null);

  const groupLabels = {
    clones: '分身',
    teams: '团队',
    channels: 'IM 频道',
    tasks: '定时任务',
    settings: t('common:sidebar.settings'),
  };

  const getSessionLabel = (key: string, displayName?: string, label?: string) =>
    sessionLabels[key] ?? label ?? displayName ?? key;

  const agentNameById = useMemo(
    () => Object.fromEntries(agents.map((agent) => [agent.id, agent.name])),
    [agents],
  );

  const orderedSessions = useMemo(
    () => [...sessions].sort((a, b) => (sessionLastActivity[b.key] ?? 0) - (sessionLastActivity[a.key] ?? 0)),
    [sessions, sessionLastActivity],
  );

  const staticTeams: SidebarMetaItem[] = [
    { name: '研究团队', summary: 'Browser Agent + 沉思小助手 + 汇总分身', meta: '3 成员' },
    { name: '值守团队', summary: '监控分身 + 定时巡检 + 告警路由', meta: '静默' },
  ];
  const staticChannels: SidebarMetaItem[] = [
    { name: '飞书项目群', meta: '已连接' },
    { name: 'Telegram 通知', meta: '待验证' },
    { name: 'QQ Bot', meta: '未启用' },
  ];
  const staticCronTasks: SidebarMetaItem[] = [
    { name: '早报总结', meta: '09:00' },
    { name: '监控巡检', meta: '每 30 分钟' },
    { name: '周报汇总', meta: '周一 10:00' },
  ];

  return (
    <aside
      className={cn(
        'flex shrink-0 flex-col border-r border-black/5 bg-[linear-gradient(180deg,#f7f5f1_0%,#f0eeea_100%)] transition-all duration-300 dark:border-white/10 dark:bg-background',
        sidebarCollapsed ? 'w-20 px-2 py-3' : 'w-[390px] px-3 py-3',
      )}
    >
      <div className={cn('flex h-12 items-center', sidebarCollapsed ? 'justify-center' : 'justify-between px-1')}>
        {!sidebarCollapsed && (
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-black/10 bg-white/70 shadow-sm dark:border-white/10 dark:bg-white/5">
              <img src={logoSvg} alt="KaiTianClaw" className="h-5 w-auto shrink-0" />
            </div>
          </div>
        )}

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 shrink-0 rounded-2xl border border-black/5 bg-white/65 text-muted-foreground shadow-sm hover:bg-white hover:text-foreground dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          >
            {sidebarCollapsed ? <PanelLeft className="h-[18px] w-[18px]" /> : <PanelLeftClose className="h-[18px] w-[18px]" />}
          </Button>

          {!sidebarCollapsed && (
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 shrink-0 rounded-2xl border border-black/5 bg-white/65 text-muted-foreground shadow-sm hover:bg-white hover:text-foreground dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
              onClick={() => navigate('/')}
            >
              <Plus className="h-[18px] w-[18px]" />
            </Button>
          )}
        </div>
      </div>

      <div className={cn('flex flex-1 flex-col', sidebarCollapsed ? 'gap-2 pt-3' : 'gap-4 pt-4')}>
        <AccordionGroup
          title={groupLabels.clones}
          meta="会话列表"
          icon={<Bot className="h-[18px] w-[18px]" strokeWidth={2} />}
          collapsed={sidebarCollapsed}
          defaultOpen
        >
          {orderedSessions.length > 0 ? (
            orderedSessions.map((session) => {
              const agentId = getAgentIdFromSessionKey(session.key);
              const agentName = agentNameById[agentId] || agentId;
              const sessionTitle = getSessionLabel(session.key, session.displayName, session.label);
              const isActive = isOnChat && currentSessionKey === session.key;

              const activityTimestamp = sessionLastActivity[session.key];

              return (
                <div key={session.key} className="group relative flex items-center">
                  <button
                    onClick={() => {
                      switchSession(session.key);
                      navigate('/');
                    }}
                    className={cn(
                      'w-full rounded-[24px] border border-black/5 bg-white/75 px-4 py-4 pr-10 text-left shadow-sm transition-all',
                      'hover:bg-white hover:shadow-md dark:border-white/10 dark:bg-white/[0.04] dark:hover:bg-white/[0.07]',
                      isActive && 'bg-black/[0.05] dark:bg-white/[0.09]',
                    )}
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <div className={cn('mt-0.5 h-11 w-11 shrink-0 rounded-full bg-gradient-to-br', getAvatarTone(agentName))} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <span className="truncate text-[17px] font-semibold text-foreground">{sessionTitle}</span>
                          <span className="shrink-0 text-[13px] text-muted-foreground">
                            {typeof activityTimestamp === 'number'
                              ? new Date(activityTimestamp).toLocaleTimeString('zh-CN', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  hour12: false,
                                })
                              : '--:--'}
                          </span>
                        </div>
                        <p className="mt-2 line-clamp-2 text-[13px] leading-6 text-muted-foreground">
                          {getAgentDescription(agentName)}
                        </p>
                      </div>
                    </div>
                  </button>

                  <button
                    aria-label="Delete session"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSessionToDelete({
                        key: session.key,
                        label: sessionTitle,
                      });
                    }}
                    className={cn(
                      'absolute right-3 top-3 flex items-center justify-center rounded-full p-1 transition-opacity',
                      'opacity-0 group-hover:opacity-100 text-muted-foreground hover:bg-destructive/10 hover:text-destructive',
                    )}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })
          ) : (
            <div className="rounded-[22px] border border-dashed border-black/10 bg-white/60 px-4 py-4 text-[12px] text-muted-foreground dark:border-white/10 dark:bg-white/[0.03]">
              暂无会话
            </div>
          )}
        </AccordionGroup>

        <AccordionGroup
          title={groupLabels.teams}
          meta="组织框架"
          icon={<Users className="h-[18px] w-[18px]" strokeWidth={2} />}
          collapsed={sidebarCollapsed}
          defaultOpen={false}
        >
          {staticTeams.map((team) => (
            <div key={team.name} className="rounded-[22px] border border-black/5 bg-white/75 px-4 py-3 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[14px] font-semibold text-foreground">{team.name}</p>
                  <p className="mt-1 text-[12px] leading-5 text-muted-foreground">{team.summary}</p>
                </div>
                <span className="text-[11px] text-muted-foreground">{team.meta}</span>
              </div>
            </div>
          ))}
        </AccordionGroup>

        <AccordionGroup
          title={groupLabels.channels}
          meta="外部入口"
          icon={<Network className="h-[18px] w-[18px]" strokeWidth={2} />}
          collapsed={sidebarCollapsed}
          defaultOpen={false}
        >
          {staticChannels.map((channel) => (
            <div key={channel.name} className="rounded-[20px] border border-black/5 bg-white/75 px-4 py-3 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium text-foreground">{channel.name}</span>
                <span className="text-[12px] text-muted-foreground">{channel.meta}</span>
              </div>
            </div>
          ))}
        </AccordionGroup>

        <AccordionGroup
          title={groupLabels.tasks}
          meta="计划执行"
          icon={<Clock className="h-[18px] w-[18px]" strokeWidth={2} />}
          collapsed={sidebarCollapsed}
          defaultOpen={false}
        >
          {staticCronTasks.map((task) => (
            <div key={task.name} className="rounded-[20px] border border-black/5 bg-white/75 px-4 py-3 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium text-foreground">{task.name}</span>
                <span className="text-[12px] text-muted-foreground">{task.meta}</span>
              </div>
            </div>
          ))}
        </AccordionGroup>
      </div>

      <div className="mt-auto pt-3">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-[24px] border border-black/5 bg-white/70 px-4 py-3 text-[14px] font-medium shadow-sm transition-colors',
              'text-foreground/80 hover:bg-white dark:border-white/10 dark:bg-white/[0.04] dark:hover:bg-white/[0.07]',
              isActive && 'bg-white text-foreground',
              sidebarCollapsed && 'justify-center px-0',
            )
          }
        >
          {({ isActive }) => (
            <>
              <div className={cn('flex shrink-0 items-center justify-center', isActive ? 'text-foreground' : 'text-muted-foreground')}>
                <SettingsIcon className="h-[18px] w-[18px]" strokeWidth={2} />
              </div>
              {!sidebarCollapsed && <span className="flex-1 truncate whitespace-nowrap">{groupLabels.settings}</span>}
            </>
          )}
        </NavLink>
      </div>

      <ConfirmDialog
        open={!!sessionToDelete}
        title={t('common:actions.confirm')}
        message={t('common:sidebar.deleteSessionConfirm', { label: sessionToDelete?.label })}
        confirmLabel={t('common:actions.delete')}
        cancelLabel={t('common:actions.cancel')}
        variant="destructive"
        onConfirm={async () => {
          if (!sessionToDelete) return;
          await deleteSession(sessionToDelete.key);
          if (currentSessionKey === sessionToDelete.key) navigate('/');
          setSessionToDelete(null);
        }}
        onCancel={() => setSessionToDelete(null)}
      />
    </aside>
  );
}
