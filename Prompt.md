# ClawX 持久化开发命令

工作目录：`C:\Users\22688\Desktop\ClawX-main`

---

## 角色分工

| 角色 | 工具 | 职责 |
|------|------|------|
| **Claude Code（你）** | 本体 | 架构师 + 质检师：分析需求、设计方案、审查代码、质量把关 |
| **Codex MCP（GPT-5.3 high）** | `mcp__codex-mcp__codex` | 代码执行者：按架构师指令写代码、修改文件、运行命令 |

**调用 Codex 的标准姿势：**
```
mcp__codex-mcp__codex(
  prompt: "<精确的任务描述，含文件路径、接口签名、验收标准>",
  model: "gpt-5.3-codex",
  reasoningEffort: "high",
  sandbox: "workspace-write",
  workingDirectory: "C:/Users/22688/Desktop/ClawX-main"
)
```

> ⚠️ Codex MCP 已恢复可用（2026-03-20 修复）。优先用 Codex 写业务代码，Claude 负责架构设计和审查。

---

## 持久化工作流（每次会话必须执行）

### 会话开始（恢复上下文）
```bash
git log --oneline -8
cat continue/task.json | python -c "import sys,json; d=json.load(sys.stdin); print(d.get('current_focus',''))"
tail -30 continue/progress.txt
```

### 会话结束（必须执行）
1. 更新 `continue/task.json`（task 状态、current_focus、last_updated）
2. 追加 `continue/progress.txt`（本次做了什么、决策、阻塞、下一步）
3. 每完成一个 task 做一次本地 commit
4. 更新本文件 `Prompt.md`（已完成清单、待实现清单）

---

## 技术规范

- **框架**：Electron + React 19 + TypeScript + Tailwind CSS + Vite
- **状态管理**：Zustand（stores 在 `src/stores/`）
- **API 调用**：必须走 `hostApiFetch<T>()` / `invokeIpc`，不直接 fetch
- **颜色系统**：
  - `--bg: #ffffff` / `--bg2: #f2f2f7` / `--bg3: #e5e5ea`
  - `--tx: #000000` / `--tx2: #3c3c43` / `--tx3: #8e8e93`
  - `--bd: #c6c6c8` / `--ac: #007aff`
  - 主色调高亮：`#ff6a00`
- **字体**：`-apple-system, SF Pro`，正文 13px
- **Sidebar**：展开 260px / 收起 64px
- **预览命令**：`npm run build:vite`（纯前端构建）
- **类型检查**：`npx tsc --noEmit`（必须零报错）

---

## 已完成功能清单（截至 2026-03-20）

### 页面 & 路由
| 路由 | 状态 | 说明 |
|------|------|------|
| `/` Chat | ✅ | 会话列表、消息收发、流式输出、Agent 切换下拉 |
| `/channels` | ✅ | 飞书/钉钉/企业微信频道配置，i18n 标签 |
| `/cron` | ✅ | 定时任务列表、Pipelines Tab、Schedule Tab |
| `/kanban` | ✅ | 任务看板 + ApprovalsSection（审批队列）|
| `/team-overview` | ✅ | Agent 团队卡片总览 |
| `/team-map` | ✅ | 团队层级图 |
| `/activity` | ✅ | 运行日志浏览器（level 过滤、搜索、自动刷新）|
| `/costs` | ✅ | 4 tabs：实时用量、大盘监控、用量分析、告警策略 |
| `/memory` | ✅ | **完整记忆仪表盘**（见下方详情）|
| `/settings` | ✅ | 分组设置中心（记忆与知识、迁移备份、Gateway 端口）|
| `/agents` | ✅ | Agent 列表 |
| `/models` | ✅ | 模型配置 |
| `/skills` | ✅ | 技能/MCP 管理 |
| `/setup` | ✅ | 首次启动向导 |

### `/memory` 页面详情（2026-03-20 完成）
- **Overview Tab**：健康度评分环（0-100）、3 个统计卡片、30 天日志活动柱状图、健康检查手风琴列表（critical/warning/info）、配置概览面板、重建索引按钮
- **Browser Tab**：文件列表（搜索 + 时间/名称/大小排序）、文件内容查看器、内联编辑器（保存写回 API）
- **Guide Tab**：最佳实践说明、混合检索权重可视化、Memory Flush 配置展示

