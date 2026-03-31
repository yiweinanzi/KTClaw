import { useState, useEffect } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { Network, X } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { useTeamsStore } from '@/stores/teams';
import { useAgentsStore } from '@/stores/agents';
import { motion } from 'framer-motion';

interface DroppedAgent {
  id: string;
  name: string;
  avatar?: string | null;
}

export function CreateTeamZone() {
  const [leader, setLeader] = useState<DroppedAgent | null>(null);
  const [members, setMembers] = useState<DroppedAgent[]>([]);
  const [isDragging] = useState(false);
  const [showConfirmForm, setShowConfirmForm] = useState(false);
  const [teamName, setTeamName] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);

  const createTeam = useTeamsStore(state => state.createTeam);
  const agents = useAgentsStore(state => state.agents);

  const { setNodeRef: setLeaderRef, isOver: isOverLeader } = useDroppable({
    id: 'leader-zone',
    data: { type: 'leader' },
  });

  const { setNodeRef: setMemberRef, isOver: isOverMember } = useDroppable({
    id: 'member-zone',
    data: { type: 'member' },
  });

  // Auto-generate team name when leader is set (per D-15)
  useEffect(() => {
    if (leader && !teamName) {
      const leaderAgent = agents.find(a => a.id === leader.id);
      if (leaderAgent) {
        setTeamName(`${leaderAgent.name} 的团队`);
      }
    }
  }, [leader, agents, teamName]);

  const handleConfirm = async () => {
    if (!leader || members.length === 0 || !teamName.trim()) return;

    setCreating(true);
    try {
      await createTeam({
        leaderId: leader.id,
        memberIds: members.map(m => m.id),
        name: teamName.trim(),
        description: description.trim() || undefined,
      });

      // Success: reset state
      setLeader(null);
      setMembers([]);
      setTeamName('');
      setDescription('');
      setShowConfirmForm(false);
    } catch (error) {
      console.error('Failed to create team:', error);
    } finally {
      setCreating(false);
    }
  };

  const handleCancel = () => {
    setShowConfirmForm(false);
    setTeamName('');
    setDescription('');
  };

  // 空状态：虚线框 + 提示文字 (per D-11)
  if (!leader && members.length === 0 && !isDragging) {
    return (
      <div className="fixed left-8 top-1/2 -translate-y-1/2 w-80">
        <div className="border-2 border-dashed border-slate-300 rounded-2xl p-8 text-center">
          <Network className="w-12 h-12 text-slate-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-700 mb-2">
            创建新团队
          </h3>
          <p className="text-sm text-slate-500">
            从右侧拖拽 Agent 到这里开始创建团队
          </p>
        </div>
      </div>
    );
  }

  // 展开状态：Leader 区 + 成员区 (per D-12)
  return (
    <div className="fixed left-8 top-1/2 -translate-y-1/2 w-96">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-lg p-6 space-y-6">
        {/* Leader 区 */}
        <div>
          <h4 className="text-sm font-semibold text-slate-700 mb-3">
            Leader（限 1 人）
          </h4>
          <div
            ref={setLeaderRef}
            className={cn(
              "min-h-[80px] rounded-xl border-2 border-dashed p-4",
              isOverLeader ? "border-blue-500 bg-blue-50" : "border-slate-300",
              leader && "border-solid border-blue-200 bg-blue-50"
            )}
          >
            {leader ? (
              <AgentChip
                agent={leader}
                onRemove={() => setLeader(null)}
              />
            ) : (
              <p className="text-sm text-slate-400 text-center">
                拖拽 Agent 到这里设为 Leader
              </p>
            )}
          </div>
        </div>

        {/* 成员区 */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-slate-700">
              成员
            </h4>
            {members.length < 3 && (
              <span className="text-xs text-amber-600">
                建议至少 2-3 人
              </span>
            )}
          </div>
          <div
            ref={setMemberRef}
            className={cn(
              "min-h-[120px] rounded-xl border-2 border-dashed p-4",
              isOverMember ? "border-blue-500 bg-blue-50" : "border-slate-300",
              members.length > 0 && "border-solid border-slate-200"
            )}
          >
            {members.length > 0 ? (
              <div className="space-y-2">
                {members.map(member => (
                  <AgentChip
                    key={member.id}
                    agent={member}
                    onRemove={() => setMembers(prev => prev.filter(m => m.id !== member.id))}
                  />
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400 text-center">
                拖拽 Agent 到这里添加成员
              </p>
            )}
          </div>
        </div>

        {/* 确认按钮 */}
        <button
          onClick={() => setShowConfirmForm(true)}
          disabled={!leader || members.length === 0 || showConfirmForm}
          className="w-full py-3 rounded-xl bg-blue-600 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-700 transition-colors"
        >
          {showConfirmForm ? '填写信息...' : '创建团队'}
        </button>

        {/* 确认表单 (per D-14) */}
        {showConfirmForm && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-6 p-6 rounded-xl bg-slate-50 border border-slate-200"
          >
            <h4 className="text-sm font-semibold text-slate-700 mb-4">
              确认创建团队
            </h4>

            {/* 团队名称输入 */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-2">
                团队名称
              </label>
              <input
                type="text"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                placeholder="输入团队名称"
                className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none"
              />
            </div>

            {/* 职责描述（可选） */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-700 mb-2">
                职责描述（可选）
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="描述团队的职责和目标"
                rows={3}
                className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none resize-none"
              />
            </div>

            {/* 按钮 */}
            <div className="flex gap-3">
              <button
                onClick={handleCancel}
                disabled={creating}
                className="flex-1 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleConfirm}
                disabled={creating || !teamName.trim()}
                className="flex-1 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {creating ? '创建中...' : '确认创建'}
              </button>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}

function AgentChip({ agent, onRemove }: { agent: DroppedAgent; onRemove: () => void }) {
  const initials = agent.name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-white border border-slate-200">
      <Avatar className="h-8 w-8">
        {agent.avatar ? (
          <img src={agent.avatar} alt={agent.name} className="object-cover" />
        ) : (
          <AvatarFallback className="bg-blue-100 text-blue-600 text-xs font-medium">
            {initials}
          </AvatarFallback>
        )}
      </Avatar>
      <span className="flex-1 text-sm font-medium">{agent.name}</span>
      <button
        onClick={onRemove}
        className="p-1 rounded hover:bg-slate-100 transition-colors"
        aria-label="Remove agent"
      >
        <X className="w-4 h-4 text-slate-400" />
      </button>
    </div>
  );
}
