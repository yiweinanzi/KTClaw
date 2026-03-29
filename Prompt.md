# ClawX 持久化开发指令

工作目录：`C:\Users\22688\Desktop\ClawX-main`

---

## 角色分工

| 角色 | 工具 | 职责 |
|------|------|------|
| **Claude Code（你）** | 本体 | 架构设计、任务拆分、代码审查、质量把关 |
| **Codex MCP（GPT-5.3 high）** | `mcp__codex-mcp__codex` | 批量写代码、修改文件、运行命令 |

---

## 持久化工作流

### 会话开始

```bash
git log --oneline -8
cat continue/task.json | python -c "import sys,json; d=json.load(sys.stdin); print(d.get('current_focus',''))"
tail -30 continue/progress.txt
```

### 会话结束

1. 更新 `continue/task.json`
2. 追加 `continue/progress.txt`
3. 每完成一批任务做一次本地 `commit`
4. 更新本文件 `Prompt.md`

---

## 技术约束

- 框架：Electron + React 19 + TypeScript + Tailwind CSS + Vite
- 状态管理：Zustand，stores 在 `src/stores/`
- API 调用：必须走 `hostApiFetch<T>()` / `invokeIpc`，不要直接 `fetch` backend
- Renderer/Main 边界：Renderer 只能通过 host-api/api-client，不直接调用 gateway endpoint
- 文档联动：功能变更后同步检查 `README.md`、`README.zh-CN.md`（必要时同 PR 更新）
- 验证命令：
  - `pnpm run typecheck`
  - `pnpm run lint`
  - `pnpm run build:vite`
  - `pnpm test`

---

## 当前焦点

`PLAN-2026-03-27-TEAM-CONTROL-PLANE-EVOLUTION`

目标：在已完成的 Team Control Plane MVP 之上，继续把团队语义从“展示层”推进到“行为层 + 入口归属 + 工作可见性”，仍然不引入新的 Team 实体，继续复用现有 agent/runtime/kanban/channels 能力。

---

## 新需求来源（spec / plan / context）

1. `docs/superpowers/specs/2026-03-27-team-control-plane-mvp-design.md`
2. `docs/superpowers/plans/2026-03-27-team-control-plane-mvp.md`
3. `team-项目文档.md`
4. `.planning/PROJECT.md`
5. `.planning/REQUIREMENTS.md`
6. `.planning/ROADMAP.md`

---

## 本阶段已完成（已从待办移除）

- agent 模型新增并持久化：
  - `teamRole: 'leader' | 'worker'`
  - `chatAccess: 'direct' | 'leader_only'`
  - `responsibility: string`
- `PUT /api/agents/:id` 已支持上述字段
- `AgentDetail` 已新增 Team Settings 可编辑区（role/access/responsibility/reportsTo）
- `TeamOverview` 已支持角色/访问模式/职责/活跃态展示
- `TeamMap` 已支持角色/访问模式/职责展示（节点 + 详情抽屉）
- 相关 i18n 键与回归测试已补齐并通过 targeted suite
- `leader_only` 已从展示语义升级为实际限制：
  - Chat 顶部 agent picker 拦截
  - Sidebar agent 入口拦截
  - Global Search agent 入口拦截
  - ChatInput `@agent` / `/agent` 目标拦截
  - `src/stores/chat.ts` 直聊 target/session 兜底
  - `POST /api/chat/send-with-media` host route 兜底
- `AgentDetail` 已明确说明 `leader_only` 的系统级行为后果
- `TeamOverview` 已增加对外入口归属概览和成员级 entry ownership 展示
- `TeamMap` 详情抽屉已增加 entry ownership 展示
- Team 页面已复用 `clawport-kanban` 派生团队工作态与 workload 信号（如 `blocked` / `waiting_approval` / `working`）
- `Leader Progress Briefing` 已产品化：
  - `src/lib/team-progress-brief.ts` 统一聚合团队汇报数据
  - `TeamOverview` 顶部新增 Leader brief 摘要与详情展开
  - `Chat` 中 Leader / 默认主 Agent 新增 `Team Brief` 入口与侧边汇报面板
  - 两个入口共用同一套 member-first briefing 逻辑
- README / README.zh-CN 已同步到当前团队控制面演进语义
- `.planning/` GSD 初始化文件已创建并同步到当前团队演进工作流

---

## 当前未完成需求（仅保留待办）

### P0

- 当前这条团队演进线已收口，无阻塞待办
- 已完成：
  - focused team regression suite 通过
  - `pnpm run typecheck` 通过
  - `pnpm run lint` 通过
  - `pnpm run build:vite` 通过

### P1（下一阶段候选）

- 团队级绩效 / 成本分析面板
- 跨 Team 协作路由
- 更正式的多 Team / persisted Team 实体建模（若产品后续确实需要）

---

## 明确不要回退

- 不要重新加回聊天页顶部 `Export` 按钮
- `Docs / Help` 继续保持停用，除非用户再次明确要求恢复
