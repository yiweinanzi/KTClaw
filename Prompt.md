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
  - `--bd: #c6c6c8` / `--ac: #007aff`（运行时可被 settings store 覆盖）
  - **Tailwind token**：`bg-clawx-ac`、`text-clawx-ac`、`border-clawx-ac`（支持 `/10`、`/40` 等透明度修饰符）
  - 主色调高亮：`#ff6a00`
- **字体**：`-apple-system, SF Pro`，正文 13px
- **Sidebar**：展开 260px / 收起 64px
- **预览命令**：`npm run build:vite`（纯前端构建）
- **类型检查**：`npx tsc --noEmit`（必须零报错）

---

## 已完成功能清单（截至 2026-03-23）

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

#### 4. 快捷操作栏（Quick Actions）✅ 已完成 (2026-03-20)
- **文件**：`src/components/workbench/workbench-empty-state.tsx`
- **实现**：6 个快捷 pill（解释代码、写单测、代码审查、优化性能、SQL 生成、文档生成）

#### 5. 会话批量管理 ✅ 已完成 (2026-03-20)
- **文件**：`src/components/layout/Sidebar.tsx`
- **实现**：右键上下文菜单（批量选择/删除），批量模式工具栏，createPortal 上下文菜单

### P1 — 下一周期

#### 6. 自动记忆提取（Memory Extractor）
- **目标**：对话结束后自动判断是否有值得写入记忆的内容
- **参考**：`reference/LobsterAI-main/src/main/libs/coworkMemoryExtractor.ts`（规则引擎）
  + `reference/LobsterAI-main/src/main/libs/coworkMemoryJudge.ts`（LLM 判断）
- **实现位置**：`electron/api/routes/memory.ts` 新增 POST /api/memory/extract

#### 7. MCP 服务器管理页面 ✅ 已完成 (2026-03-20)
- **文件**：`src/pages/Skills/McpTab.tsx`（新建）、`src/pages/Skills/index.tsx`（集成 tab 切换）
- **后端**：`electron/api/routes/mcp.ts`（GET/POST/PATCH/DELETE /api/mcp）
- **实现**：服务器列表、启用/禁用切换、添加/编辑/删除、transport 类型（stdio/sse/http）

#### 8. 定时任务运行历史 ✅ 已完成 (2026-03-20)
- **文件**：`src/pages/Cron/index.tsx`（Pipelines Tab）、`electron/api/routes/cron.ts`
- **实现**：行内展开式历史记录，GET /api/cron/runs/:jobId 读取 jsonl 日志，显示时间/状态/耗时/摘要

#### 9. 头像偏好持久化 ✅ 已完成 (2026-03-20)
- **文件**：`src/components/layout/Sidebar.tsx`（AvatarPopup）
- **实现**：localStorage（clawx-user-avatar / clawx-user-nickname），Sidebar 头像按钮显示选中 emoji

### P2 — 后续

10. **主题色自定义** ✅ 已完成 (2026-03-20) — settings store `accentColor` + CSS `--ac` 变量 + 6色预设 + 自定义色轮；App.tsx 统一注入 CSS 变量
11. **应用自动更新** — update store 已完整（checkForUpdates/downloadUpdate/installUpdate），Settings UI 已有 autoCheckUpdate/autoDownloadUpdate toggle
12. **图片附件** ✅ 已完成（ChatInput 文件 staging + ChatMessage lightbox 图片预览）
13. **自动记忆提取** ✅ 已完成 (2026-03-20) — POST /api/memory/extract（启发式，写入 memory/YYYY-MM-DD.md）；Chat 顶栏「🧠 记忆」按钮（≥2条消息时显示）

### Design Polish（2026-03-23 完成）
- **主题色全局化**：`clawx-ac` Tailwind token + `--ac-rgb` CSS 变量，App.tsx 自动解析 hex→RGB，支持透明度修饰符
- **全量替换**：26 个文件 100+ 处硬编码 `#007aff` 改为 `bg-clawx-ac`/`text-clawx-ac` 等 token
- **Empty states 升级**：Activity（📋）、Costs（💸）页空状态加图标
- **Debug 清理**：ChatInput、Skills 所有 `console.log/warn/error` 已移除
- **链接 hover 颜色**：MarkdownContent 链接 hover 改用 `text-clawx-ac/80`（跟随主题色）

### 待实现（下一步重点）

#### 前端
- [x] **Costs 大盘监控 Tab** ✅ 已完成 — 折线图/柱状图（用量趋势）、按 Agent/模型分组
- [x] **Costs 告警策略 Tab** ✅ 已完成 — 阈值配置表单、告警规则 CRUD
- [ ] **Settings 应用自动更新 UI**：接入 update store（checkForUpdates/downloadUpdate/installUpdate）
- [ ] **TeamMap 层级图**：真实 Agent 树形结构渲染（目前是静态占位）

#### 后端
- [x] **`electron/api/routes/costs.ts`** ✅ 已完成 — GET /api/costs/summary（按天/周/月聚合）、GET /api/costs/by-agent、GET /api/costs/by-model
- [x] **`electron/api/routes/alerts.ts`** ✅ 已完成 — 告警规则 CRUD，写入 `~/.openclaw/alerts.json`
- [x] **`electron/api/routes/channels.ts`** 测试接口 ✅ 已完成 — POST /api/channels/:id/test + POST /api/channels/:id/send
- [ ] **`electron/api/routes/update.ts`**：接入 electron-updater，暴露 check/download/install 端点

### Settings 页面优化（2026-03-23 完成）
- **ModelProviderSection**：替换 STATIC_PROVIDERS 为真实 ProvidersSettings 组件；defaultModel + contextLimit 接入 persist store
- **ChannelAdvancedSection**：替换 STATIC_ROUTES 为正确空状态
- **ToolPermissionsSection**：替换 CUSTOM_GRANTS_DATA 为空状态
- **反馈按钮**：「提交 Issue」打开 GitHub；「复制本机运行环境清单」写入剪贴板
- **settings store**：新增 defaultModel（默认 claude-sonnet-4-6）+ contextLimit（默认 32000）

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
- [ ] 与设计稿颜色/间距一致（`clawx-ac` 主色 token / `var(--ac)` CSS 变量、`#f2f2f7` 背景）
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

## 最近提交记录（截至 2026-03-23）

```
3ddda7b feat: design polish — accent color token system + empty states + debug cleanup
5b17915 feat: P2全量完成 — 记忆提取、主题色自定义
61c5df1 feat: P0剩余 + P1全量完成 — MCP管理、Cron历史、头像持久化、批量管理、快捷操作
8cd9d5f chore: 更新 Prompt.md + progress.txt (P0 session-2 完成记录)
fbaf344 feat: P0 Chat升级 — Markdown渲染、AskUserQuestion Wizard、工作目录选择器
433141c feat: full memory dashboard page + enhanced backend + sidebar entry
```
