import { useState, useEffect, useImperativeHandle, forwardRef } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { useTeamsStore } from '@/stores/teams';
import { useAgentsStore } from '@/stores/agents';
import { motion, AnimatePresence } from 'framer-motion';
import { Network, X } from 'lucide-react';

interface DroppedAgent {
  id: string;
  name: string;
  avatar?: string | null;
}

interface CreateTeamZoneProps {
  initialLeader?: DroppedAgent | null;
  onCancel?: () => void;
  onSuccess?: () => void;
}

export interface CreateTeamZoneRef {
  handleLeaderDrop: (agentId: string) => void;
  handleMemberDrop: (agentId: string) => void;
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

export const CreateTeamZone = forwardRef<CreateTeamZoneRef, CreateTeamZoneProps>(
  ({ initialLeader, onCancel, onSuccess }, ref) => {
    const [leader, setLeader] = useState<DroppedAgent | null>(initialLeader || null);
    const [members, setMembers] = useState<DroppedAgent[]>([]);
    const [showConfirmForm, setShowConfirmForm] = useState(!!initialLeader);
    const [teamName, setTeamName] = useState('');
    const [description, setDescription] = useState('');
    const [creating, setCreating] = useState(false);

    const createTeam = useTeamsStore(state => state.createTeam);
    const agents = useAgentsStore(state => state.agents);

    // 当 initialLeader 改变时更新 leader
    useEffect(() => {
      if (initialLeader) {
        setLeader(initialLeader);
        setShowConfirmForm(true);
      }
    }, [initialLeader]);

    const { setNodeRef: setLeaderRef, isOver: isOverLeader } = useDroppable({
      id: 'leader-zone',
      data: { type: 'leader' },
    });

    const { setNodeRef: setMemberRef, isOver: isOverMember } = useDroppable({
      id: 'member-zone',
      data: { type: 'member' },
    });

    // 生成带后缀的名称（如果重复）
    const generateUniqueName = (baseName: string, existingNames: string[]): string => {
      if (!existingNames.includes(baseName)) {
        return baseName;
      }

      let counter = 1;
      let newName = `${baseName}-${counter}`;
      while (existingNames.includes(newName)) {
        counter++;
        newName = `${baseName}-${counter}`;
      }
      return newName;
    };

    // Handle drop events for Leader zone - 通过 ref 暴露给父组件
    const handleLeaderDrop = (agentId: string) => {
      const agent = agents.find(a => a.id === agentId);
      if (!agent) return;

      // 如果是同一个 agent，不重复添加
      if (leader?.id === agentId) return;

      // 允许重复，但生成唯一名称
      const existingNames = [
        leader?.name,
        ...members.map(m => m.name)
      ].filter(Boolean) as string[];

      const uniqueName = generateUniqueName(agent.name, existingNames);
      setLeader({ id: agent.id, name: uniqueName, avatar: agent.avatar });
    };

    // Handle drop events for Member zone - 通过 ref 暴露给父组件
    const handleMemberDrop = (agentId: string) => {
      const agent = agents.find(a => a.id === agentId);
      if (!agent) return;

      // 允许重复，但生成唯一名称
      const existingNames = [
        leader?.name,
        ...members.map(m => m.name)
      ].filter(Boolean) as string[];

      const uniqueName = generateUniqueName(agent.name, existingNames);

      // 检查是否完全相同的条目（id 和 name 都相同）
      const exists = members.some(m => m.id === agentId && m.name === uniqueName);
      if (!exists) {
        setMembers(prev => [...prev, { id: agent.id, name: uniqueName, avatar: agent.avatar }]);
      }
    };

    // 通过 ref 暴露方法给父组件
    useImperativeHandle(ref, () => ({
      handleLeaderDrop,
      handleMemberDrop
    }), [agents, leader, members]);

    const handleConfirm = async () => {
      if (!leader || !teamName.trim()) return;

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

        // 调用成功回调
        onSuccess?.();
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
      setLeader(null);
      setMembers([]);

      // 调用取消回调
      onCancel?.();
    };

    // 创建区域 - 固定在左侧的专属 Dropzone (per D-11, D-12)
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="sticky top-0 h-fit"
      >
        <div className="bg-gradient-to-br from-blue-50/50 to-indigo-50/30 rounded-2xl border-2 border-dashed border-blue-200/60 p-6 shadow-sm">
          {/* 标题 */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-1">
              创建新团队
            </h3>
            <p className="text-sm text-slate-500">
              {leader ? "继续添加成员" : "拖拽 Agent 到下方区域"}
            </p>
          </div>

          {/* Leader 区 */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-slate-700">
                Leader
              </h4>
              <span className="text-xs text-slate-400">限 1 人</span>
            </div>
            <div
              ref={setLeaderRef}
              className={cn(
                "min-h-[100px] rounded-xl border-2 p-4 transition-all",
                isOverLeader
                  ? "border-blue-400 bg-blue-50/50 border-solid"
                  : leader
                    ? "border-blue-200 bg-white border-solid"
                    : "border-dashed border-slate-300 bg-white/50"
              )}
            >
              {leader ? (
                <AgentChip
                  agent={leader}
                  onRemove={() => setLeader(null)}
                />
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center">
                  <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-2">
                    <span className="text-2xl">👤</span>
                  </div>
                  <p className="text-sm text-slate-400">
                    拖拽 Agent 到这里
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* 分隔线 */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200"></div>
            </div>
            <div className="relative flex justify-center">
              <span className="bg-gradient-to-br from-blue-50/50 to-indigo-50/30 px-3 text-xs text-slate-400">
                然后
              </span>
            </div>
          </div>

          {/* 成员区 */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-slate-700">
                成员
              </h4>
              {members.length < 3 && (
                <span className="text-xs text-amber-600 font-medium">
                  建议至少 2-3 人
                </span>
              )}
            </div>
            <div
              ref={setMemberRef}
              className={cn(
                "min-h-[140px] rounded-xl border-2 p-4 transition-all",
                isOverMember
                  ? "border-blue-400 bg-blue-50/50 border-solid"
                  : members.length > 0
                    ? "border-slate-200 bg-white border-solid"
                    : "border-dashed border-slate-300 bg-white/50"
              )}
            >
              {members.length > 0 ? (
                <div className="space-y-2">
                  {members.map(member => (
                    <AgentChip
                      key={`${member.id}-${member.name}`}
                      agent={member}
                      onRemove={() => setMembers(prev => prev.filter(m => !(m.id === member.id && m.name === member.name)))}
                    />
                  ))}
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center">
                  <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-2">
                    <span className="text-2xl">👥</span>
                  </div>
                  <p className="text-sm text-slate-400">
                    拖拽多个 Agent 到这里
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* 确认按钮 */}
          {!showConfirmForm && (
            <button
              onClick={() => setShowConfirmForm(true)}
              disabled={!leader}
              className={cn(
                "w-full py-3.5 rounded-xl font-semibold transition-all mt-4",
                leader
                  ? "bg-blue-600 text-white hover:bg-blue-700 shadow-sm hover:shadow"
                  : "bg-slate-100 text-slate-400 cursor-not-allowed"
              )}
            >
              创建团队
            </button>
          )}

          {/* 确认表单 (per D-14) */}
          <AnimatePresence>
            {showConfirmForm && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="mt-4 p-5 rounded-xl bg-white border border-slate-200 shadow-sm space-y-4">
                  <h4 className="text-sm font-semibold text-slate-900">
                    确认创建团队
                  </h4>

                  {/* 团队名称输入 */}
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-2">
                      团队名称
                    </label>
                    <input
                      type="text"
                      value={teamName}
                      onChange={(e) => setTeamName(e.target.value)}
                      placeholder="输入团队名称"
                      className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:border-blue-400 focus:ring-4 focus:ring-blue-50 outline-none transition-all text-sm"
                    />
                  </div>

                  {/* 职责描述（可选） */}
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-2">
                      职责描述 <span className="text-slate-400">(可选)</span>
                    </label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="描述团队的职责和目标"
                      rows={3}
                      className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:border-blue-400 focus:ring-4 focus:ring-blue-50 outline-none resize-none transition-all text-sm"
                    />
                  </div>

                  {/* 按钮 */}
                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={handleCancel}
                      disabled={creating}
                      className="flex-1 py-2.5 rounded-lg border border-slate-200 text-slate-700 font-medium hover:bg-slate-50 disabled:opacity-50 transition-colors text-sm"
                    >
                      取消
                    </button>
                    <button
                      onClick={handleConfirm}
                      disabled={creating || !teamName.trim()}
                      className="flex-1 py-2.5 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors text-sm shadow-sm"
                    >
                      {creating ? '创建中...' : '确认创建'}
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    );
  }
);

export default CreateTeamZone;
