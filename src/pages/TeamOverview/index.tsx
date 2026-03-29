import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import { useAgentsStore } from '@/stores/agents';
import { useChatStore } from '@/stores/chat';
import { useGatewayStore } from '@/stores/gateway';
import type { AgentSummary } from '@/types/agent';
import { deriveTeamWorkVisibility, type TeamMemberWorkVisibility } from '@/lib/team-work-visibility';
import { buildLeaderProgressBrief } from '@/lib/team-progress-brief';
import { useTeamRuntime } from '@/hooks/use-team-runtime';

import { Bot, UserCog, Code, Database, Zap, Cpu, MessageSquare, Mail, MessageCircle, Plus, Columns, Network, Radio } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const AVATAR_COLORS = [
  'bg-emerald-100 text-emerald-600 ring-1 ring-emerald-500/20',
  'bg-blue-100 text-blue-600 ring-1 ring-blue-500/20',
  'bg-amber-100 text-amber-600 ring-1 ring-amber-500/20',
  'bg-violet-100 text-violet-600 ring-1 ring-violet-500/20',
  'bg-rose-100 text-rose-600 ring-1 ring-rose-500/20',
  'bg-cyan-100 text-cyan-600 ring-1 ring-cyan-500/20',
];

const AVATAR_ICONS = [Bot, UserCog, Code, Database, Zap, Cpu];

const CHANNEL_ICONS: Record<string, React.ElementType> = {
  feishu: MessageCircle,
  dingtalk: Mail,
  wecom: MessageSquare,
  qqbot: Bot,
};

const RECENT_MS = 5 * 60 * 1000;

function agentColor(idx: number) {
  return AVATAR_COLORS[idx % AVATAR_COLORS.length];
}

function AgentIcon({ idx, className }: { idx: number; className?: string }) {
  const Icon = AVATAR_ICONS[idx % AVATAR_ICONS.length];
  return <Icon className={className} />;
}

function formatLastActive(
  ts: number | undefined,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  if (!ts) return t('teamOverview.time.never');
  const diff = Date.now() - ts;
  if (diff < 60_000) return t('teamOverview.time.justNow');
  if (diff < 3_600_000) return t('teamOverview.time.minutesAgo', { count: Math.floor(diff / 60_000) });
  if (diff < 86_400_000) return t('teamOverview.time.hoursAgo', { count: Math.floor(diff / 3_600_000) });
  return t('teamOverview.time.daysAgo', { count: Math.floor(diff / 86_400_000) });
}

function isRecentlyActive(ts: number | undefined): boolean {
  return !!ts && Date.now() - ts < RECENT_MS;
}

function getTeamRole(agent: AgentSummary): 'leader' | 'worker' {
  return agent.teamRole ?? (agent.isDefault ? 'leader' : 'worker');
}

function getChatAccess(agent: AgentSummary): 'direct' | 'leader_only' {
  return agent.chatAccess ?? 'direct';
}

function getOwnedEntryPoints(
  agent: AgentSummary,
  channelOwners: Record<string, string>,
  configuredChannelTypes: string[],
): string[] {
  return configuredChannelTypes.filter((channelType) => channelOwners[channelType] === agent.id);
}

