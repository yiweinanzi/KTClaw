import { useEffect, useMemo, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Bell,
  Bot,
  Clock,
  Network,
  Search,
  Trash2,
  Users,
} from 'lucide-react';
import {
  buildConversationExportFileName,
  buildConversationMarkdownExport,
  encodeUtf8ToBase64,
  unwrapChatHistoryResponse,
  type ChatHistoryResponse,
  type GatewayRpcEnvelope,
} from '@/lib/chat-session-export';
import { hostApiFetch } from '@/lib/host-api';
import { invokeIpc } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { useSettingsStore } from '@/stores/settings';
import { useChatStore } from '@/stores/chat';
import { useGatewayStore } from '@/stores/gateway';
import { useAgentsStore } from '@/stores/agents';
import { useChannelsStore } from '@/stores/channels';
import { useNotificationsStore } from '@/stores/notifications';
import { type Notification } from '@/stores/notifications';
import { CHANNEL_ICONS } from '@/types/channel';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { AddAgentDialog } from '@/components/agents/AddAgentDialog';
import { AgentSettingsModal } from '@/components/agents/AgentSettingsModal';
import {
  GlobalSearchModal,
  type SearchAgentItem,
  type SearchSessionItem,
} from '@/components/search/GlobalSearchModal';
import { useTranslation } from 'react-i18next';
import { AccordionGroup } from '@/components/workbench/accordion-group';
import { toast } from 'sonner';

type SidebarMetaItem = {
  name: string;
  summary?: string;
  meta: string;
};

const NOTIFICATION_REFRESH_INTERVAL_MS = 60_000;
const INITIAL_NOTIFICATION_TIME = Date.now();

