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

#### 6. 记忆提取增强（规则 + LLM judge）
- **当前状态**：启发式 `POST /api/memory/extract` 已完成，能写入 `memory/YYYY-MM-DD.md`
- **下一步目标**：补全规则引擎 + LLM 判定，降低误提取和漏提取
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
11. **应用自动更新（链路一致性待补）** — update store + Settings UI 已有 `check/download/install/progress`；仍需统一 `updateChannel` 持久化、feed URL 切换语义，并决定是否补 Host API update route
12. **图片附件** ✅ 已完成（ChatInput 文件 staging + ChatMessage lightbox 图片预览）
13. **自动记忆提取** ✅ 已完成 (2026-03-20) — POST /api/memory/extract（启发式，写入 memory/YYYY-MM-DD.md）；Chat 顶栏「🧠 记忆」按钮（≥2条消息时显示）

### Design Polish（2026-03-23 完成）
- **主题色全局化**：`clawx-ac` Tailwind token + `--ac-rgb` CSS 变量，App.tsx 自动解析 hex→RGB，支持透明度修饰符
- **全量替换**：26 个文件 100+ 处硬编码 `#007aff` 改为 `bg-clawx-ac`/`text-clawx-ac` 等 token
- **Empty states 升级**：Activity（📋）、Costs（💸）页空状态加图标
- **Debug 清理**：ChatInput、Skills 所有 `console.log/warn/error` 已移除
- **链接 hover 颜色**：MarkdownContent 链接 hover 改用 `text-clawx-ac/80`（跟随主题色）

### Settings 页面优化（2026-03-23 完成）
- **ModelProviderSection**：替换 STATIC_PROVIDERS 为真实 ProvidersSettings 组件；defaultModel + contextLimit 接入 persist store
- **ChannelAdvancedSection**：替换 STATIC_ROUTES 为正确空状态
- **ToolPermissionsSection**：替换 CUSTOM_GRANTS_DATA 为空状态
- **反馈按钮**：「提交 Issue」打开 GitHub；「复制本机运行环境清单」写入剪贴板
- **settings store**：新增 defaultModel（默认 claude-sonnet-4-6）+ contextLimit（默认 32000）

### 待实现 & 已知问题（更新 2026-03-23 session-4）

> 审计基线（session-4 后）：`pnpm run typecheck` ✅；`pnpm exec tsc -p tsconfig.node.json --noEmit` ✅（22 个 TS 错误已全部修复）；`pnpm run build:vite` ✅（renderer 主 chunk 2.24 MB，懒加载待重构）；Vitest node/jsdom 已拆分，假红问题修复

---

#### P0 — 安全 / 持久化 / 验证基线（必须先修）

| # | 范围 | 问题 | 说明 / 后续动作 |
|---|------|------|------|
| 1 | `electron/api/server.ts` / `electron/api/route-utils.ts` / 多个 `electron/api/routes/*` | **Host API 对 `127.0.0.1:3210` 全开放** | 当前统一 `Access-Control-Allow-Origin: *`，且无 token/origin/session 校验，任意网页都可跨站调用本地高权限接口。需收紧 CORS，仅允许受信 renderer，并为 Host API 加主进程下发的会话密钥或 nonce。 |
| 2 | `electron/api/routes/providers.ts` / `electron/api/routes/gateway.ts` / `electron/api/routes/app.ts` / `electron/api/event-bus.ts` | **Host API / SSE 暴露敏感数据** | 当前可读到原始 provider API key、gateway token / control UI token URL、OAuth code、WhatsApp QR 等敏感 payload。需移除原始 secret 返回，SSE 增加鉴权与事件白名单。 |
| 3 | `continue/task.json` / `Prompt.md` | ~~**持久化任务文件已损坏**~~ ✅ 已修复 (session-4) | task.json 重建为合法 JSON |
| 4 | `vitest.config.ts` / `tests/unit/*(agent-config|channel-config|openclaw-auth|openclaw-doctor|token-usage-scan)*` | ~~**Vitest 环境配置错误，红测被假红淹没**~~ ✅ 已修复 (session-4) | 拆分 node/jsdom 双 project |

---

#### P1 — 后端 / 架构 / 数据正确性