function StatusDot({ statusKey }: { statusKey: string }) {
  const { t } = useTranslation('common');
  const config: Record<string, { dot: string; text: string; bg: string }> = {
    working:          { dot: 'bg-blue-500',   text: 'text-blue-700',   bg: 'bg-blue-50' },
    active:           { dot: 'bg-blue-400',   text: 'text-blue-600',   bg: 'bg-blue-50' },
    blocked:          { dot: 'bg-amber-500',  text: 'text-amber-700',  bg: 'bg-amber-50' },
    waiting_approval: { dot: 'bg-violet-500', text: 'text-violet-700', bg: 'bg-violet-50' },
    idle:             { dot: 'bg-slate-300',  text: 'text-slate-500',  bg: 'bg-slate-100' },
  };
  const c = config[statusKey] ?? config.idle;
  return (
    <span className={cn('flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold', c.bg, c.text)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', c.dot)} />
      {t(`teamOverview.activity.${statusKey}`, { defaultValue: statusKey })}
    </span>
  );
}

function CreateAgentModal({ onClose, onCreate }: { onClose: () => void; onCreate: (name: string) => Promise<void> }) {
  const { t } = useTranslation('common');
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-sm rounded-[24px] bg-white p-6 shadow-2xl border border-slate-100"
      >
        <h2 className="mb-4 text-lg font-semibold text-slate-900">{t('teamOverview.createModal.title')}</h2>
        <div className="mb-6">
          <p className="mb-2 text-sm font-medium text-slate-700">{t('teamOverview.createModal.nameLabel')}</p>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void handleSubmit()}
            placeholder={t('teamOverview.createModal.placeholder')}
            className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all"
          />
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
          >
            {t('actions.cancel')}
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={loading || !name.trim()}
            className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm"
          >
            {loading ? t('teamOverview.createModal.creating') : t('teamOverview.createModal.confirm')}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

export function TeamOverview() {
  const { t } = useTranslation('common');
  const [createOpen, setCreateOpen] = useState(false);

  const {
    agents,
    configuredChannelTypes,
    channelOwners,
    loading,
    error,
    fetchAgents,
    createAgent,
    deleteAgent,
  } = useAgentsStore();
  
  const sessionLastActivity = useChatStore((s) => s.sessionLastActivity);
  const gatewayStatus = useGatewayStore((s) => s.status);
  const { byAgent: runtimeByAgent } = useTeamRuntime();

  const workVisibility = useMemo(
    () => deriveTeamWorkVisibility(agents, sessionLastActivity, runtimeByAgent),
    [agents, sessionLastActivity, runtimeByAgent],
  );

  const teamBrief = useMemo(
    () => buildLeaderProgressBrief({
      leaderId: agents.find((agent) => agent.teamRole === 'leader')?.id ?? agents.find((agent) => agent.isDefault)?.id ?? 'main',
      agents,
      sessionLastActivity,
      configuredChannelTypes,
      channelOwners,
      runtimeByAgent,
    }),
    [agents, sessionLastActivity, configuredChannelTypes, channelOwners, runtimeByAgent],
  );

  useEffect(() => {
    void fetchAgents();
  }, [fetchAgents]);

  const isGatewayUp = gatewayStatus?.state === 'running';
  const highlightedWorkItems = teamBrief.dashboard.activeWorkItems.slice(0, 4);

  return (
    <div className="flex h-full flex-col bg-slate-50 p-6 xl:p-8">
      <div className="flex flex-1 flex-col overflow-y-auto rounded-[32px] bg-white p-8 shadow-sm border border-slate-200/60">
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">{t('teamOverview.title')}</h1>
            <p className="mt-1.5 text-sm text-slate-500">
              {loading
                ? t('status.loading')
                : error
                  ? t('status.loadFailed')
                  : t('teamOverview.summary', {
                    count: agents.length,
                    gateway: isGatewayUp ? t('teamOverview.gateway.online') : t('teamOverview.gateway.offline'),
                  })}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/broadcast"
              className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
            >
              <Radio className="h-4 w-4" />
              {t('teamOverview.broadcastButton', { defaultValue: 'Group Meeting' })}
            </Link>
            <motion.button
              whileHover={{ y: -1, boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}
              whileTap={{ y: 1 }}
              onClick={() => setCreateOpen(true)}
              className="flex items-center gap-2 rounded-full bg-blue-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" />
              {t('teamOverview.hireButton')}
            </motion.button>
          </div>
        </div>

        {loading && (
          <div className="flex flex-1 items-center justify-center text-sm text-slate-400">{t('status.loading')}</div>
        )}
        {!loading && error && (
          <div className="flex flex-1 items-center justify-center text-sm text-rose-500">{error}</div>
        )}
        {!loading && !error && agents.length === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
              <Bot className="h-8 w-8" />
            </div>
            <p className="text-base font-medium text-slate-700">{t('teamOverview.empty.title')}</p>
            <p className="text-sm text-slate-500">{t('teamOverview.empty.description')}</p>
          </div>
        )}

        {!loading && !error && agents.length > 0 && (
          <div className="space-y-8">
            <section className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-gradient-to-br from-slate-50 to-white p-8 shadow-sm">
              <div className="grid gap-8 xl:grid-cols-[minmax(0,1.4fr)_360px]">
                <div className="space-y-6">
                  <div className="space-y-3">
                    <span className="inline-flex rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-blue-600">
                      {t('teamOverview.brief.eyebrow')}
                    </span>
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{t('teamOverview.dashboard.progress')}</p>
                      <h2 className="max-w-2xl text-2xl font-semibold leading-tight text-slate-900">{teamBrief.summaryText}</h2>
                      <p className="max-w-2xl text-sm leading-relaxed text-slate-600">{teamBrief.dashboard.primaryNextAction}</p>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-4">
                    <MetricCard label={t('teamOverview.dashboard.metrics.totalMembers')} value={String(teamBrief.dashboard.totalMembers)} tone="neutral" />
                    <MetricCard label={t('teamOverview.dashboard.metrics.activeMembers')} value={String(teamBrief.dashboard.activeMemberCount)} tone="blue" />
                    <MetricCard label={t('teamOverview.dashboard.metrics.blocked')} value={String(teamBrief.dashboard.blockedCount)} tone="amber" />
                    <MetricCard label={t('teamOverview.dashboard.metrics.waitingApproval')} value={String(teamBrief.dashboard.waitingApprovalCount)} tone="purple" />
                  </div>

                  <div className="flex flex-wrap gap-3">
                    <Link
                      to="/kanban"
                      className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition-transform hover:-translate-y-0.5 shadow-sm"
                    >
                      <Columns className="h-4 w-4" />
                      {t('teamOverview.brief.openKanban')}
                    </Link>
                    <Link
                      to="/team-map"
                      className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 transition-transform hover:-translate-y-0.5 shadow-sm"
                    >
                      <Network className="h-4 w-4" />
                      {t('teamOverview.brief.openMap')}
                    </Link>
                  </div>
                </div>

                <div className="grid gap-4">
                  <DashboardPanel title={t('teamOverview.dashboard.risks')} tone="warm">
                    {teamBrief.dashboard.riskItems.length > 0 ? teamBrief.dashboard.riskItems.map((item) => (
                      <p key={item} className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800">{item}</p>
                    )) : (
                      <p className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-500">{t('teamOverview.brief.noBlockers')}</p>
                    )}
                  </DashboardPanel>
                  <DashboardPanel title={t('teamOverview.dashboard.nextStep')} tone="neutral">
                    <p className="rounded-xl border border-slate-100 bg-white px-4 py-3 text-sm leading-relaxed text-slate-700">{teamBrief.dashboard.primaryNextAction}</p>
                    <div className="grid gap-2">
                      {teamBrief.nextSteps.slice(0, 2).map((item) => (
                         <p key={item} className="rounded-xl bg-slate-50 px-4 py-2.5 text-xs text-slate-600">{item}</p>
                      ))}
                    </div>
                  </DashboardPanel>
                </div>
              </div>
            </section>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.9fr)]">
              <section className="rounded-[24px] border border-slate-200/60 bg-slate-50/50 p-6 shadow-sm">
                <div className="mb-5 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">{t('teamOverview.dashboard.activeWork')}</p>
                    <h3 className="mt-1 text-lg font-semibold text-slate-900">{t('teamOverview.dashboard.activeWorkSubtitle')}</h3>
                  </div>
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-xs font-medium text-blue-700">
                    {highlightedWorkItems.length}
                  </span>
                </div>
                <div className="grid gap-3">
                  <AnimatePresence>
                    {highlightedWorkItems.length > 0 ? highlightedWorkItems.map((item) => (
                      <motion.div
                        key={`${item.memberId}-${item.title}`}
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={cn(
                          "rounded-2xl border border-l-4 bg-white px-5 py-4 shadow-sm",
                          item.statusKey === 'blocked' || item.statusKey === 'waiting_approval'
                            ? 'border-l-amber-400 border-slate-200'
                            : 'border-l-blue-400 border-slate-200',
                        )}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="space-y-1">
                            <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                            <p className="text-xs text-slate-500">{item.memberName}</p>
                          </div>
                          <StatusDot statusKey={item.statusKey} />
                        </div>
                        <p className="mt-3 text-xs text-slate-400">{item.etaText}</p>
                      </motion.div>
                    )) : (
                      <motion.p 
                        initial={{ opacity: 0 }} 
                        animate={{ opacity: 1 }}
                        className="rounded-2xl border border-slate-200 border-dashed bg-white px-5 py-6 text-center text-sm text-slate-500"
                      >
                        {t('teamOverview.dashboard.noActiveWork')}
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>
              </section>

              <section className="rounded-[24px] border border-slate-200/60 bg-white p-6 shadow-sm">
                <div className="mb-5 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{t('teamOverview.sections.entryOwnership')}</p>
                    <h3 className="mt-1 text-lg font-semibold text-slate-900">{t('teamOverview.sections.entryOwnershipSubtitle')}</h3>
                  </div>
                  <span className="text-sm text-slate-400">{configuredChannelTypes.length}</span>
                </div>
                <div className="grid gap-3">
                  {configuredChannelTypes.map((channelType) => {
                    const ownerId = channelOwners[channelType];
                    const owner = ownerId ? agents.find((agent) => agent.id === ownerId) ?? null : null;
                    const Icon = CHANNEL_ICONS[channelType] || MessageSquare;
                    return (
                      <div key={channelType} className="flex items-center gap-4 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-700 shadow-sm">
                          <Icon className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-900 capitalize">{channelType}</p>
                          <p className="mt-0.5 text-xs text-slate-500">
                            {owner ? owner.name : t('teamOverview.entrypoints.unassigned')}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>

            <section className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{t('teamOverview.sections.members')}</p>
                  <h3 className="mt-1 text-xl font-semibold text-slate-900">{t('teamOverview.sections.membersSubtitle')}</h3>
                </div>
              </div>
              <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
                {agents.map((agent, idx) => (
                  <AgentCard
                    key={agent.id}
                    agent={agent}
                    idx={idx}
                    lastActivity={sessionLastActivity[agent.mainSessionKey]}
                    ownedEntryPoints={getOwnedEntryPoints(agent, channelOwners, configuredChannelTypes)}
                    workVisibility={workVisibility[agent.id]}
                    onDelete={() => void deleteAgent(agent.id)}
                  />
                ))}
              </div>
            </section>
          </div>
        )}
      </div>

      <AnimatePresence>
        {createOpen && (
          <CreateAgentModal
            onClose={() => setCreateOpen(false)}
            onCreate={createAgent}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function AgentCard({
  agent,
  idx,
  lastActivity,
  ownedEntryPoints,
  workVisibility,
  onDelete,
}: {
  agent: AgentSummary;
  idx: number;
  lastActivity: number | undefined;
  ownedEntryPoints: string[];
  workVisibility?: TeamMemberWorkVisibility;
  onDelete: () => void;
}) {
  const { t } = useTranslation('common');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const teamRole = getTeamRole(agent);
  const chatAccess = getChatAccess(agent);
  const activityKey = workVisibility?.statusKey ?? (isRecentlyActive(lastActivity) ? 'active' : 'idle');
  const currentWorkTitles = workVisibility?.currentWorkTitles ?? [];
  
  const isWorking = activityKey === 'working' || activityKey === 'active';

  return (
    <motion.div 
      whileHover={{ y: -4, boxShadow: '0 12px 40px rgba(0,0,0,0.08)' }}
      className={cn(
        "flex h-full flex-col rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm transition-all",
        isWorking ? "ring-2 ring-blue-500/20" : ""
      )}
    >
      <div className="flex items-start gap-4">
        <div className={cn("relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl", agentColor(idx))}>
           <AgentIcon idx={idx} className="h-6 w-6" />
           {isWorking && (
             <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5">
               <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75"></span>
               <span className="relative inline-flex h-3.5 w-3.5 rounded-full bg-blue-500 border-2 border-white"></span>
             </span>
           )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1.5">
              <p className="truncate text-base font-semibold text-slate-900">{agent.name}</p>
              {agent.isDefault && (
                <span className="shrink-0 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-600">
                  {t('teamOverview.defaultBadge')}
                </span>
              )}
            </div>
            <StatusDot statusKey={activityKey} />
          </div>
          <p className="mt-1 line-clamp-2 text-sm text-slate-500">{agent.responsibility || t('teamOverview.card.notSet')}</p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 rounded-[20px] bg-slate-50 p-5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">{t('teamOverview.card.state')}</span>
          <span className="text-xs font-medium text-slate-700">{t(`teamOverview.role.${teamRole}`)} · {t(`teamOverview.access.${chatAccess}`)}</span>
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">{t('teamOverview.card.currentWork')}</p>
          {currentWorkTitles.length > 0 ? (
            <div className="space-y-2">
              {currentWorkTitles.slice(0, 2).map((title) => (
                <p key={title} className="rounded-xl bg-white px-3 py-2 text-sm text-slate-800 shadow-sm">{title}</p>
              ))}
            </div>
          ) : (
            <p className="rounded-xl bg-white px-3 py-2 text-sm text-slate-500 shadow-sm">{t('teamOverview.card.noCurrentWork')}</p>
          )}
        </div>
        {ownedEntryPoints.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">{t('teamOverview.card.entryOwnership')}</p>
            <div className="flex flex-wrap gap-2">
              {ownedEntryPoints.map((channelType) => {
                 const Icon = CHANNEL_ICONS[channelType] || MessageSquare;
                 return (
                  <span key={channelType} className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm">
                    <Icon className="h-3 w-3" />
                    {channelType}
                  </span>
                 );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="mt-5 grid gap-3 text-xs text-slate-500">
        <Row label={t('teamOverview.card.lastActive')}>
          <span className="font-medium text-slate-700">{formatLastActive(lastActivity, t)}</span>
        </Row>
        <Row label={t('teamOverview.card.channels')}>
          {agent.channelTypes.length === 0 ? (
            <span className="text-slate-400">{t('teamOverview.card.notConfigured')}</span>
          ) : (
            <div className="flex items-center gap-2">
              {agent.channelTypes.map((ch) => {
                const Icon = CHANNEL_ICONS[ch] || MessageSquare;
                return <Icon key={ch} className="h-4 w-4 text-slate-600" title={ch} />;
              })}
            </div>
          )}
        </Row>
        <Row label={t('teamOverview.card.model')}>
          <span className={cn('font-mono font-medium', agent.inheritedModel ? 'text-slate-400' : 'text-slate-700')}>
            {agent.modelDisplay}
          </span>
        </Row>
      </div>

      <div className="mt-5 flex justify-end">
        {confirmDelete ? (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-3">
            <span className="text-xs text-slate-500">{t('teamOverview.card.confirmDelete')}</span>
            <button
              type="button"
              onClick={() => {
                onDelete();
                setConfirmDelete(false);
              }}
              className="rounded-lg bg-rose-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-600 transition-colors"
            >
              {t('actions.delete')}
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="text-xs text-slate-500 hover:text-slate-700 transition-colors"
            >
              {t('actions.cancel')}
            </button>
          </motion.div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="text-xs text-slate-400 hover:text-rose-500 transition-colors"
          >
            {t('teamOverview.card.dismiss')}
          </button>
        )}
      </div>
    </motion.div>
  );
}

function MetricCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'neutral' | 'blue' | 'amber' | 'purple';
}) {
  const toneClass = {
    neutral: 'bg-white text-slate-900 border-slate-200/80',
    blue: 'bg-blue-50 text-blue-700 border-blue-100',
    amber: 'bg-amber-50 text-amber-700 border-amber-100',
    purple: 'bg-violet-50 text-violet-700 border-violet-100',
  }[tone];

  const leftBorderClass = {
    neutral: 'border-l-slate-400',
    blue: 'border-l-blue-500',
    amber: 'border-l-amber-500',
    purple: 'border-l-violet-500',
  }[tone];

  const dotColorClass = {
    neutral: 'bg-slate-400',
    blue: 'bg-blue-500',
    amber: 'bg-amber-500',
    purple: 'bg-violet-500',
  }[tone];

  return (
    <div className={cn('rounded-2xl border border-l-4 px-5 py-5 shadow-sm', toneClass, leftBorderClass)}>
      <div className="flex items-center gap-2">
        <span className={cn('h-2 w-2 rounded-full shrink-0', dotColorClass)} />
        <p className="text-xs font-semibold uppercase tracking-wider opacity-70">{label}</p>
      </div>
      <p className="mt-3 text-3xl font-bold tracking-tight">{value}</p>
    </div>
  );
}

function DashboardPanel({
  title,
  tone,
  children,
}: {
  title: string;
  tone: 'warm' | 'neutral';
  children: ReactNode;
}) {
  return (
    <div className={cn('rounded-2xl border p-5', tone === 'warm' ? 'bg-amber-50/50 border-amber-100' : 'bg-slate-50/80 border-slate-100')}>
      <p className={cn("text-xs font-semibold uppercase tracking-wider", tone === 'warm' ? 'text-amber-700' : 'text-slate-500')}>{title}</p>
      <div className="mt-4 grid gap-3">{children}</div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="shrink-0 text-slate-400">{label}</span>
      <span className="min-w-0 truncate text-right">{children}</span>
    </div>
  );
}

export default TeamOverview;
