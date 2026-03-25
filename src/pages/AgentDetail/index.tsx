import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAgentsStore } from '@/stores/agents';
import { hostApiFetch } from '@/lib/host-api';
import type { AgentCronRelation, CronJob } from '@/types/cron';

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-6 border-b border-black/[0.04] py-3 text-[13px]">
      <span className="text-[#8e8e93]">{label}</span>
      <span className="max-w-[360px] text-right text-[#111827]">{value || '—'}</span>
    </div>
  );
}

function formatSchedule(schedule: CronJob['schedule']): string {
  if (typeof schedule === 'string') return schedule;
  if (schedule.kind === 'cron') return schedule.expr;
  if (schedule.kind === 'every') {
    const ms = schedule.everyMs;
    if (ms < 60_000) return `every ${ms / 1000}s`;
    if (ms < 3_600_000) return `every ${ms / 60_000}m`;
    if (ms < 86_400_000) return `every ${ms / 3_600_000}h`;
    return `every ${ms / 86_400_000}d`;
  }
  if (schedule.kind === 'at') return `at ${schedule.at}`;
  return '—';
}

function formatTime(iso?: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

/* ─── Avatar Section ─── */

interface AvatarSectionProps {
  agentId: string;
  agentName: string;
  avatar: string | null | undefined;
  onAvatarChange: (avatar: string | null) => void;
}

function AvatarSection({ agentId, agentName, avatar, onAvatarChange }: AvatarSectionProps) {
  const { t } = useTranslation('agents');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const showFeedback = useCallback((type: 'success' | 'error', msg: string) => {
    setFeedback({ type, msg });
    setTimeout(() => setFeedback(null), 3000);
  }, []);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!fileInputRef.current) fileInputRef.current = e.target;
      e.target.value = '';
      if (!file) return;

      setUploading(true);
      try {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error('Failed to read file'));
          reader.readAsDataURL(file);
        });

        await hostApiFetch(`/api/agents/${encodeURIComponent(agentId)}`, {
          method: 'PUT',
          body: JSON.stringify({ avatar: base64 }),
        });
        onAvatarChange(base64);
        showFeedback('success', t('detail.avatarUploaded', { defaultValue: 'Avatar updated' }));
      } catch {
        showFeedback('error', t('detail.avatarUploadFailed', { defaultValue: 'Failed to upload avatar' }));
      } finally {
        setUploading(false);
      }
    },
    [agentId, onAvatarChange, showFeedback, t],
  );

  const handleRemove = useCallback(async () => {
    setUploading(true);
    try {
      await hostApiFetch(`/api/agents/${encodeURIComponent(agentId)}`, {
        method: 'PUT',
        body: JSON.stringify({ avatar: null }),
      });
      onAvatarChange(null);
      showFeedback('success', t('detail.avatarRemoved', { defaultValue: 'Avatar removed' }));
    } catch {
      showFeedback('error', t('detail.avatarRemoveFailed', { defaultValue: 'Failed to remove avatar' }));
    } finally {
      setUploading(false);
    }
  }, [agentId, onAvatarChange, showFeedback, t]);

  const initials = agentName
    .split(/\s+/)
    .map((w) => w[0] ?? '')
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="rounded-3xl border border-black/[0.06] bg-white p-6">
      <h2 className="text-[18px] font-semibold text-[#111827]">
        {t('detail.avatar', { defaultValue: 'Avatar' })}
      </h2>
      <div className="mt-4 flex items-center gap-5">
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-[#f1f5f9]">
          {avatar ? (
            <img src={avatar} alt={agentName} className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-[20px] font-semibold text-[#94a3b8]">
              {initials || '?'}
            </span>
          )}
          {uploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/70">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-[#007aff] border-t-transparent" />
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            className="rounded-lg border border-black/10 bg-[#f8fafc] px-3 py-1.5 text-[13px] text-[#374151] hover:bg-[#f1f5f9] disabled:opacity-50"
          >
            {t('detail.uploadAvatar', { defaultValue: 'Upload Avatar' })}
          </button>
          {avatar && (
            <button
              type="button"
              disabled={uploading}
              onClick={() => void handleRemove()}
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-[13px] text-red-600 hover:bg-red-100 disabled:opacity-50"
            >
              {t('detail.removeAvatar', { defaultValue: 'Remove Avatar' })}
            </button>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => void handleFileChange(e)}
        />
      </div>

      {feedback && (
        <p
          className={`mt-3 text-[12px] ${feedback.type === 'success' ? 'text-green-600' : 'text-red-500'}`}
        >
          {feedback.msg}
        </p>
      )}
    </div>
  );
}

/* ─── Cron Jobs Section ─── */

interface CronSectionProps {
  agentId: string;
}

function CronSection({ agentId }: CronSectionProps) {
  const { t } = useTranslation('agents');
  const navigate = useNavigate();
  const [relations, setRelations] = useState<AgentCronRelation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const loadRelations = async () => {
      setLoading(true);
      setError(null);

      try {
        const result = await hostApiFetch<{ relations?: AgentCronRelation[] }>(`/api/agents/${encodeURIComponent(agentId)}/cron-relations`);
        if (cancelled) return;
        setRelations(Array.isArray(result?.relations) ? result.relations : []);
      } catch (err) {
        if (!cancelled) {
          setRelations([]);
          setError(String(err));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadRelations();

    return () => { cancelled = true; };
  }, [agentId]);

  return (
    <div className="rounded-3xl border border-black/[0.06] bg-white p-6">
      <h2 className="text-[18px] font-semibold text-[#111827]">
        {t('detail.cronJobs', { defaultValue: 'Cron Jobs' })}
      </h2>

      {loading && (
        <p className="mt-4 text-[13px] text-[#8e8e93]">
          {t('detail.cronLoading', { defaultValue: 'Loading cron jobs...' })}
        </p>
      )}

      {!loading && error && (
        <p className="mt-4 text-[13px] text-red-500">{error}</p>
      )}

      {!loading && !error && relations.length === 0 && (
        <p className="mt-4 text-[13px] text-[#8e8e93]">
          {t('detail.noCronJobs', { defaultValue: 'No cron jobs associated with this agent.' })}
        </p>
      )}

      {!loading && !error && relations.length > 0 && (
        <div className="mt-4 space-y-2">
          {relations.map((relation) => (
            <button
              key={relation.job.id}
              type="button"
              onClick={() => navigate(relation.deepLink)}
              className="flex w-full items-center justify-between rounded-2xl border border-black/[0.06] bg-[#f8fafc] px-4 py-3 text-left hover:bg-[#f1f5f9] transition-colors"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[13px] font-medium text-[#111827]">{relation.job.name}</span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      relation.job.enabled
                        ? 'bg-green-100 text-green-700'
                        : 'bg-[#f1f5f9] text-[#8e8e93]'
                    }`}
                  >
                    {relation.job.enabled
                      ? t('detail.cronEnabled', { defaultValue: 'enabled' })
                      : t('detail.cronDisabled', { defaultValue: 'disabled' })}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center gap-3 text-[12px] text-[#8e8e93]">
                  <span>{formatSchedule(relation.job.schedule)}</span>
                  <span>{relation.relationReason}</span>
                  {relation.job.lastRun && (
                    <span>
                      {t('detail.cronLastRun', { defaultValue: 'Last run' })}: {formatTime(relation.job.lastRun.time)}
                    </span>
                  )}
                </div>
              </div>
              <svg
                className="ml-3 h-4 w-4 shrink-0 text-[#c7c7cc]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Main Page ─── */

export function AgentDetail() {
  const { t } = useTranslation('agents');
  const { agentId = '' } = useParams();
  const { agents, fetchAgents, loading } = useAgentsStore();
  const [localAvatar, setLocalAvatar] = useState<{ agentId: string; avatar: string | null } | null>(null);

  useEffect(() => {
    void fetchAgents();
  }, [fetchAgents]);

  const agent = useMemo(
    () => agents.find((entry) => entry.id === agentId) ?? null,
    [agentId, agents],
  );

  const directReports = useMemo(
    () => agents.filter((entry) => (agent as AgentSummaryWithHierarchy)?.directReports?.includes(entry.id)),
    [agent, agents],
  );
  const reportsToId = (agent as AgentSummaryWithHierarchy)?.reportsTo ?? null;
  const reportsTo = reportsToId ? agents.find((entry) => entry.id === reportsToId) ?? null : null;
  const hierarchySummary = agent?.isDefault
    ? t('detail.rootSummary', { defaultValue: 'This is the root KTClaw agent.' })
    : t('detail.reportsToSummary', { name: agent?.name ?? '', parent: reportsTo?.name ?? 'main', defaultValue: `${agent?.name ?? ''} reports to ${reportsTo?.name ?? 'main'}` });

  if (!loading && !agent) {
    return (
      <div className="mx-auto flex h-full max-w-4xl flex-col gap-6 px-8 py-10">
        <Link to="/agents" className="text-[13px] text-[#8e8e93] hover:text-[#111827]">
          {t('detail.backToAgents', { defaultValue: 'Back to agents' })}
        </Link>
        <div className="rounded-3xl border border-black/[0.06] bg-white p-8">
          <h1 className="text-[28px] font-semibold text-[#111827]">
            {t('detail.notFoundTitle', { defaultValue: 'Agent not found' })}
          </h1>
          <p className="mt-3 text-[14px] text-[#6b7280]">
            {t('detail.notFoundDescription', {
              defaultValue: 'The requested agent does not exist in the current KTClaw snapshot.',
            })}
          </p>
        </div>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="flex h-full items-center justify-center text-[13px] text-[#8e8e93]">
        {t('detail.loading', { defaultValue: 'Loading agent details...' })}
      </div>
    );
  }

  const avatarValue = localAvatar?.agentId === agent?.id
    ? localAvatar.avatar
    : (agent as AgentSummaryWithAvatar | null)?.avatar ?? null;

  return (
    <div className="mx-auto flex h-full max-w-5xl flex-col gap-6 px-8 py-10">
      <Link to="/agents" className="text-[13px] text-[#8e8e93] hover:text-[#111827]">
        {t('detail.backToAgents', { defaultValue: 'Back to agents' })}
      </Link>

      <section className="rounded-[28px] border border-black/[0.06] bg-white p-8 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <div className="text-[12px] font-medium uppercase tracking-[0.18em] text-[#8e8e93]">
              {t('detail.kicker', { defaultValue: 'Agent detail' })}
            </div>
            <h1 className="mt-2 text-[34px] font-semibold text-[#111827]">{agent.name}</h1>
            <p className="mt-3 max-w-[720px] text-[14px] leading-7 text-[#4b5563]">
              {agent.persona || t('detail.noPersona', { defaultValue: 'No persona configured.' })}
            </p>
          </div>
          <div className="rounded-2xl bg-[#f8fafc] px-4 py-3 text-right">
            <div className="text-[12px] text-[#8e8e93]">{t('detail.channels', { defaultValue: 'Channels' })}</div>
            <div className="mt-1 text-[24px] font-semibold text-[#111827]">{agent.channelTypes.length}</div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]">
        <section className="rounded-3xl border border-black/[0.06] bg-white p-6">
          <h2 className="text-[18px] font-semibold text-[#111827]">
            {t('detail.metadata', { defaultValue: 'Metadata' })}
          </h2>
          <div className="mt-4">
            <DetailRow label={t('detail.agentId', { defaultValue: 'Agent ID' })} value={agent.id} />
            <DetailRow label={t('detail.model', { defaultValue: 'Model' })} value={agent.modelDisplay} />
            <DetailRow label={t('detail.workspace', { defaultValue: 'Workspace' })} value={agent.workspace} />
            <DetailRow label={t('detail.agentDir', { defaultValue: 'Agent directory' })} value={agent.agentDir} />
            <DetailRow label={t('detail.mainSessionKey', { defaultValue: 'Main session key' })} value={agent.mainSessionKey} />
          </div>
        </section>

        <section className="space-y-6">
          <AvatarSection
            agentId={agent.id}
            agentName={agent.name}
            avatar={avatarValue}
            onAvatarChange={(avatar) => setLocalAvatar({ agentId: agent.id, avatar })}
          />

          <div className="rounded-3xl border border-black/[0.06] bg-white p-6">
            <h2 className="text-[18px] font-semibold text-[#111827]">
              {t('detail.hierarchy', { defaultValue: 'Hierarchy' })}
            </h2>
            <p className="mt-3 text-[14px] text-[#4b5563]">
              {hierarchySummary}
            </p>
            <div className="mt-4 space-y-3 text-[13px]">
              <DetailRow
                label={t('detail.reportsTo', { defaultValue: 'Reports to' })}
                value={reportsTo?.id ?? t('detail.none', { defaultValue: 'none' })}
              />
              <DetailRow
                label={t('detail.directReports', { defaultValue: 'Direct reports' })}
                value={directReports.length > 0 ? directReports.map((entry) => entry.id).join(', ') : t('detail.none', { defaultValue: 'none' })}
              />
            </div>
          </div>

          <div className="rounded-3xl border border-black/[0.06] bg-white p-6">
            <h2 className="text-[18px] font-semibold text-[#111827]">
              {t('detail.channels', { defaultValue: 'Channels' })}
            </h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {agent.channelTypes.length > 0 ? (
                agent.channelTypes.map((channelType) => (
                  <span
                    key={channelType}
                    className="rounded-full border border-black/10 bg-[#f8fafc] px-3 py-1 text-[12px] text-[#374151]"
                  >
                    {channelType}
                  </span>
                ))
              ) : (
                <span className="text-[13px] text-[#8e8e93]">
                  {t('detail.noChannels', { defaultValue: 'No channels assigned.' })}
                </span>
              )}
            </div>
          </div>
        </section>
      </div>

      <CronSection agentId={agent.id} />
    </div>
  );
}

// Extended type to handle optional avatar field that may come from the API
interface AgentSummaryWithAvatar {
  avatar?: string | null;
}

// Extended type to handle hierarchy fields from the API
interface AgentSummaryWithHierarchy {
  reportsTo?: string | null;
  directReports?: string[];
}

export default AgentDetail;