### 后端路由（`electron/api/routes/`）
| 路由文件 | 状态 | 说明 |
|----------|------|------|
| `health.ts` | ✅ | GET /healthz, /api/healthz |
| `approvals.ts` | ✅ | GET /api/approvals, POST approve/reject |
| `memory.ts` | ✅ | **完整 MemoryApiResponse**：files（含内容）、config（openclaw.json）、status（CLI）、stats（30天timeline）、health（10项检查）；PUT /api/memory/file；POST /api/memory/reindex |
| `logs.ts` | ✅ | GET /api/logs |
| `gateway.ts` | ✅ | Gateway 生命周期 |
| `settings.ts` | ✅ | 设置读写 |
| `agents.ts` | ✅ | Agent CRUD |
| `channels.ts` | ✅ | 频道 CRUD |
| `cron.ts` | ✅ | 定时任务 CRUD |
| `sessions.ts` | ✅ | 会话管理 |

### 通知系统
- `src/stores/notifications.ts` — Zustand store（addNotification / markRead / dismiss / clearAll）
- `wireGatewayNotifications()` — 已在 `App.tsx` 中订阅 Gateway 状态变化
- Sidebar 通知铃铛 — Bell 图标 + unreadCount 徽章 + NotificationPanel 下拉

### Sidebar 导航项（任务组）
- 📋 任务看板 → `/kanban`
- 📅 任务日程 → `/cron`
- 🧠 记忆知识库 → `/memory`（已恢复）
- 💰 费用用量 → `/costs`
- ~~运行日志~~ → 已注释

---

## 待实现功能（优先级排序）

### P0 — 当前周期重点（前后端对接）

#### 1. Chat 页面深度对接 ✅ 已完成 (2026-03-20)
- **文件**：`src/pages/Chat/MarkdownContent.tsx`（新建）、`src/pages/Chat/ChatMessage.tsx`
- **实现**：代码块语法高亮（Prism）、数学公式（katex）、本地文件链接、复制按钮+语言标签
- **依赖**：react-syntax-highlighter, remark-math, rehype-katex, katex

#### 2. 审批弹窗 AskUserQuestion 支持 ✅ 已完成 (2026-03-20)
- **文件**：`src/pages/TaskKanban/AskUserQuestionWizard.tsx`（新建）、`src/pages/TaskKanban/index.tsx`
- **实现**：多步骤 fullscreen modal wizard，单选/多选/其他输入/跳过，Escape 关闭

#### 3. 工作区文件夹选择器 ✅ 已完成 (2026-03-20)
- **文件**：`src/pages/Chat/FolderSelectorPopover.tsx`（新建）、`src/pages/Chat/ChatInput.tsx`
- **实现**：工具栏文件夹按钮，popover 提供新建+最近文件夹子菜单，选中后显示绿色 chip

#### 4. 快捷操作栏（Quick Actions）
- **文件**：`src/pages/Chat/index.tsx`（空会话状态）
- **目标**：空会话时展示快捷操作按钮（类似 LobsterAI QuickActionBar）
- **参考**：`reference/LobsterAI-main/src/renderer/components/quick-actions/QuickActionBar.tsx`

#### 5. 会话批量管理
- **文件**：`src/components/layout/Sidebar.tsx`
- **目标**：长按/右键进入批量选择模式，支持批量删除
- **参考**：`reference/LobsterAI-main/src/renderer/components/cowork/CoworkSessionList.tsx`

### P1 — 下一周期

#### 6. 自动记忆提取（Memory Extractor）
- **目标**：对话结束后自动判断是否有值得写入记忆的内容
- **参考**：`reference/LobsterAI-main/src/main/libs/coworkMemoryExtractor.ts`（规则引擎）
  + `reference/LobsterAI-main/src/main/libs/coworkMemoryJudge.ts`（LLM 判断）
- **实现位置**：`electron/api/routes/memory.ts` 新增 POST /api/memory/extract

