import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useTeamsStore } from '@/stores/teams';
import { TeamGrid } from '@/components/team/TeamGrid';

export function TeamOverview() {
  const { t } = useTranslation('common');
  const { teams, loading, error, fetchTeams, deleteTeam } = useTeamsStore();

  useEffect(() => {
    void fetchTeams();
  }, [fetchTeams]);

  return (
    <div className="flex h-full flex-col bg-slate-50 p-6 xl:p-8">
      <div className="flex flex-1 flex-col overflow-y-auto rounded-[32px] bg-white p-8 shadow-sm border border-slate-200/60">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">
            {t('teamOverview.title')}
          </h1>
          <p className="mt-1.5 text-sm text-slate-500">
            {loading
              ? t('status.loading')
              : error
                ? t('status.loadFailed')
                : t('teamOverview.summary', { count: teams.length })}
          </p>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
            {t('status.loading')}
          </div>
        )}

        {/* Error State */}
        {!loading && error && (
          <div className="flex flex-1 items-center justify-center text-sm text-rose-500">
            {error}
          </div>
        )}

        {/* Team Grid */}
        {!loading && !error && (
          <TeamGrid
            teams={teams}
            loading={loading}
            onDeleteTeam={deleteTeam}
          />
        )}
      </div>
    </div>
  );
}

export default TeamOverview;
