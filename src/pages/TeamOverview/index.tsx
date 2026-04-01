import { useEffect, useState, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useTeamsStore } from '@/stores/teams';
import { useAgentsStore } from '@/stores/agents';
import { TeamGrid } from '@/components/team/TeamGrid';
import { DndContext, DragOverlay, useDroppable, type DragStartEvent, type DragEndEvent } from '@dnd-kit/core';
import { AgentPanel } from '@/components/team/AgentPanel';
import { CreateTeamZone } from '@/components/team/CreateTeamZone';
import { Network } from 'lucide-react';
import { cn } from '@/lib/utils';

// 定义 drop handler 类型
interface CreateTeamZoneHandlers {
  handleLeaderDrop: (agentId: string) => void;
  handleMemberDrop: (agentId: string) => void;
}

export function TeamOverview() {
  const { t } = useTranslation('common');
  const { teams, loading, error, fetchTeams, deleteTeam } = useTeamsStore();
  const { agents } = useAgentsStore();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [firstAgent, setFirstAgent] = useState<{ id: string; name: string; avatar?: string | null } | null>(null);
  const createZoneRef = useRef<CreateTeamZoneHandlers | null>(null);

  useEffect(() => {
    void fetchTeams();
  }, [fetchTeams]);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const agentId = active.id as string;
    const agent = agents.find(a => a.id === agentId);
    if (!agent) return;

    // 如果拖到空状态区域，触发创建模式
    if (over.id === 'empty-state-dropzone' && !isCreating) {
      setIsCreating(true);
      setFirstAgent({ id: agent.id, name: agent.name, avatar: agent.avatar });
    }
    // 如果在创建模式中，调用 CreateZone 的 handler
    else if (isCreating && createZoneRef.current) {
      if (over.id === 'leader-zone') {
        createZoneRef.current.handleLeaderDrop(agentId);
      } else if (over.id === 'member-zone') {
        createZoneRef.current.handleMemberDrop(agentId);
      }
    }
  };

  // 空状态：显示大型引导卡片 (per D-19)
  const showEmptyState = !loading && !error && teams.length === 0 && !isCreating;

  return (
    <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex h-full bg-slate-50/50">
        {/* 主内容区 */}
        <div className="flex-1 flex flex-col p-8 overflow-y-auto">
          {/* 空状态：大型引导卡片 */}
          {showEmptyState ? (
            <EmptyStateDropzone activeId={activeId} />
          ) : isCreating ? (
            /* 创建模式 */
            <div className="flex-1 flex items-center justify-center">
              <div className="w-[480px]">
                <CreateTeamZone
                  ref={createZoneRef}
                  initialLeader={firstAgent}
                  onCancel={() => {
                    setIsCreating(false);
                    setFirstAgent(null);
                  }}
                  onSuccess={() => {
                    setIsCreating(false);
                    setFirstAgent(null);
                    void fetchTeams();
                  }}
                />
              </div>
            </div>
          ) : (
            /* 有团队时的正常布局 */
            <div className="flex-1 flex gap-8">
              {/* 左侧：创建区 */}
              <div className="w-[420px] shrink-0">
                <CreateTeamZone />
              </div>

              {/* 右侧：团队卡片网格 */}
              <div className="flex-1">
                {/* Header */}
                <div className="mb-8">
                  <h1 className="text-3xl font-semibold text-slate-900 tracking-tight">
                    {t('teamOverview.title')}
                  </h1>
                  <p className="mt-2 text-sm text-slate-500">
                    {loading
                      ? t('status.loading')
                      : error
                        ? t('status.loadFailed')
                        : t('teamOverview.summary', { count: teams.length })}
                  </p>
                </div>

                {/* Loading State */}
                {loading && (
                  <div className="flex items-center justify-center py-20 text-sm text-slate-400">
                    {t('status.loading')}
                  </div>
                )}

                {/* Error State */}
                {!loading && error && (
                  <div className="flex items-center justify-center py-20 text-sm text-rose-500">
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
          )}
        </div>

        {/* Agent 面板（右侧固定，带清晰边界） */}
        <AgentPanel />

        {/* 拖拽预览 (per D-13) */}
        <DragOverlay>
          {activeId ? (
            <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-lg opacity-60">
              <AgentPreview agentId={activeId} agents={agents} />
            </div>
          ) : null}
        </DragOverlay>
      </div>
    </DndContext>
  );
}

// 空状态 Dropzone 组件
function EmptyStateDropzone({ activeId }: { activeId: string | null }) {
  const { setNodeRef, isOver } = useDroppable({
    id: 'empty-state-dropzone',
  });

  return (
    <div ref={setNodeRef} className="flex-1 flex items-center justify-center">
      <div className={cn(
        "max-w-md w-full text-center transition-all duration-300",
        isOver && "scale-105"
      )}>
        <div className={cn(
          "bg-white rounded-3xl border shadow-sm p-12 transition-all duration-300",
          isOver
            ? "border-blue-400 bg-blue-50/30 shadow-lg shadow-blue-100"
            : "border-slate-200/60"
        )}>
          {/* 空状态图标 */}
          <div className={cn(
            "w-20 h-20 mx-auto mb-6 rounded-2xl flex items-center justify-center transition-all duration-300",
            isOver
              ? "bg-gradient-to-br from-blue-100 to-indigo-100"
              : "bg-gradient-to-br from-blue-50 to-indigo-50"
          )}>
            <Network className={cn(
              "w-10 h-10 transition-all duration-300",
              isOver ? "text-blue-600" : "text-blue-500"
            )} strokeWidth={1.5} />
          </div>

          {/* 标题 */}
          <h2 className="text-2xl font-semibold text-slate-900 mb-3">
            {isOver ? "松手创建团队" : "还没有团队"}
          </h2>

          {/* 描述 */}
          <p className={cn(
            "leading-relaxed mb-8 transition-colors duration-300",
            isOver ? "text-blue-600 font-medium" : "text-slate-500"
          )}>
            {isOver
              ? "将 Agent 放在这里开始创建"
              : "从右侧拖拽 Agent 到这里来创建第一个团队"}
          </p>

          {/* 动画演示占位 */}
          {!isOver && (
            <div className="flex items-center justify-center gap-4 text-sm text-slate-400">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">
                  <span className="text-xs">👤</span>
                </div>
                <span>Agent</span>
              </div>
              <div className="text-2xl">→</div>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg border-2 border-dashed border-slate-300"></div>
                <span>创建区</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AgentPreview({ agentId, agents }: { agentId: string; agents: any[] }) {
  const agent = agents.find(a => a.id === agentId);
  if (!agent) return null;

  const initials = agent.name
    .split(' ')
    .map((n: string) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="flex items-center gap-3">
      <Avatar className="h-10 w-10">
        {agent.avatar ? (
          <img src={agent.avatar} alt={agent.name} className="object-cover" />
        ) : (
          <AvatarFallback className="bg-blue-100 text-blue-600 text-sm font-medium">
            {initials}
          </AvatarFallback>
        )}
      </Avatar>
      <span className="font-medium text-sm">{agent.name}</span>
    </div>
  );
}

export default TeamOverview;