#### 7. MCP 服务器管理页面
- **文件**：`src/pages/Skills/index.tsx`（新增 MCP tab）
- **目标**：列出已配置的 MCP 服务器，支持启用/禁用/添加/删除
- **参考**：`reference/LobsterAI-main/src/renderer/components/mcp/McpManager.tsx`
- **后端**：`reference/LobsterAI-main/src/main/libs/mcpServerManager.ts`

#### 8. 定时任务运行历史
- **文件**：`src/pages/Cron/index.tsx`（Pipelines Tab 增强）
- **目标**：展示每个任务的历史运行记录（时间、状态、耗时、token 用量）
- **参考**：`reference/LobsterAI-main/src/renderer/components/scheduledTasks/AllRunsHistory.tsx`

#### 9. 头像偏好持久化
- **文件**：`src/components/layout/Sidebar.tsx`（AvatarPopup）
- **目标**：头像选择持久化到 settings store

### P2 — 后续

10. **主题定制** — 自定义颜色主题
11. **应用自动更新** — 参考 `reference/LobsterAI-main/src/main/libs/appUpdateInstaller.ts`
12. **图片附件** — Chat 输入框支持图片上传，参考 LobsterAI CoworkPromptInput

---

## LobsterAI 参考价值总结

| 模块 | 参考文件 | 可借鉴内容 |
|------|---------|-----------|
| Markdown 渲染 | `src/renderer/components/MarkdownContent.tsx` | 代码高亮、数学公式、本地文件链接、复制按钮 — **直接移植价值最高** |
| 审批 Wizard | `src/renderer/components/cowork/CoworkQuestionWizard.tsx` | AskUserQuestion 多步骤 UI |
| 快捷操作 | `src/renderer/components/quick-actions/QuickActionBar.tsx` | 空会话快捷入口 |
| 工作区选择 | `src/renderer/components/cowork/FolderSelectorPopover.tsx` | 文件夹选择 popover |
| 会话列表 | `src/renderer/components/cowork/CoworkSessionItem.tsx` | 置顶、批量删除、相对时间 |
| 记忆提取 | `src/main/libs/coworkMemoryExtractor.ts` | 规则引擎自动提取记忆 |
| 记忆判断 | `src/main/libs/coworkMemoryJudge.ts` | LLM 辅助判断是否值得记忆 |
| MCP 管理 | `src/main/libs/mcpServerManager.ts` | MCP 服务器生命周期管理 |
| 定时任务历史 | `src/renderer/components/scheduledTasks/AllRunsHistory.tsx` | 运行历史 UI |
| Toast 通知 | `src/renderer/components/Toast.tsx` | 简洁 toast 样式参考 |

---

## 架构师审查清单（每次 Codex 输出后执行）

- [ ] TypeScript 类型正确，无 `any` 滥用，`npx tsc --noEmit` 零报错
- [ ] API 调用走 `hostApiFetch<T>()` / `invokeIpc`，不直接 fetch
- [ ] 复用已有 store/hook，不重复实现
- [ ] 错误边界处理（loading / error / empty state）
- [ ] 与设计稿颜色/间距一致（`#007aff` 主色、`#f2f2f7` 背景）
- [ ] 无 `console.log` 遗留
- [ ] 无 `require()` 混用（electron 端用 import）

---

## 快速参考命令

```bash
# 类型检查（必须零报错）
npx tsc --noEmit

# 构建前端
npm run build:vite

# 查看最近提交
git log --oneline -8

# 查看当前任务
cat continue/task.json | python -c "import sys,json; d=json.load(sys.stdin); print(d.get('current_focus',''))"

# 查看进度日志
tail -40 continue/progress.txt
```

---

## 最近提交记录（截至 2026-03-20 session-2）

```
fbaf344 feat: P0 Chat升级 — Markdown渲染、AskUserQuestion Wizard、工作目录选择器
433141c feat: full memory dashboard page + enhanced backend + sidebar entry
a9b14f6 refactor: consolidate duplicate pages — merge monitoring into /costs, memory into settings
2ff36e8 feat: memory browser + costs page + notification panel (P0 complete)
e82bc23 feat: notifications store + Bell panel + Activity page + health route
11814a1 feat: approvals backend route + store + kanban integration
```
