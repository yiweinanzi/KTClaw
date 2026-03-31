import { useEffect, useState } from 'react';
import {
  Bell,
  Bot,
  ChevronRight,
  LayoutDashboard,
  MessageSquare,
  PanelLeft,
  PanelLeftClose,
  Pin,
  Radio,
  Search,
  Settings,
  Trash2,
  Upload,
  Users,
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { GlobalSearchModal } from '@/components/search/GlobalSearchModal';
import { cn } from '@/lib/utils';
import { usePinnedSessions } from '@/lib/pinned-sessions';
import { useAgentsStore } from '@/stores/agents';
import { useChannelsStore } from '@/stores/channels';
import { useChatStore } from '@/stores/chat';
import { useGatewayStore } from '@/stores/gateway';
import { useSettingsStore } from '@/stores/settings';

const CHAT_REQUEST_FILE_UPLOAD_EVENT = 'chat:request-file-upload';
const CHAT_UPLOAD_PENDING_KEY = 'ktclaw:pending-upload';

type NavItemConfig = {
  label: string;
  path: string;
  icon: typeof LayoutDashboard;
};

function SectionHeader({
  icon: Icon,
  label,
  open,
  onToggle,
  collapsed,
}: {
  icon: typeof Radio;
  label: string;
  open: boolean;
  onToggle: () => void;
  collapsed: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onToggle}
      className={cn(
        'flex w-full items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-[#e5e5ea]',
        collapsed && 'justify-center px-2',
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {!collapsed ? (
        <>
          <span className="ml-2 flex-1 truncate text-left">{label}</span>
          <ChevronRight
            className={cn(
              'h-4 w-4 shrink-0 text-[#8e8e93] transition-transform',
              open && 'rotate-90',
            )}
          />
        </>
      ) : null}
    </button>
  );
}

function NavItem({
  item,
  active,
  collapsed,
  onClick,
}: {
  item: NavItemConfig;
  active: boolean;
  collapsed: boolean;
  onClick: () => void;
}) {
  const Icon = item.icon;

  return (
    <button
      type="button"
      aria-label={item.label}
      onClick={onClick}
      className={cn(
        'flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors',
        active
          ? 'bg-white text-[#000000] shadow-[0_1px_2px_rgba(0,0,0,0.04),0_0_0_0.5px_rgba(0,0,0,0.04)]'
          : 'text-[#000000] hover:bg-[#e5e5ea]',
        collapsed && 'justify-center px-2',
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {!collapsed ? <span className="truncate">{item.label}</span> : null}
    </button>
  );
}

export function Sidebar() {
  const sidebarCollapsed = useSettingsStore((state) => state.sidebarCollapsed);
  const setSidebarCollapsed = useSettingsStore((state) => state.setSidebarCollapsed);
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const gatewayStatus = useGatewayStore((state) => state.status);

  const sessions = useChatStore((state) => state.sessions);
  const currentSessionKey = useChatStore((state) => state.currentSessionKey);
  const sessionLabels = useChatStore((state) => state.sessionLabels);
  const sessionLastActivity = useChatStore((state) => state.sessionLastActivity);
  const switchSession = useChatStore((state) => state.switchSession);
  const deleteSession = useChatStore((state) => state.deleteSession);
  const loadSessions = useChatStore((state) => state.loadSessions);
  const loadHistory = useChatStore((state) => state.loadHistory);

  const agents = useAgentsStore((state) => state.agents);
  const fetchAgents = useAgentsStore((state) => state.fetchAgents);
  const { channels, fetchChannels } = useChannelsStore();
  const { pinnedSessionKeySet, toggleSessionPinned } = usePinnedSessions();

  const [channelsOpen, setChannelsOpen] = useState(false);
  const [sessionsOpen, setSessionsOpen] = useState(true);
  const [sessionSearch, setSessionSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);

  const tSidebar = (key: string, defaultValue?: string) =>
    t(`common:sidebar.${key}`, { defaultValue });

  useEffect(() => {
    void fetchAgents();
  }, [fetchAgents]);

  useEffect(() => {
    void fetchChannels();
  }, [fetchChannels]);

  useEffect(() => {
    if (gatewayStatus.state !== 'running') return;
    void loadSessions();
    void loadHistory(true);
  }, [gatewayStatus.state, loadHistory, loadSessions]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(true);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const navItems: NavItemConfig[] = [
    {
      label: tSidebar('taskBoard', 'Task board'),
      path: '/kanban',
      icon: LayoutDashboard,
    },
    {
      label: tSidebar('teamOverview', 'Team overview'),
      path: '/team-overview',
      icon: Users,
    },
    {
      label: tSidebar('employeeSquare', 'Employee square'),
      path: '/agents',
      icon: Bot,
    },
  ];

  const sortedSessions = [...sessions]
    .sort((left, right) => {
      const leftPinned = pinnedSessionKeySet.has(left.key);
      const rightPinned = pinnedSessionKeySet.has(right.key);
      if (leftPinned !== rightPinned) {
        return leftPinned ? -1 : 1;
      }

      return (
        (sessionLastActivity[right.key] ?? right.updatedAt ?? 0) -
        (sessionLastActivity[left.key] ?? left.updatedAt ?? 0)
      );
    })
    .filter((session) => {
      const label =
        sessionLabels[session.key] ?? session.label ?? session.displayName ?? session.key;
      return label.toLowerCase().includes(sessionSearch.trim().toLowerCase());
    });

  const searchSessions = sessions.map((session) => ({
    key: session.key,
    label: sessionLabels[session.key] ?? session.label ?? session.displayName ?? session.key,
  }));

  const searchAgents = agents.map((agent) => ({
    id: agent.id,
    name: agent.name,
    mainSessionKey: agent.mainSessionKey,
    modelDisplay: agent.modelDisplay,
    chatAccess: agent.chatAccess,
    reportsTo: agent.reportsTo,
    isDefault: agent.isDefault,
  }));

  const handleUploadClick = () => {
    try {
      sessionStorage.setItem(CHAT_UPLOAD_PENDING_KEY, '1');
    } catch {
      // ignore storage write issues
    }
    navigate('/');
    window.dispatchEvent(new CustomEvent(CHAT_REQUEST_FILE_UPLOAD_EVENT));
  };

  return (
    <aside
      className={cn(
        'flex shrink-0 flex-col border-r border-black/[0.06] bg-[#f2f2f7] transition-all duration-300 dark:border-white/10 dark:bg-background',
        sidebarCollapsed ? 'w-16 px-2 py-2' : 'w-[260px] px-2 py-2',
      )}
    >
      <div className={cn('flex items-center', sidebarCollapsed ? 'justify-center' : 'justify-start')}>
        <button
          type="button"
          aria-label={tSidebar('toggleSidebar', 'Toggle sidebar')}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-[#3c3c43] transition-colors hover:bg-[#e5e5ea] hover:text-[#000000]"
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
        >
          {sidebarCollapsed ? (
            <PanelLeft className="h-5 w-5" />
          ) : (
            <PanelLeftClose className="h-5 w-5" />
          )}
        </button>
      </div>

      <div className="mt-4 space-y-2">
        {navItems.map((item) => (
          <NavItem
            key={item.path}
            item={item}
            active={location.pathname === item.path}
            collapsed={sidebarCollapsed}
            onClick={() => navigate(item.path)}
          />
        ))}
      </div>

      <div className="mt-4 flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="space-y-2">
          <SectionHeader
            icon={Radio}
            label={tSidebar('channels', 'Channels')}
            open={channelsOpen}
            onToggle={() => setChannelsOpen((current) => !current)}
            collapsed={sidebarCollapsed}
          />
          {!sidebarCollapsed && channelsOpen ? (
            <div className="space-y-1 pl-2">
              {channels.length > 0 ? (
                channels.map((channel) => (
                  <button
                    key={channel.id}
                    type="button"
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                    onClick={() => navigate(`/channels?channel=${channel.type}`)}
                  >
                    <span
                      className={cn(
                        'h-2.5 w-2.5 shrink-0 rounded-full',
                        channel.status === 'connected'
                          ? 'bg-green-500'
                          : channel.status === 'connecting'
                            ? 'bg-amber-400'
                            : 'bg-slate-300',
                      )}
                    />
                    <span className="truncate">{channel.name}</span>
                  </button>
                ))
              ) : (
                <p className="px-3 py-2 text-sm text-muted-foreground">
                  {tSidebar('noChannels', 'No channels configured')}
                </p>
              )}
            </div>
          ) : null}
        </div>

        <div className="mt-4 space-y-2">
          <SectionHeader
            icon={MessageSquare}
            label={tSidebar('sessions', 'Sessions')}
            open={sessionsOpen}
            onToggle={() => setSessionsOpen((current) => !current)}
            collapsed={sidebarCollapsed}
          />
          {!sidebarCollapsed && sessionsOpen ? (
            <div className="space-y-2 pl-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8e8e93]" />
                <input
                  value={sessionSearch}
                  onChange={(event) => setSessionSearch(event.target.value)}
                  placeholder={tSidebar('searchSessions', 'Search sessions...')}
                  className="h-10 w-full rounded-xl border border-black/10 bg-white pl-9 pr-3 text-sm text-[#000000] outline-none transition-colors focus:border-ring placeholder:text-[#8e8e93]"
                />
              </div>

              {sortedSessions.length > 0 ? (
                sortedSessions.map((session) => {
                  const label =
                    sessionLabels[session.key] ??
                    session.label ??
                    session.displayName ??
                    session.key;
                  const isPinned = pinnedSessionKeySet.has(session.key);

                  return (
                    <div key={session.key} className="group relative">
                      <button
                        type="button"
                        className={cn(
                          'flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm transition-colors',
                          'text-[#000000] hover:bg-[#e5e5ea]',
                          currentSessionKey === session.key &&
                            'bg-white font-medium shadow-[0_1px_2px_rgba(0,0,0,0.04),0_0_0_0.5px_rgba(0,0,0,0.04)]',
                        )}
                        onClick={() => {
                          switchSession(session.key);
                          navigate('/');
                        }}
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                          {label.slice(0, 1).toUpperCase()}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate font-medium">{label}</span>
                            {isPinned ? (
                              <Pin
                                className="h-3.5 w-3.5 shrink-0"
                                aria-label={tSidebar('pinnedSession', 'Pinned session')}
                              />
                            ) : null}
                          </div>
                          <p className="truncate text-xs text-muted-foreground">
                            {session.key}
                          </p>
                        </div>
                      </button>
                      <div className="absolute right-2 top-2 flex items-center gap-1">
                        <button
                          type="button"
                          aria-label={isPinned ? tSidebar('unpin', 'Unpin') : tSidebar('pin', 'Pin')}
                          className="rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-accent-foreground group-hover:opacity-100"
                          onClick={() => toggleSessionPinned(session.key)}
                        >
                          <Pin className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          aria-label={tSidebar('delete', 'Delete')}
                          className="rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-accent-foreground group-hover:opacity-100"
                          onClick={() => void deleteSession(session.key)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="px-3 py-2 text-sm text-muted-foreground">
                  {tSidebar('noSessions', 'No sessions')}
                </p>
              )}
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-auto border-t border-[#c6c6c8] dark:border-white/10">
        {/* User Info Section */}
        <div className="flex h-[52px] shrink-0 items-center gap-[10px] px-4 transition-colors hover:bg-[#e5e5ea] dark:hover:bg-white/[0.04]">
          {!sidebarCollapsed && (
            <>
              <div className="h-7 w-7 shrink-0 rounded-full bg-[#d9d9d9] flex items-center justify-center text-[18px]">
                👤
              </div>
              <span className="flex-1 truncate text-[13px] font-medium">Administrator</span>
              <button
                type="button"
                aria-label={tSidebar('settingsAria', 'Settings')}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[16px] transition-colors hover:bg-[#e5e5ea]"
                onClick={() => navigate('/settings')}
                title={tSidebar('settings', 'Settings')}
              >
                <Settings className="h-4 w-4" />
              </button>
            </>
          )}
        </div>

        {/* Upload File Button */}
        <div className="border-t border-[#c6c6c8] pt-2 dark:border-white/10">
          <button
            type="button"
            aria-label={tSidebar('uploadFile', 'Upload file')}
            onClick={handleUploadClick}
            className={cn(
              'flex w-full items-center rounded-xl px-3 py-2 text-sm font-medium text-[#000000] transition-colors hover:bg-[#e5e5ea]',
              sidebarCollapsed && 'justify-center px-2',
            )}
          >
            <Upload className="h-4 w-4 shrink-0" />
            {!sidebarCollapsed ? (
              <span className="ml-2 truncate">{tSidebar('uploadFile', 'Upload file')}</span>
            ) : null}
          </button>
        </div>
      </div>

      {searchOpen ? (
        <GlobalSearchModal
          onOpenChange={setSearchOpen}
          sessions={searchSessions}
          agents={searchAgents}
          onSelectSession={(sessionKey) => switchSession(sessionKey)}
          onNavigate={(path) => navigate(path)}
        />
      ) : null}
    </aside>
  );
}
