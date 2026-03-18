import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Bot,
  Clock,
  Network,
  Trash2,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/stores/settings';
import { useChatStore } from '@/stores/chat';
import { useGatewayStore } from '@/stores/gateway';
import { useAgentsStore } from '@/stores/agents';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useTranslation } from 'react-i18next';
import { AccordionGroup } from '@/components/workbench/accordion-group';

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
    teams: '团队管理',
    channels: 'CHANNEL 频道',
    tasks: '任务',
    settings: t('common:sidebar.settings'),
  };

  const getSessionLabel = (key: string, displayName?: string, label?: string) =>
    sessionLabels[key] ?? label ?? displayName ?? key;

  const orderedSessions = useMemo(
    () => [...sessions].sort((a, b) => (sessionLastActivity[b.key] ?? 0) - (sessionLastActivity[a.key] ?? 0)),
    [sessions, sessionLastActivity],
  );

  const staticTeams: SidebarMetaItem[] = [
    { name: '团队总览', summary: '', meta: '' },
    { name: '团队看板', summary: '', meta: '' },
  ];
  const staticChannels: SidebarMetaItem[] = [
    { name: '飞书', summary: '', meta: '' },
    { name: '钉钉', summary: '', meta: '' },
    { name: '企业微信', summary: '', meta: '' },
  ];
  const staticCronTasks: SidebarMetaItem[] = [
    { name: '任务看板', summary: '', meta: '' },
    { name: '任务日程', summary: '', meta: '' },
  ];

  return (
    <aside
      className={cn(
        'flex shrink-0 flex-col border-r border-black/[0.06] bg-[#f2f2f7] transition-all duration-300 dark:border-white/10 dark:bg-background',
        sidebarCollapsed ? 'w-16 px-2 py-2' : 'w-[260px] px-2 py-2',
      )}
    >
      <div className={cn('flex h-[52px] items-center justify-between px-4', sidebarCollapsed && 'justify-center px-0')}>
        {!sidebarCollapsed && (
          <button
            type="button"
            aria-label="Toggle sidebar"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#3c3c43] transition-[background-color] duration-150 hover:bg-[#e5e5ea] hover:text-[#000000]"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          >
            ☰
          </button>
        )}

        {sidebarCollapsed && (
          <button
            type="button"
            aria-label="Toggle sidebar"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#3c3c43] transition-[background-color] duration-150 hover:bg-[#e5e5ea] hover:text-[#000000]"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          >
            ☰
          </button>
        )}

        {!sidebarCollapsed && (
          <button
            type="button"
            aria-label="New session"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#3c3c43] transition-[background-color] duration-150 hover:bg-[#e5e5ea] hover:text-[#000000]"
            onClick={() => navigate('/')}
          >
            ＋
          </button>
        )}
      </div>

      <div className={cn('flex flex-1 flex-col', sidebarCollapsed ? 'gap-2 pt-3' : 'gap-4 pt-4')}>
        <AccordionGroup
          title={groupLabels.clones}
          icon={<Bot className="h-[18px] w-[18px]" strokeWidth={2} />}
          collapsed={sidebarCollapsed}
        >
          {orderedSessions.length > 0 ? (
            orderedSessions.map((session) => {
              const sessionTitle = getSessionLabel(session.key, session.displayName, session.label);
              const isActive = isOnChat && currentSessionKey === session.key;

              return (
                <div key={session.key} className="group relative">
                  <button
                    onClick={() => {
                      switchSession(session.key);
                      navigate('/');
                    }}
                    className={cn(
                      'flex w-full items-center gap-[10px] rounded-lg px-[10px] py-2 text-left text-[14px] transition-[background-color] duration-150',
                      'text-[#000000] hover:bg-[#e5e5ea] dark:hover:bg-white/[0.04]',
                      isActive && 'bg-white font-medium shadow-[0_1px_2px_rgba(0,0,0,0.04),0_0_0_0.5px_rgba(0,0,0,0.04)]',
                    )}
                  >
                    <span className="w-5 shrink-0 text-center text-[14px]">✦</span>
                    <span className="min-w-0 flex-1 truncate">{sessionTitle}</span>
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
                      'absolute right-2 top-2 flex items-center justify-center rounded p-1 transition-opacity',
                      'opacity-0 group-hover:opacity-100 text-muted-foreground hover:bg-destructive/10 hover:text-destructive',
                    )}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              );
            })
          ) : (
            <div className="rounded-lg border border-dashed border-[#c6c6c8] bg-transparent px-[10px] py-2 text-[12px] text-[#8e8e93] dark:border-white/10">
              暂无会话
            </div>
          )}
        </AccordionGroup>

        <AccordionGroup
          title={groupLabels.teams}
          icon={<Users className="h-[18px] w-[18px]" strokeWidth={2} />}
          collapsed={sidebarCollapsed}
        >
          {staticTeams.map((team) => (
            <div key={team.name} className="flex items-center gap-[10px] rounded-lg px-[10px] py-2 text-[14px] text-[#000000] transition-colors hover:bg-[#e5e5ea] dark:hover:bg-white/[0.04]">
              <span className="w-5 shrink-0 text-center text-[14px]">{team.name === '团队总览' ? '👥' : '🗺'}</span>
              <span className="min-w-0 flex-1 truncate">{team.name}</span>
            </div>
          ))}
        </AccordionGroup>

        <AccordionGroup
          title={groupLabels.channels}
          icon={<Network className="h-[18px] w-[18px]" strokeWidth={2} />}
          collapsed={sidebarCollapsed}
        >
          {staticChannels.map((channel) => (
            <div key={channel.name} className="flex items-center gap-[10px] rounded-lg px-[10px] py-2 text-[14px] text-[#000000] transition-colors hover:bg-[#e5e5ea] dark:hover:bg-white/[0.04]">
              <span className="w-5 shrink-0 text-center text-[14px]">
                {channel.name === '飞书' ? '🪶' : channel.name === '钉钉' ? '💙' : '🍀'}
              </span>
              <span className="min-w-0 flex-1 truncate">{channel.name}</span>
            </div>
          ))}
        </AccordionGroup>

        <AccordionGroup
          title={groupLabels.tasks}
          icon={<Clock className="h-[18px] w-[18px]" strokeWidth={2} />}
          collapsed={sidebarCollapsed}
        >
          {staticCronTasks.map((task) => (
            <div key={task.name} className="flex items-center gap-[10px] rounded-lg px-[10px] py-2 text-[14px] text-[#000000] transition-colors hover:bg-[#e5e5ea] dark:hover:bg-white/[0.04]">
              <span className="w-5 shrink-0 text-center text-[14px]">
                {task.name === '任务看板' ? '📋' : '📅'}
              </span>
              <span className="min-w-0 flex-1 truncate">{task.name}</span>
            </div>
          ))}
        </AccordionGroup>
      </div>

      <div className="mt-auto flex h-[52px] shrink-0 items-center gap-[10px] border-t border-[#c6c6c8] px-4 transition-colors hover:bg-[#e5e5ea] dark:border-white/10 dark:hover:bg-white/[0.04]">
        {!sidebarCollapsed && (
          <>
            <div className="h-7 w-7 shrink-0 rounded-full bg-[#d9d9d9]"></div>
            <span className="flex-1 truncate text-[13px] font-medium">Administrator</span>
            <button
              type="button"
              aria-label="Settings"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[16px] transition-colors hover:bg-[#e5e5ea]"
              onClick={() => navigate('/settings')}
              title="设置"
            >
              ⚙
            </button>
          </>
        )}
        {sidebarCollapsed && (
          <div className="h-7 w-7 shrink-0 rounded-full bg-[#d9d9d9]"></div>
        )}
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