export function Sidebar() {
  const sidebarCollapsed = useSettingsStore((state) => state.sidebarCollapsed);
  const setSidebarCollapsed = useSettingsStore((state) => state.setSidebarCollapsed);
  const [avatarPopupOpen, setAvatarPopupOpen] = useState(false);
  const [nickname, setNickname] = useState(() => localStorage.getItem('clawx-user-nickname') || 'Administrator');
  const [selectedAvatar, setSelectedAvatar] = useState(() => localStorage.getItem('clawx-user-avatar') || '🐱');
  const [notifOpen, setNotifOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const sessions = useChatStore((s) => s.sessions);
  const currentSessionKey = useChatStore((s) => s.currentSessionKey);
  const sessionLabels = useChatStore((s) => s.sessionLabels);
  const sessionLastActivity = useChatStore((s) => s.sessionLastActivity);
  const switchSession = useChatStore((s) => s.switchSession);
  const deleteSession = useChatStore((s) => s.deleteSession);
  const loadSessions = useChatStore((s) => s.loadSessions);
  const loadHistory = useChatStore((s) => s.loadHistory);
  const messages = useChatStore((s) => s.messages);

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
  const agents = useAgentsStore((s) => s.agents);
  const createAgent = useAgentsStore((s) => s.createAgent);
  const deleteAgent = useAgentsStore((s) => s.deleteAgent);

  const { channels, fetchChannels } = useChannelsStore();

  const [showAddAgent, setShowAddAgent] = useState(false);
  const [agentSettingsId, setAgentSettingsId] = useState<string | null>(null);
  const [agentContextMenu, setAgentContextMenu] = useState<{ agentId: string; agentName: string; x: number; y: number } | null>(null);
  const activeSettingsAgent = useMemo(() => agents.find((a) => a.id === agentSettingsId) ?? null, [agents, agentSettingsId]);

  const notifications = useNotificationsStore((s) => s.notifications);
  const unreadCount = useNotificationsStore((s) => s.unreadCount);
  const markAllRead = useNotificationsStore((s) => s.markAllRead);
  const dismiss = useNotificationsStore((s) => s.dismiss);

  useEffect(() => {
    void fetchAgents();
  }, [fetchAgents]);

  useEffect(() => {
    void fetchChannels();
  }, [fetchChannels]);

  const navigate = useNavigate();
  const isOnChat = useLocation().pathname === '/';
  const { t } = useTranslation(['common', 'chat']);
  const [sessionToDelete, setSessionToDelete] = useState<{ key: string; label: string } | null>(null);
  const [batchMode, setBatchMode] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ key: string; label: string; x: number; y: number } | null>(null);

  const toggleSelect = useCallback((key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const exitBatchMode = useCallback(() => {
    setBatchMode(false);
    setSelectedKeys(new Set());
  }, []);

  const handleBatchDelete = useCallback(async () => {
    for (const key of selectedKeys) {
      await deleteSession(key);
    }
    exitBatchMode();
  }, [selectedKeys, deleteSession, exitBatchMode]);

  const exportSession = useCallback(async (sessionKey: string) => {
    try {
      const history = sessionKey === currentSessionKey
        ? { messages }
        : unwrapChatHistoryResponse(
            await invokeIpc<ChatHistoryResponse | GatewayRpcEnvelope<ChatHistoryResponse>>(
              'gateway:rpc',
              'chat.history',
              { sessionKey, limit: 200 },
            ),
          );
      const exportMessages = Array.isArray(history.messages) ? history.messages : [];
      if (exportMessages.length === 0) {
        toast.info('当前会话还没有可导出的消息');
        return;
      }

      const markdown = buildConversationMarkdownExport(exportMessages, sessionKey);
      const result = await hostApiFetch<{ success?: boolean; savedPath?: string; error?: string }>('/api/files/save-image', {
        method: 'POST',
        body: JSON.stringify({
          base64: encodeUtf8ToBase64(markdown),
          mimeType: 'text/markdown',
          defaultFileName: buildConversationExportFileName(sessionKey),
        }),
      });
      if (result?.success) {
        toast.success(result.savedPath ? `已导出到 ${result.savedPath}` : '会话导出成功');
        return;
      }
      if (result?.error) {
        toast.info(`已取消导出：${result.error}`);
        return;
      }
      toast.info('已取消导出');
    } catch (error) {
      toast.error(`导出会话失败：${String(error)}`);
    }
  }, [currentSessionKey, messages]);

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu && !agentContextMenu) return;
    const handler = () => { setContextMenu(null); setAgentContextMenu(null); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [contextMenu, agentContextMenu]);

  useEffect(() => {
    const onHotkey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onHotkey);
    return () => window.removeEventListener('keydown', onHotkey);
  }, []);

  const groupLabels = {
    clones: '分身',
    teams: '团队管理',
    channels: 'CHANNEL 频道',
    tasks: '任务',
    settings: t('common:sidebar.settings'),
  };

  const getSessionLabel = (key: string, displayName?: string, label?: string) =>
    sessionLabels[key] ?? label ?? displayName ?? key;

  // Exclude sessions that are already represented by an agent's mainSessionKey
  const agentMainKeys = useMemo(() => new Set(agents.map((a) => a.mainSessionKey)), [agents]);
  const orderedSessions = useMemo(
    () => [...sessions]
      .filter((s) => !agentMainKeys.has(s.key))
      .sort((a, b) => (sessionLastActivity[b.key] ?? 0) - (sessionLastActivity[a.key] ?? 0)),
    [sessions, sessionLastActivity, agentMainKeys],
  );

  const searchSessions = useMemo<SearchSessionItem[]>(
    () => orderedSessions.map((session) => ({
      key: session.key,
      label: sessionLabels[session.key] ?? session.label ?? session.displayName ?? session.key,
    })),
    [orderedSessions, sessionLabels],
  );

  const searchAgents = useMemo<SearchAgentItem[]>(
    () => agents
      .filter((agent) => typeof agent.mainSessionKey === 'string' && agent.mainSessionKey.length > 0)
      .map((agent) => ({
        id: agent.id,
        name: agent.name,
        mainSessionKey: agent.mainSessionKey,
        modelDisplay: agent.modelDisplay,
      })),
    [agents],
  );

  const staticTeams: SidebarMetaItem[] = [
    { name: '团队总览', summary: '', meta: '' },
    { name: '团队地图', summary: '', meta: '' },
  ];
  const staticCronTasks: SidebarMetaItem[] = [
    { name: '任务看板', summary: '', meta: '' },
    { name: '任务日程', summary: '', meta: '' },
    // { name: '运行日志', summary: '', meta: '' },
    { name: '🧠记忆知识库', summary: '', meta: '' },
    { name: '费用用量', summary: '', meta: '' },
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

      {!sidebarCollapsed ? (
        <div className="px-2 pb-1">
          <button
            type="button"
            aria-label="Open search"
            onClick={() => setSearchOpen(true)}
            className="flex w-full items-center gap-2 rounded-lg border border-black/10 bg-white px-3 py-2 text-left text-[13px] text-[#8e8e93] transition-colors hover:bg-[#f2f2f7]"
          >
            <Search className="h-3.5 w-3.5 shrink-0" />
            <span className="flex-1 truncate">Search</span>
            <kbd className="rounded border border-black/10 bg-[#f2f2f7] px-1.5 py-0.5 text-[10px]">Ctrl+K</kbd>
          </button>
        </div>
      ) : (
        <div className="flex justify-center pb-1">
          <button
            type="button"
            aria-label="Open search"
            onClick={() => setSearchOpen(true)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[#3c3c43] transition-[background-color] duration-150 hover:bg-[#e5e5ea] hover:text-[#000000]"
          >
            <Search className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className={cn('flex flex-1 flex-col', sidebarCollapsed ? 'gap-2 pt-3' : 'gap-4 pt-4')}>
        <AccordionGroup
          title={groupLabels.clones}
          icon={<Bot className="h-[18px] w-[18px]" strokeWidth={2} />}
          collapsed={sidebarCollapsed}
          headerAction={
            !sidebarCollapsed ? (
              <button
                type="button"
                aria-label="添加分身"
                title="添加分身"
                onClick={() => setShowAddAgent(true)}
                className="flex h-5 w-5 items-center justify-center rounded-md text-[14px] text-[#8e8e93] transition-colors hover:bg-[#e5e5ea] hover:text-[#000000]"
              >
                ＋
              </button>
            ) : undefined
          }
        >
          {/* Agent list */}
          {agents.length > 0 && (
            <div className="mb-2">
              {agents.map((agent) => (
                <button
                  key={agent.id}
                  type="button"
                  onClick={() => {
                    switchSession(agent.mainSessionKey);
                    navigate('/');
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setAgentContextMenu({ agentId: agent.id, agentName: agent.name, x: e.clientX, y: e.clientY });
                  }}
                  className={cn(
                    'flex w-full items-center gap-[10px] rounded-lg px-[10px] py-2 text-left text-[14px] transition-[background-color] duration-150',
                    'text-[#000000] hover:bg-[#e5e5ea] dark:hover:bg-white/[0.04]',
                    isOnChat && currentSessionKey === agent.mainSessionKey && 'bg-white font-medium shadow-[0_1px_2px_rgba(0,0,0,0.04),0_0_0_0.5px_rgba(0,0,0,0.04)]',
                  )}
                >
                  <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center text-[15px] leading-none">
                    {agent.isDefault ? '✦' : '🤖'}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{agent.name}</span>
                  <span className="shrink-0 text-[11px] text-[#8e8e93] truncate max-w-[80px]">{agent.modelDisplay}</span>
                </button>
              ))}
              <div className="mx-2 my-1 border-t border-black/[0.06] dark:border-white/10" />
            </div>
          )}

          {orderedSessions.length > 0 && (
            <>
              {/* Batch mode toolbar */}
              {batchMode && (
                <div className="mb-1.5 flex items-center justify-between rounded-lg bg-clawx-ac/10 px-3 py-2">
                  <span className="text-[12px] font-medium text-clawx-ac">{selectedKeys.size} 已选</span>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={handleBatchDelete}
                      disabled={selectedKeys.size === 0}
                      className="rounded-md bg-[#ef4444] px-2.5 py-1 text-[11px] font-medium text-white disabled:opacity-40 hover:bg-[#dc2626]"
                    >
                      删除
                    </button>
                    <button
                      type="button"
                      onClick={exitBatchMode}
                      className="rounded-md border border-black/10 bg-white px-2.5 py-1 text-[11px] text-[#3c3c43] hover:bg-[#f2f2f7]"
                    >
                      取消
                    </button>
                  </div>
                </div>
              )}

              {orderedSessions.map((session) => {
                const sessionTitle = getSessionLabel(session.key, session.displayName, session.label);
                const isActive = isOnChat && currentSessionKey === session.key;
                const isSelected = selectedKeys.has(session.key);

                return (
                  <div
                    key={session.key}
                    className="group relative"
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setContextMenu({ key: session.key, label: sessionTitle, x: e.clientX, y: e.clientY });
                    }}
                  >
                    <button
                      onClick={() => {
                        if (batchMode) { toggleSelect(session.key); return; }
                        switchSession(session.key);
                        navigate('/');
                      }}
                      className={cn(
                        'flex w-full items-center gap-[10px] rounded-lg px-[10px] py-2 text-left text-[14px] transition-[background-color] duration-150',
                        'text-[#000000] hover:bg-[#e5e5ea] dark:hover:bg-white/[0.04]',
                        isActive && !batchMode && 'bg-white font-medium shadow-[0_1px_2px_rgba(0,0,0,0.04),0_0_0_0.5px_rgba(0,0,0,0.04)]',
                        batchMode && isSelected && 'bg-clawx-ac/10',
                      )}
                    >
                      {batchMode ? (
                        <span className={cn(
                          'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 text-[10px] font-bold transition-colors',
                          isSelected
                            ? 'border-clawx-ac bg-clawx-ac text-white'
                            : 'border-black/20 bg-white',
                        )}>
                          {isSelected && '✓'}
                        </span>
                      ) : (
                        <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center text-[15px] leading-none">✦</span>
                      )}
                      <span className="min-w-0 flex-1 truncate">{sessionTitle}</span>
                    </button>

                    {!batchMode && (
                      <button
                        aria-label="Delete session"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSessionToDelete({ key: session.key, label: sessionTitle });
                        }}
                        className={cn(
                          'absolute right-2 top-2 flex items-center justify-center rounded p-1 transition-opacity',
                          'opacity-0 group-hover:opacity-100 text-muted-foreground hover:bg-destructive/10 hover:text-destructive',
                        )}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                );
              })}
            </>
          )}

          {/* Static fallback only when no agents AND no sessions */}
          {agents.length === 0 && orderedSessions.length === 0 && (
            <>
              <button
                onClick={() => navigate('/')}
                className={cn(
                  'flex w-full items-center gap-[10px] rounded-lg px-[10px] py-2 text-left text-[14px] transition-[background-color] duration-150',
                  'text-[#000000] hover:bg-[#e5e5ea] dark:hover:bg-white/[0.04]',
                  isOnChat && 'bg-white font-medium shadow-[0_1px_2px_rgba(0,0,0,0.04),0_0_0_0.5px_rgba(0,0,0,0.04)]',
                )}
              >
                <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center text-[15px] leading-none">✦</span>
                <span className="min-w-0 flex-1 truncate">KTClaw</span>
              </button>
              <div className="flex items-center gap-[10px] rounded-lg px-[10px] py-2 text-[14px] text-[#000000] transition-colors hover:bg-[#e5e5ea] dark:hover:bg-white/[0.04]">
                <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center text-[15px] leading-none">🔍</span>
                <span className="min-w-0 flex-1 truncate">沉思小助手</span>
              </div>
            </>
          )}
        </AccordionGroup>

        <AccordionGroup
          title={groupLabels.channels}
          icon={<Network className="h-[18px] w-[18px]" strokeWidth={2} />}
          collapsed={sidebarCollapsed}
        >
          {channels.length > 0 ? (
            channels.map((channel) => (
              <button
                key={channel.id}
                type="button"
                onClick={() => navigate('/channels')}
                className="flex w-full items-center gap-[10px] rounded-lg px-[10px] py-2 text-[14px] text-[#000000] transition-colors hover:bg-[#e5e5ea] dark:hover:bg-white/[0.04]"
              >
                <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center text-[15px] leading-none">
                  {CHANNEL_ICONS[channel.type] ?? '📡'}
                </span>
                <span className="min-w-0 flex-1 truncate text-left">{channel.name}</span>
                <span className={cn(
                  'h-1.5 w-1.5 shrink-0 rounded-full',
                  channel.status === 'connected' ? 'bg-[#10b981]' :
                  channel.status === 'connecting' ? 'bg-[#f59e0b]' :
                  channel.status === 'error' ? 'bg-[#ef4444]' : 'bg-[#d1d5db]',
                )} />
              </button>
            ))
          ) : (
            <button
              type="button"
              onClick={() => navigate('/channels')}
              className="flex w-full items-center gap-[10px] rounded-lg px-[10px] py-2 text-[14px] text-[#8e8e93] transition-colors hover:bg-[#e5e5ea] dark:hover:bg-white/[0.04]"
            >
              <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center text-[15px] leading-none">＋</span>
              <span className="min-w-0 flex-1 truncate text-left">添加频道</span>
            </button>
          )}
        </AccordionGroup>

        <AccordionGroup
          title={groupLabels.tasks}
          icon={<Clock className="h-[18px] w-[18px]" strokeWidth={2} />}
          collapsed={sidebarCollapsed}
        >
          {staticCronTasks.map((task) => (
            <button
              key={task.name}
              type="button"
              onClick={() => {
                if (task.name === '任务看板') navigate('/kanban');
                else if (task.name === '费用用量') navigate('/costs');
                else if (task.name === '🧠记忆知识库') navigate('/memory');
                else navigate('/cron');
              }}
              className="flex w-full items-center gap-[10px] rounded-lg px-[10px] py-2 text-[14px] text-[#000000] transition-colors hover:bg-[#e5e5ea] dark:hover:bg-white/[0.04]"
            >
              <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center text-[15px] leading-none">
                {task.name === '任务看板' ? '📋' : task.name === '费用用量' ? '💰' : task.name === '🧠记忆知识库' ? '🧠' : '📅'}
              </span>
              <span className="min-w-0 flex-1 truncate text-left">{task.name.replace('🧠', '')}</span>
            </button>
          ))}
        </AccordionGroup>

        <AccordionGroup
          title={groupLabels.teams}
          icon={<Users className="h-[18px] w-[18px]" strokeWidth={2} />}
          collapsed={sidebarCollapsed}
        >
          {staticTeams.map((team) => (
            <button
              key={team.name}
              type="button"
              onClick={() => navigate(team.name === '团队总览' ? '/team-overview' : '/team-map')}
              className="flex w-full items-center gap-[10px] rounded-lg px-[10px] py-2 text-[14px] text-[#000000] transition-colors hover:bg-[#e5e5ea] dark:hover:bg-white/[0.04]"
            >
              <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center text-[15px] leading-none">{team.name === '团队总览' ? '👥' : '🗺'}</span>
              <span className="min-w-0 flex-1 truncate text-left">{team.name}</span>
            </button>
          ))}
        </AccordionGroup>

      </div>

      <div className="mt-auto flex h-[52px] shrink-0 items-center gap-[10px] border-t border-[#c6c6c8] px-4 transition-colors hover:bg-[#e5e5ea] dark:border-white/10 dark:hover:bg-white/[0.04]">
        {!sidebarCollapsed && (
          <>
            <button
              type="button"
              aria-label="选择头像"
              onClick={() => setAvatarPopupOpen(true)}
              className="h-7 w-7 shrink-0 rounded-full bg-[#d9d9d9] flex items-center justify-center text-[18px] transition-colors hover:ring-2 hover:ring-clawx-ac/40"
            >{selectedAvatar}</button>
            <span className="flex-1 truncate text-[13px] font-medium">{nickname}</span>
            <div className="relative">
              <button
                type="button"
                aria-label="通知"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[16px] transition-colors hover:bg-[#e5e5ea]"
                onClick={() => { setNotifOpen((v) => !v); if (!notifOpen && unreadCount > 0) markAllRead(); }}
                title="通知"
              >
                <Bell className="h-4 w-4" />
                {unreadCount > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#ef4444] text-[9px] font-bold text-white">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>
            </div>
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
          <button
            type="button"
            aria-label="选择头像"
            onClick={() => setAvatarPopupOpen(true)}
            className="h-7 w-7 shrink-0 rounded-full bg-[#d9d9d9] flex items-center justify-center text-[18px] transition-colors hover:ring-2 hover:ring-clawx-ac/40"
          >{selectedAvatar}</button>
        )}
      </div>

      {searchOpen ? (
        <GlobalSearchModal
          onOpenChange={setSearchOpen}
          sessions={searchSessions}
          agents={searchAgents}
          onSelectSession={switchSession}
          onNavigate={navigate}
        />
      ) : null}

      {/* Notification panel */}
      {notifOpen && !sidebarCollapsed && (
        <NotificationPanel
          notifications={notifications}
          onDismiss={dismiss}
          onClose={() => setNotifOpen(false)}
        />
      )}

      {/* Avatar / Nickname popup */}
      {avatarPopupOpen && (
        <AvatarPopup
          nickname={nickname}
          avatar={selectedAvatar}
          onNicknameChange={(v) => { setNickname(v); localStorage.setItem('clawx-user-nickname', v); }}
          onAvatarChange={(v) => { setSelectedAvatar(v); localStorage.setItem('clawx-user-avatar', v); }}
          onClose={() => setAvatarPopupOpen(false)}
        />
      )}

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

      {/* Right-click context menu */}
      {contextMenu && createPortal(
        <div
          className="fixed z-[200] min-w-[148px] overflow-hidden rounded-xl border border-[#c6c6c8] bg-white py-1 shadow-xl"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-[#000000] hover:bg-[#f2f2f7]"
            onClick={() => {
              setBatchMode(true);
              toggleSelect(contextMenu.key);
              setContextMenu(null);
            }}
          >
            ☑ 批量选择
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-[#000000] hover:bg-[#f2f2f7]"
            onClick={() => {
              const sessionKey = contextMenu.key;
              setContextMenu(null);
              void exportSession(sessionKey);
            }}
          >
            ⤓ 导出 Markdown
          </button>
          <div className="mx-3 my-0.5 border-t border-[#f2f2f7]" />
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-[#ef4444] hover:bg-[#fef2f2]"
            onClick={() => {
              setSessionToDelete({ key: contextMenu.key, label: contextMenu.label });
              setContextMenu(null);
            }}
          >
            🗑 删除
          </button>
        </div>,
        document.body,
      )}

      {/* Agent right-click context menu */}
      {agentContextMenu && createPortal(
        <div
          className="fixed z-[200] min-w-[148px] overflow-hidden rounded-xl border border-[#c6c6c8] bg-white py-1 shadow-xl"
          style={{ top: agentContextMenu.y, left: agentContextMenu.x }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-[#000000] hover:bg-[#f2f2f7]"
            onClick={() => {
              const agentId = agentContextMenu.agentId;
              const targetSessionKey = agents.find((agent) => agent.id === agentId)?.mainSessionKey;
              setAgentContextMenu(null);
              if (targetSessionKey) {
                void exportSession(targetSessionKey);
              } else {
                toast.error('未找到该分身的主会话');
              }
            }}
          >
            ⤓ 导出 Markdown
          </button>
          <div className="mx-3 my-0.5 border-t border-[#f2f2f7]" />
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-[#000000] hover:bg-[#f2f2f7]"
            onClick={() => {
              setAgentSettingsId(agentContextMenu.agentId);
              setAgentContextMenu(null);
            }}
          >
            ⚙ 设置
          </button>
          {!agents.find((a) => a.id === agentContextMenu.agentId)?.isDefault && (
            <>
              <div className="mx-3 my-0.5 border-t border-[#f2f2f7]" />
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-[#ef4444] hover:bg-[#fef2f2]"
                onClick={async () => {
                  const id = agentContextMenu.agentId;
                  setAgentContextMenu(null);
                  try {
                    await deleteAgent(id);
                    toast.success('分身已删除');
                  } catch (error) {
                    toast.error(String(error));
                  }
                }}
              >
                🗑 删除
              </button>
            </>
          )}
        </div>,
        document.body,
      )}

      {/* Add agent dialog */}
      {showAddAgent && (
        <AddAgentDialog
          onClose={() => setShowAddAgent(false)}
          onCreate={async (name, persona) => {
            await createAgent(name, persona);
            setShowAddAgent(false);
            toast.success('分身已创建');
          }}
        />
      )}

      {/* Agent settings modal */}
      {activeSettingsAgent && (
        <AgentSettingsModal
          agent={activeSettingsAgent}
          channels={channels}
          onClose={() => setAgentSettingsId(null)}
        />
      )}
    </aside>
  );
}

const AVATAR_OPTIONS = [
  { emoji: '🐱', label: '猫咪' },
  { emoji: '🐶', label: '小狗' },
  { emoji: '🦊', label: '狐狸' },
  { emoji: '🐻', label: '熊熊' },
  { emoji: '🐼', label: '熊猫' },
  { emoji: '🦁', label: '狮子' },
  { emoji: '🐸', label: '青蛙' },
  { emoji: '🐨', label: '考拉' },
  { emoji: '🦄', label: '独角兽' },
];

function NotificationPanel({
  notifications,
  onDismiss,
  onClose,
}: {
  notifications: Notification[];
  onDismiss: (id: string) => void;
  onClose: () => void;
}) {
  const [now, setNow] = useState(INITIAL_NOTIFICATION_TIME);

  useEffect(() => {
    const syncNow = () => setNow(Date.now());
    syncNow();
    const timer = setInterval(syncNow, NOTIFICATION_REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  function relativeTime(ts: number) {
    const diff = Math.floor((now - ts) / 1000);
    if (diff < 60) return '刚刚';
    if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`;
    return `${Math.floor(diff / 86400)}天前`;
  }

  const levelColor: Record<string, string> = {
    success: '#10b981',
    warn: '#f59e0b',
    error: '#ef4444',
    info: 'var(--ac)',
  };

  return (
    <div className="fixed inset-0 z-50" onClick={onClose}>
      <div
        className="absolute bottom-[60px] left-2 w-[260px] overflow-hidden rounded-[18px] bg-white shadow-[0_8px_40px_rgba(0,0,0,0.18)] ring-1 ring-black/[0.06]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-black/[0.06] px-4 py-3">
          <span className="text-[14px] font-semibold text-[#000000]">通知</span>
          <button
            type="button"
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded-full bg-[#f2f2f7] text-[12px] text-[#3c3c43] hover:bg-[#e5e5ea]"
          >
            ✕
          </button>
        </div>

        <div className="max-h-[320px] overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-[13px] text-[#8e8e93]">
              暂无通知
            </div>
          ) : (
            notifications.map((n) => (
              <div key={n.id} className="flex items-start gap-3 border-b border-black/[0.04] px-4 py-3 last:border-0">
                <span
                  className="mt-1 h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: levelColor[n.level] ?? '#8e8e93' }}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-[#000000]">{n.title}</p>
                  {n.message && (
                    <p className="mt-0.5 line-clamp-2 text-[12px] text-[#8e8e93]">{n.message}</p>
                  )}
                  <p className="mt-1 text-[11px] text-[#c6c6c8]">{relativeTime(n.timestamp)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onDismiss(n.id)}
                  className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] text-[#8e8e93] hover:bg-[#f2f2f7] hover:text-[#000000]"
                >
                  ✕
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function AvatarPopup({
  nickname,
  avatar,
  onNicknameChange,
  onAvatarChange,
  onClose,
}: {
  nickname: string;
  avatar: string;
  onNicknameChange: (v: string) => void;
  onAvatarChange: (v: string) => void;
  onClose: () => void;
}) {
  const [selectedAvatar, setSelectedAvatar] = useState(avatar);
  const [draft, setDraft] = useState(nickname);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-start" onClick={onClose}>
      <div
        className="absolute bottom-[60px] left-2 w-[260px] overflow-hidden rounded-[18px] bg-white shadow-[0_8px_40px_rgba(0,0,0,0.18)] ring-1 ring-black/[0.06]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-black/[0.06] px-4 py-3">
          <span className="text-[14px] font-semibold text-[#000000]">个人资料</span>
          <button
            type="button"
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded-full bg-[#f2f2f7] text-[12px] text-[#3c3c43] hover:bg-[#e5e5ea]"
          >
            ✕
          </button>
        </div>

        {/* Current avatar preview */}
        <div className="flex flex-col items-center py-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#f2f2f7] text-[32px]">
            {selectedAvatar}
          </div>
          <span className="mt-2 text-[13px] font-medium text-[#000000]">{draft || nickname}</span>
        </div>

        {/* Avatar grid */}
        <div className="grid grid-cols-3 gap-2 px-4 pb-3">
          {AVATAR_OPTIONS.map((opt) => (
            <button
              key={opt.emoji}
              type="button"
              onClick={() => setSelectedAvatar(opt.emoji)}
              className={cn(
                'flex flex-col items-center gap-1 rounded-xl py-2 text-[22px] transition-colors',
                selectedAvatar === opt.emoji
                  ? 'bg-clawx-ac/10 ring-1 ring-clawx-ac/40'
                  : 'hover:bg-[#f2f2f7]',
              )}
            >
              {opt.emoji}
              <span className="text-[10px] text-[#8e8e93]">{opt.label}</span>
            </button>
          ))}
        </div>

        {/* Nickname input */}
        <div className="border-t border-black/[0.06] px-4 py-3">
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.5px] text-[#8e8e93]">
            昵称
          </label>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="输入昵称..."
            className="w-full rounded-lg border border-black/10 bg-[#f2f2f7] px-3 py-2 text-[13px] text-[#000000] outline-none focus:border-clawx-ac focus:bg-white"
          />
        </div>

        {/* Save button */}
        <div className="px-4 pb-4">
          <button
            type="button"
            onClick={() => {
              if (draft.trim()) onNicknameChange(draft.trim());
              onAvatarChange(selectedAvatar);
              onClose();
            }}
            className="w-full rounded-full bg-clawx-ac py-2 text-[13px] font-semibold text-white hover:bg-[#0062cc]"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