| # | 范围 | 问题 | 说明 / 后续动作 |
|---|------|------|------|
| 5 | `src/lib/api-client.ts` / `src/main.tsx` | **传输策略漂移，renderer 自己掌控 `gateway:rpc`** | 现在默认是 IPC-only，诊断模式才切 `WS -> HTTP -> IPC`，且由 renderer + `localStorage` 控制；这和 AGENTS.md 的 “Main-owned 固定 fallback” 不一致。需把传输顺序、backoff、诊断开关迁回 Main/preload。 |
| 6 | `src/lib/host-api.ts` / `src/lib/host-events.ts` | **renderer 仍保留 localhost `fetch` / `EventSource` 回退** | 一旦本地 flag 打开，renderer 会绕过 Main 直接访问 Host API/SSE，继续放大 CORS / 环境漂移风险。需把这类 fallback 限制到 browser-preview shim 或彻底移除。 |
| 7 | `src/pages/Settings/index.tsx` / `electron/main/ipc-handlers.ts` / `electron/api/routes/app.ts` | **Settings 的 `Run Doctor` 调用形态错误** | `runDoctor()` 直接 `invokeIpc('hostapi:fetch', { route, init })`，但主进程只接受 `{ path, method, headers, body }`。需改成标准 `hostApiFetch('/api/app/openclaw-doctor', ...)`。 |
| 8 | `electron/services/providers/provider-runtime-sync.ts` / `electron/utils/openclaw-auth.ts` | **删除 API key 会误删整个 provider runtime 配置** | `syncDeletedProviderApiKeyToRuntime()` 当前走的是 `removeProviderFromOpenClaw()`，会连 models / auth profiles / provider config 一起删。需改为仅删除 key，不拆 provider。 |
| 9 | `electron/utils/secure-storage.ts` / `electron/utils/openclaw-auth.ts` | **provider 列表读取存在副作用** | `getAllProvidersWithKeyInfo()` 会在读取阶段删除 non-builtin provider；而 `getActiveOpenClawProviders()` 读配置失败时返回空集合，可能把瞬时错误当成“配置不存在”。列表接口必须无副作用。 |
| 10 | `electron/services/providers/store-instance.ts` / `electron/services/secrets/secret-store.ts` / `electron/utils/secure-storage.ts` | **README 宣称 keychain，但 secret 实际仍落在 `electron-store`** | API key / OAuth token 仍存 JSON。需迁移到 OS keychain / `keytar` 或至少 `safeStorage` 包裹；`electron-store` 仅留元数据。 |
| 11 | `electron/gateway/manager.ts` | ~~**Gateway 重连 cooldown 代码无效**~~ ✅ 已修复 (session-4) | RESTART_COOLDOWN_MS + lastRestartAt 已补全 |
| 12 | `electron/api/routes/agents.ts` | **删除 agent 可能误杀非 Gateway 进程，且失败被吞** | 拿不到 PID 时会按端口直接 `lsof` / `taskkill`；即使重启失败，API 仍可能返回成功。需校验进程身份并向上抛出 partial failure。 |
| 13 | `electron/utils/channel-config.ts` | **删除 default account 后可能残留顶层镜像 credential** | 当前仅在 default account 仍存在时才重镜像；default 被删时，顶层旧字段可能保留，插件继续按旧 bot 启动。需显式清理顶层镜像键。 |
| 14 | `electron/utils/channel-config.ts` / `electron/utils/openclaw-doctor.ts` | **channel 校验仍依赖 shell doctor，且存在假阳性** | 当前仍 shell `node openclaw.mjs doctor`，失败时甚至会因为“配置存在”直接判 `valid=true`。需统一走 `runOpenClawDoctor()` / `runOpenClawDoctorFix()`，并在失败时返回失败。 |
| 15 | `electron/main/updater.ts` / `electron/utils/store.ts` | **更新通道语义和 feed URL 切换不一致** | 设置暴露的是 `stable|beta|dev`，内部却用 `latest`，`setChannel()` 只改 `autoUpdater.channel` 不重算 feed URL，也不回放持久化值。需统一 channel 命名并在启动时读取 persisted channel。 |
| 16 | `tsconfig.json` / `tsconfig.node.json` / `package.json` | ~~**默认 typecheck 只覆盖前端，Electron 侧已有真实编译错误堆积**~~ ✅ 已修复 (session-4) | 两侧均零错误；tsconfig.json 加入 shared/ include，移除 project reference |

---

#### P1 — 前端 / 交互 / 可用性

