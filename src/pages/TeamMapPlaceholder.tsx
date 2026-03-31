import { useParams, Link } from 'react-router-dom';
import { Network } from 'lucide-react';
import { useTeamsStore } from '@/stores/teams';

export function TeamMapPlaceholder() {
  const { teamId } = useParams<{ teamId: string }>();
  const teams = useTeamsStore(state => state.teams);
  const team = teams.find(t => t.id === teamId);

  return (
    <div className="flex h-full items-center justify-center bg-slate-50">
      <div className="text-center">
        <Network className="w-16 h-16 text-slate-400 mx-auto mb-4" />
        <h2 className="text-2xl font-semibold text-slate-900 mb-2">
          {team?.name || '团队地图'}
        </h2>
        <p className="text-slate-500 mb-6">
          团队地图功能将在 Phase 4 实现
        </p>
        <Link
          to="/team-overview"
          className="inline-block px-6 py-3 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
        >
          返回团队总览
        </Link>
      </div>
    </div>
  );
}