| # | 范围 | 问题 | 说明 / 后续动作 |
|---|------|------|------|
| 17 | `src/pages/Chat/ChatInput.tsx` / `src/pages/Chat/index.tsx` | ~~**工作目录选择器是死功能**~~ ✅ 已修复 (session-4) | workingDir 已接入 chat store / RPC cwd 字段 |
| 18 | `src/components/workbench/context-rail.tsx` | ~~**`📄 文件` 面板仍是静态占位**~~ ✅ 已修复 (session-5) | 从 chat store messages 聚合 _attachedFiles，有文件显示列表，无文件显示空态 |
| 19 | `src/pages/Channels/index.tsx` / `src/stores/channels.ts` | ~~**频道页发送与加载都有明显 UX bug**~~ ✅ 已修复 (session-4) | 发送成功后清空 composer；Enter IME guard；load error 不再吞掉 |
| 20 | `src/pages/Settings/index.tsx` | **两个 `<select>` 已绑定，多个按钮仍未接线** | `当前默认架构方案` / `默认群聊行为模式` ✅ 已绑定 store；`添加路由规则`、`路径白名单`、`编辑黑名单`、`添加工具许可`、快速授权模版仍是死按钮。 |
| 21 | `src/pages/TaskKanban/index.tsx` | ~~**乱码与文案/i18n 清理未完成**~~ ✅ 已修复 (session-4) | 拖拽到此处/简短描述任务目标/回答问题/拒绝/批准/取消/确认；IME guard 补全 |
| 22 | `src/pages/Channels/index.tsx` / `src/pages/Chat/ChatInput.tsx` | ~~**模型 fallback 仍硬编码 `GLM-5`**~~ ✅ 已修复 (session-4) | 改为 useSettingsStore().defaultModel |
| 23 | `src/i18n/index.ts` / `src/pages/Settings/index.tsx` | ~~**日语资源实际不可达**~~ ✅ 已修复 (session-4) | ja 重新接入 supportedLngs 和语言设置 UI |
| 24 | `src/pages/Chat/MarkdownContent.tsx` / `src/components/channels/ChannelConfigModal.tsx` | ~~**少数 renderer 仍绕过统一适配层**~~ ✅ 已修复 (session-5) | ChannelConfigModal 改用 invokeIpc('shell:openExternal') |
| 25 | `src/pages/TeamMap/index.tsx` / `src/types/agent.ts` / `electron/api/routes/agents.ts` | ~~**TeamMap 仍停留在 demo 级别**~~ ✅ 已修复 (session-5) | 节点点击弹出 AgentDetailDrawer；Tab 文案中文化；TeamsView 接入 onSelectAgent |
| 26 | `src/stores/update.ts` | ~~**update 事件订阅没有 guard / cleanup**~~ ✅ 已修复 (session-5) | 具名函数 + _cleanup 注册 off()，防止重复订阅 |
| 27 | `src/App.tsx` / `vite.config.ts` / `src/pages/Cron/index.tsx` / `src/stores/gateway.ts` | ~~**打包与懒加载策略需要重构**~~ ✅ 已修复 (session-5) | 所有路由改为 React.lazy + Suspense，主 chunk 已拆分 |
| 27 | `src/App.tsx` / `vite.config.ts` / `src/pages/Cron/index.tsx` / `src/stores/gateway.ts` | ~~**打包与懒加载策略需要重构**~~ ✅ 已修复 (session-5) | 所有路由改为 React.lazy + Suspense，主 chunk 已拆分 |

---

#### P1 — 测试债务 / 假红修复

| # | 范围 | 问题 | 说明 / 后续动作 |
|---|------|------|------|
| 28 | `tests/unit/chat-input.test.tsx` | **签名断言已过时** | 现在组件会传第 4 个 `workingDirectory` 参数，测试仍按 3 参数断言。修测试时要同时决定 working dir 功能是正式接通还是删掉。 |
| 29 | `tests/unit/chat-message.test.tsx` | **把视觉细节当长期契约** | 仍硬编码旧类名 `bg-[#0a84ff]` / `bg-white/95`。应改为断言语义或稳定 token，而不是锁死颜色实现。 |
| 30 | `tests/unit/workbench-*.test.tsx` / `src/stores/settings.ts` | **Workbench 测试和状态契约双双过时** | 测试仍围绕 `contextRailCollapsed`、`article` role、旧文案 `快速配置`；实现已切到 `rightPanelMode`。还要决定 `contextRailCollapsed` 是删除还是桥接。 |
| 31 | `tests/unit/settings-*.test.tsx` | **Settings 测试仍锁定旧 IA / 静态 mock / 英文步骤名** | 当前实现已换成新导航结构和中文向导，测试应按现状重写，并把真实 API / 静态占位区分开。 |
| 32 | `tests/unit/settings-memory-browser.test.tsx` | **缺测试 seam，也缺稳定无障碍标识** | 组件一挂载就真实 `hostApiFetch('/api/memory')`，测试却假设有静态 seed data；DOM 也没有明确 region/aria-label。需统一 mock `hostApiFetch`，必要时补 landmark。 |
| 33 | `tests/unit/workbench-sidebar-density.test.tsx` | **通过但隔离不足** | mount 时真实触发 `fetchAgents/fetchChannels`，日志已有 `hostapi.fetch_error` 噪声。需把 Sidebar 依赖全部 mock 掉，避免偶发失败。 |

---

#### P2 — 文档 / 脚本 / 清理

| # | 范围 | 问题 | 说明 / 后续动作 |
|---|------|------|------|
| 34 | `package.json` / `README*.md` | **`pnpm lint` 实际会改文件** | 当前脚本是 `eslint . --fix`，但文档把它当检查命令。需新增 `lint:check`，把当前命令改为 `lint:fix`，避免只读审计误改工作树。 |
| 35 | `package.json` / `README*.md` / `Prompt.md` | **包管理器与命令文档未统一** | 仓库精确钉死 `pnpm@10.31.0`，但 README 仍写 `pnpm 9+ 或 npm`，`Prompt.md` 也还有 `npm run build:vite`。需统一到 `pnpm + corepack`。 |
| 36 | `package.json` / `README*.md` / `AGENTS.md` | **文档宣称有 E2E，但脚本入口缺失** | 依赖里有 Playwright，AGENTS 也提 `pnpm run test:e2e`，但当前 scripts 没有一条一等公民 E2E 命令。需补 `test:e2e` / `test:e2e:headed`。 |
| 37 | `continue/progress.txt` / `continue/task.json` | **持久化记录已不再可信** | 多处声称“tests pass / remain green / 全部真实 API”，但 fresh run 仍有 31 个失败测试，且部分 Settings 模块仍是静态/demo。后续完成声明必须绑定验证证据。 |
| 38 | `electron/api/routes/agents.ts` / `electron/api/routes/channels.ts` / `electron/utils/*` / `electron/main/ipc-handlers.ts` | **后端 `console.*` 清理范围要扩大** | 已不止 Prompt 旧清单点名的几个 route，`openclaw-auth`、`channel-config`、`secure-storage`、`ipc-handlers` 等仍有大量调试输出。需统一走 `logger` 并做敏感字段脱敏。 |
| 39 | `Prompt.md` | **旧 backlog 需要持续纠偏** | `AutoUpdateSection 未接入` 已过时；`electron/api/routes/update.ts` 缺失应降级为“可选 HTTP route”，不该再表述成“更新功能未完成”。 |

---

#### 持久化开发分桶（后续任务组织方式）

- `Persistence / Session Integrity`：只处理 `continue/task.json`、`continue/progress.txt`、编码/结构校验、单一 `current_focus`、恢复命令可执行性。
- `Verification Hygiene`：统一标准验证命令，新增非破坏性 `lint:check`，明确哪些任务必须跑 full test / targeted test / build / comms compare。
- `Test Harness Repair`：拆分 Vitest `node` / `jsdom` 环境，修复 Electron/Node util 测试归位问题。
- `UI Test Refresh`：重写 Chat / Workbench / Settings 的陈旧断言，避免硬编码视觉类名、过时文案、旧 IA。
- `Static vs Live Contracts`：逐页标注“真实 API”“静态占位”“过渡态 mock”，防止继续误报“已全量接真实数据”。
- `Accessibility & Test Seams`：补 `aria-label` / landmark / 可访问角色，并为 `hostApiFetch`、store 注入点等建立稳定 mock seam。
- `Docs & Script Safety Sync`：README / Prompt / continue 三处同步规则、命令副作用、已完成声明的更新责任。
- `E2E / Release Verification`：补 Playwright 命令、关键流程 smoke、更新链路 / 打包链路验证。

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
# 类型检查（renderer）
pnpm run typecheck

# 类型检查（Electron / main / preload）
pnpm exec tsc -p tsconfig.node.json --noEmit

# 构建前端
pnpm run build:vite

# 单测全量
pnpm test

# 查看最近提交
git log --oneline -8

# 查看当前任务
cat continue/task.json | python -c "import sys,json; d=json.load(sys.stdin); print(d.get('current_focus',''))"

# 查看进度日志
tail -40 continue/progress.txt
```

---

## 最近提交记录（截至 2026-03-23 session-5）

```
ec63d86 fix: session-5b — update store cleanup + ChannelConfigModal shell API
49137f1 feat: session-5 — context-rail 文件面板、TeamMap 详情、路由懒加载
ea6bffb chore: 更新 Prompt.md + continue/ (session-4 完成记录)
1fe85f2 chore: ignore .npm-cache directory
18bbece fix: session-4 — TS errors, UX bugs, Vitest env split
3890698 chore: 全量代码审查 — 更新 Prompt.md 待办清单（17项已知问题）
a2f6131 chore: 更新 Prompt.md + progress.txt (session-3 完成记录)
9cc1879 chore: update Prompt.md — mark completed items, add Settings polish notes
```
