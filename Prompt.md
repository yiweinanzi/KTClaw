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

````

> ⚠️ Codex MCP 已恢复可用（2026-03-20 修复）。优先用 Codex 写业务代码，Claude 负责架构设计和审查。

---

## 持久化工作流（每次会话必须执行）

### 会话开始（恢复上下文）
```bash
git log --oneline -8
cat continue/task.json | python -c "import sys,json; d=json.load(sys.stdin); print(d.get('current_focus',''))"
tail -30 continue/progress.txt
````

### 会话结束（必须执行）

1. 更新 `continue/task.json`（task 状态、current_focus、last_updated）
2. 追加 `continue/progress.txt`（本次做了什么、决策、阻塞、下一步）
3. 每完成一个 task 做一次本地 commit
4. 更新本文件 `Prompt.md`（已完成清单、待实现清单）

---

## 技术规范

* **框架**：Electron + React 19 + TypeScript + Tailwind CSS + Vite
* **状态管理**：Zustand（stores 在 `src/stores/`）
* **API 调用**：必须走 `hostApiFetch<T>()` / `invokeIpc`，不直接 fetch
* **颜色系统**：

  * `--bg: #ffffff` / `--bg2: #f2f2f7` / `--bg3: #e5e5ea`
  * `--tx: #000000` / `--tx2: #3c3c43` / `--tx3: #8e8e93`
  * `--bd: #c6c6c8` / `--ac: #007aff`（运行时可被 settings store 覆盖）
  * **Tailwind token**：`bg-clawx-ac`、`text-clawx-ac`、`border-clawx-ac`（支持 `/10`、`/40` 等透明度修饰符）
  * 主色调高亮：`#ff6a00`
* **字体**：`-apple-system, SF Pro`，正文 13px
* **Sidebar**：展开 260px / 收起 64px
* **预览命令**：`pnpm run build:vite`（纯前端构建）
* **类型检查**：`npx tsc --noEmit`（必须零报错）

---

## 已完成功能清单（截至 2026-03-23）

### 页面 & 路由

| 路由               | 状态 | 说明                                |
| ---------------- | -- | --------------------------------- |
| `/` Chat         | ✅  | 会话列表、消息收发、流式输出、Agent 切换下拉         |
| `/channels`      | ✅  | 飞书/钉钉/企业微信频道配置，i18n 标签            |
| `/cron`          | ✅  | 定时任务列表、Pipelines Tab、Schedule Tab |
| `/kanban`        | ✅  | 任务看板 + ApprovalsSection（审批队列）     |
| `/team-overview` | ✅  | Agent 团队卡片总览                      |
| `/team-map`      | ✅  | 团队层级图                             |
| `/activity`      | ✅  | 运行日志浏览器（level 过滤、搜索、自动刷新）         |
| `/costs`         | ✅  | 4 tabs：实时用量、大盘监控、用量分析、告警策略        |
| `/memory`        | ✅  | **完整记忆仪表盘**（见下方详情）                |
| `/settings`      | ✅  | 分组设置中心（记忆与知识、迁移备份、Gateway 端口）     |
| `/agents`        | ✅  | Agent 列表                          |
| `/models`        | ✅  | 模型配置                              |
| `/skills`        | ✅  | 技能/MCP 管理                         |
| `/setup`         | ✅  | 首次启动向导                            |

### `/memory` 页面详情（2026-03-20 完成）

* **Overview Tab**：健康度评分环（0-100）、3 个统计卡片、30 天日志活动柱状图、健康检查手风琴列表（critical/warning/info）、配置概览面板、重建索引按钮
* **Browser Tab**：文件列表（搜索 + 时间/名称/大小排序）、文件内容查看器、内联编辑器（保存写回 API）
* **Guide Tab**：最佳实践说明、混合检索权重可视化、Memory Flush 配置展示

### 后端路由（`electron/api/routes/`）

| 路由文件           | 状态 | 说明                                                                                                                                                   |
| -------------- | -- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `health.ts`    | ✅  | GET /healthz, /api/healthz                                                                                                                           |
| `approvals.ts` | ✅  | GET /api/approvals, POST approve/reject                                                                                                              |
| `memory.ts`    | ✅  | **完整 MemoryApiResponse**：files（含内容）、config（openclaw.json）、status（CLI）、stats（30天timeline）、health（10项检查）；PUT /api/memory/file；POST /api/memory/reindex |
| `logs.ts`      | ✅  | GET /api/logs                                                                                                                                        |
| `gateway.ts`   | ✅  | Gateway 生命周期                                                                                                                                         |
| `settings.ts`  | ✅  | 设置读写                                                                                                                                                 |
| `agents.ts`    | ✅  | Agent CRUD                                                                                                                                           |
| `channels.ts`  | ✅  | 频道 CRUD                                                                                                                                              |
| `cron.ts`      | ✅  | 定时任务 CRUD                                                                                                                                            |
| `sessions.ts`  | ✅  | 会话管理                                                                                                                                                 |

### 通知系统

* `src/stores/notifications.ts` — Zustand store（addNotification / markRead / dismiss / clearAll）
* `wireGatewayNotifications()` — 已在 `App.tsx` 中订阅 Gateway 状态变化
* Sidebar 通知铃铛 — Bell 图标 + unreadCount 徽章 + NotificationPanel 下拉

### Sidebar 导航项（任务组）

* 📋 任务看板 → `/kanban`
* 📅 任务日程 → `/cron`
* 🧠 记忆知识库 → `/memory`（已恢复）
* 💰 费用用量 → `/costs`
* ~~运行日志~~ → 已注释

---

## 待实现功能（优先级排序）

### P1 — 下一周期

#### 6. 记忆提取增强（规则 + LLM judge）

* **当前状态**：启发式 `POST /api/memory/extract` 已完成，能写入 `memory/YYYY-MM-DD.md`
* **下一步目标**：补全规则引擎 + LLM 判定，降低误提取和漏提取
* **参考**：`reference/LobsterAI-main/src/main/libs/coworkMemoryExtractor.ts`（规则引擎）

  * `reference/LobsterAI-main/src/main/libs/coworkMemoryJudge.ts`（LLM 判断）
* **实现位置**：`electron/api/routes/memory.ts` 新增 POST /api/memory/extract

### P2 — 后续

11. **应用自动更新（链路一致性待补）** — update store + Settings UI 已有 `check/download/install/progress`；仍需统一 `updateChannel` 持久化、feed URL 切换语义，并决定是否补 Host API update route

---

### Design Polish（2026-03-23 完成）

* **主题色全局化**：`clawx-ac` Tailwind token + `--ac-rgb` CSS 变量，App.tsx 自动解析 hex→RGB，支持透明度修饰符
* **全量替换**：26 个文件 100+ 处硬编码 `#007aff` 改为 `bg-clawx-ac`/`text-clawx-ac` 等 token
* **Empty states 升级**：Activity（📋）、Costs（💸）页空状态加图标
* **Debug 清理**：ChatInput、Skills 所有 `console.log/warn/error` 已移除
* **链接 hover 颜色**：MarkdownContent 链接 hover 改用 `text-clawx-ac/80`（跟随主题色）

### Settings 页面优化（2026-03-23 完成）

* **ModelProviderSection**：替换 STATIC_PROVIDERS 为真实 ProvidersSettings 组件；defaultModel + contextLimit 接入 persist store
* **ChannelAdvancedSection**：替换 STATIC_ROUTES 为正确空状态
* **ToolPermissionsSection**：替换 CUSTOM_GRANTS_DATA 为空状态
* **反馈按钮**：「提交 Issue」打开 GitHub；「复制本机运行环境清单」写入剪贴板
* **settings store**：新增 defaultModel（默认 claude-sonnet-4-6）+ contextLimit（默认 32000）

### Session-6 收尾（2026-03-23 完成）

* **Settings Run Doctor**：统一改走 `hostApiFetch('/api/app/openclaw-doctor', ...)`，保持 renderer/main API 边界
* **Provider 删除链路**：删除 API key 只清理 auth material，不再误删整个 provider runtime；Host API / IPC 删除路径已统一到同一同步函数
* **Provider 列表读取**：`getAllProvidersWithKeyInfo()` 改为只读，不再在读取阶段删除 provider 配置
* **Settings 剩余按钮**：路由规则、路径白名单、终端黑名单、自定义工具许可、快速授权模板已接线并持久化到 settings store
* **测试债务回收**：Workbench / Settings / Memory Browser / ChatMessage 相关单测已按现状刷新

### 待实现 & 已知问题（更新 2026-03-23 session-6）

> 审计基线（session-6）：`pnpm run typecheck` ✅；`pnpm exec tsc -p tsconfig.node.json --noEmit` ✅；`pnpm test` ✅；`pnpm run lint` ❌（当前阻塞：`src/components/layout/Sidebar.tsx`、`src/pages/Chat/FolderSelectorPopover.tsx`、`src/pages/Chat/MarkdownContent.tsx`、`src/pages/Costs/index.tsx`、`src/pages/TaskKanban/AskUserQuestionWizard.tsx` 的现存 lint 问题）；`pnpm run build:vite` 尚未在本轮重新跑

---

#### P0 — 安全 / 持久化 / 验证基线（必须先修）

| # | 范围                                                                                                                                 | 问题                                  | 说明 / 后续动作                                                                                                                                  |
| - | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 1 | `electron/api/server.ts` / `electron/api/route-utils.ts` / 多个 `electron/api/routes/*`                                              | **Host API 对 `127.0.0.1:3210` 全开放** | 当前统一 `Access-Control-Allow-Origin: *`，且无 token/origin/session 校验，任意网页都可跨站调用本地高权限接口。需收紧 CORS，仅允许受信 renderer，并为 Host API 加主进程下发的会话密钥或 nonce。 |
| 2 | `electron/api/routes/providers.ts` / `electron/api/routes/gateway.ts` / `electron/api/routes/app.ts` / `electron/api/event-bus.ts` | **Host API / SSE 暴露敏感数据**           | 当前可读到原始 provider API key、gateway token / control UI token URL、OAuth code、WhatsApp QR 等敏感 payload。需移除原始 secret 返回，SSE 增加鉴权与事件白名单。           |

---

#### P1 — 后端 / 架构 / 数据正确性

| #  | 范围                                                                                                                                 | 问题                                                     | 说明 / 后续动作                                                                                                                                                 |      |                                                                                                                         |
| -- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ----------------------------------------------------------------------------------------------------------------------- |
| 5  | `src/lib/api-client.ts` / `src/main.tsx`                                                                                           | **传输策略漂移，renderer 自己掌控 `gateway:rpc`**                 | 现在默认是 IPC-only，诊断模式才切 `WS -> HTTP -> IPC`，且由 renderer + `localStorage` 控制；这和 AGENTS.md 的 "Main-owned 固定 fallback" 不一致。需把传输顺序、backoff、诊断开关迁回 Main/preload。 |      |                                                                                                                         |
| 6  | `src/lib/host-api.ts` / `src/lib/host-events.ts`                                                                                   | **renderer 仍保留 localhost `fetch` / `EventSource` 回退**  | 一旦本地 flag 打开，renderer 会绕过 Main 直接访问 Host API/SSE，继续放大 CORS / 环境漂移风险。需把这类 fallback 限制到 browser-preview shim 或彻底移除。                                         |      |                                                                                                                         |
| 10 | `electron/services/providers/store-instance.ts` / `electron/services/secrets/secret-store.ts` / `electron/utils/secure-storage.ts` | **README 宣称 keychain，但 secret 实际仍落在 `electron-store`** | API key / OAuth token 仍存 JSON。需迁移到 OS keychain / `keytar` 或至少 `safeStorage` 包裹；`electron-store` 仅留元数据。                                                    |      |                                                                                                                         |
| 12 | `electron/api/routes/agents.ts`                                                                                                    | **删除 agent 可能误杀非 Gateway 进程，且失败被吞**                    | 拿不到 PID 时会按端口直接 `lsof` / `taskkill`；即使重启失败，API 仍可能返回成功。需校验进程身份并向上抛出 partial failure。                                                                      |      |                                                                                                                         |
| 13 | `electron/utils/channel-config.ts`                                                                                                 | **删除 default account 后可能残留顶层镜像 credential**            | 当前仅在 default account 仍存在时才重镜像；default 被删时，顶层旧字段可能保留，插件继续按旧 bot 启动。需显式清理顶层镜像键。                                                                             |      |                                                                                                                         |
| 14 | `electron/utils/channel-config.ts` / `electron/utils/openclaw-doctor.ts`                                                           | **channel 校验仍依赖 shell doctor，且存在假阳性**                  | 当前仍 shell `node openclaw.mjs doctor`，失败时甚至会因为"配置存在"直接判 `valid=true`。需统一走 `runOpenClawDoctor()` / `runOpenClawDoctorFix()`，并在失败时返回失败。                      |      |                                                                                                                         |
| 15 | `electron/main/updater.ts` / `electron/utils/store.ts`                                                                             | **更新通道语义和 feed URL 切换不一致**                             | 设置暴露的是 `stable                                                                                                                                            | beta | dev`，内部却用 `latest`，`setChannel()`只改`autoUpdater.channel` 不重算 feed URL，也不回放持久化值。需统一 channel 命名并在启动时读取 persisted channel。 |

---

#### P1 — 前端 / 交互 / 可用性

目前无未完成项。

---

#### P1 — 测试债务 / 假红修复

| #  | 范围                                              | 问题          | 说明 / 后续动作                                                                                            |
| -- | ----------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------- |
| 28 | `tests/unit/chat-input.test.tsx`                | **签名断言已过时** | 现在组件会传第 4 个 `workingDirectory` 参数，测试仍按 3 参数断言。修测试时要同时决定 working dir 功能是正式接通还是删掉。                     |
| 33 | `tests/unit/workbench-sidebar-density.test.tsx` | **通过但隔离不足** | mount 时真实触发 `fetchAgents/fetchChannels`，日志已有 `hostapi.fetch_error` 噪声。需把 Sidebar 依赖全部 mock 掉，避免偶发失败。 |

---

#### P2 — 文档 / 脚本 / 清理

| #  | 范围                                                                                                                         | 问题                         | 说明 / 后续动作                                                                                                                    |
| -- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 38 | `electron/api/routes/agents.ts` / `electron/api/routes/channels.ts` / `electron/utils/*` / `electron/main/ipc-handlers.ts` | **后端 `console.*` 清理范围要扩大** | 已不止 Prompt 旧清单点名的几个 route，`openclaw-auth`、`channel-config`、`secure-storage`、`ipc-handlers` 等仍有大量调试输出。需统一走 `logger` 并做敏感字段脱敏。 |

---

#### 持久化开发分桶（后续任务组织方式）

* `Persistence / Session Integrity`：只处理 `continue/task.json`、`continue/progress.txt`、编码/结构校验、单一 `current_focus`、恢复命令可执行性。
* `Verification Hygiene`：统一标准验证命令，新增非破坏性 `lint:check`，明确哪些任务必须跑 full test / targeted test / build / comms compare。
* `Test Harness Repair`：拆分 Vitest `node` / `jsdom` 环境，修复 Electron/Node util 测试归位问题。
* `UI Test Refresh`：重写 Chat / Workbench / Settings 的陈旧断言，避免硬编码视觉类名、过时文案、旧 IA。
* `Static vs Live Contracts`：逐页标注"真实 API""静态占位""过渡态 mock"，防止继续误报"已全量接真实数据"。
* `Accessibility & Test Seams`：补 `aria-label` / landmark / 可访问角色，并为 `hostApiFetch`、store 注入点等建立稳定 mock seam。
* `Docs & Script Safety Sync`：README / Prompt / continue 三处同步规则、命令副作用、已完成声明的更新责任。
* `E2E / Release Verification`：补 Playwright 命令、关键流程 smoke、更新链路 / 打包链路验证。

---

## LobsterAI 参考价值总结

| 模块          | 参考文件                                                        | 可借鉴内容                                |
| ----------- | ----------------------------------------------------------- | ------------------------------------ |
| Markdown 渲染 | `src/renderer/components/MarkdownContent.tsx`               | 代码高亮、数学公式、本地文件链接、复制按钮 — **直接移植价值最高** |
| 审批 Wizard   | `src/renderer/components/cowork/CoworkQuestionWizard.tsx`   | AskUserQuestion 多步骤 UI               |
| 快捷操作        | `src/renderer/components/quick-actions/QuickActionBar.tsx`  | 空会话快捷入口                              |
| 工作区选择       | `src/renderer/components/cowork/FolderSelectorPopover.tsx`  | 文件夹选择 popover                        |
| 会话列表        | `src/renderer/components/cowork/CoworkSessionItem.tsx`      | 置顶、批量删除、相对时间                         |
| 记忆提取        | `src/main/libs/coworkMemoryExtractor.ts`                    | 规则引擎自动提取记忆                           |
| 记忆判断        | `src/main/libs/coworkMemoryJudge.ts`                        | LLM 辅助判断是否值得记忆                       |
| MCP 管理      | `src/main/libs/mcpServerManager.ts`                         | MCP 服务器生命周期管理                        |
| 定时任务历史      | `src/renderer/components/scheduledTasks/AllRunsHistory.tsx` | 运行历史 UI                              |
| Toast 通知    | `src/renderer/components/Toast.tsx`                         | 简洁 toast 样式参考                        |

---

## 架构师审查清单（每次 Codex 输出后执行）

* [ ] TypeScript 类型正确，无 `any` 滥用，`npx tsc --noEmit` 零报错
* [ ] API 调用走 `hostApiFetch<T>()` / `invokeIpc`，不直接 fetch
* [ ] 复用已有 store/hook，不重复实现
* [ ] 错误边界处理（loading / error / empty state）
* [ ] 与设计稿颜色/间距一致（`clawx-ac` 主色 token / `var(--ac)` CSS 变量、`#f2f2f7` 背景）
* [ ] 无 `console.log` 遗留
* [ ] 无 `require()` 混用（electron 端用 import）

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

---

## 2026-03-24 全仓审计 / Review 记录

### Round 1（已完成）

#### Backend findings

* `P0` 统一 IPC `app:request` 仍可把未脱敏的 settings 与 provider API key 暴露给 renderer，绕过了 legacy IPC 的脱敏路径。
  * 范围：`electron/preload/index.ts`、`src/lib/api-client.ts`、`electron/main/ipc-handlers.ts`、`tests/unit/preload-security.test.ts`
  * 处理结果：已修复。`settings:get` / `settings:getAll` 在 unified handler 中已对齐 legacy 脱敏；`provider:getApiKey` 不再允许走 unified path；补充了 `app-request-security` / `preload-security` 回归测试。
  * 状态：已验证
* `P0` `/api/memory/file` 仍存在绝对路径逃逸，POSIX 下可通过绝对路径读写 workspace 之外的文件。
  * 范围：`electron/api/routes/memory.ts` 及对应安全测试
  * 处理结果：已修复。读写路径统一做 workspace 内归一化校验，绝对路径和逃逸路径都会被拒绝；已补充 `openclaw-memory-file-route` 回归测试。
  * 状态：已验证
* `P1` `safeStorage` 不可用时，secret-store 仍回退到可逆 base64 存储，不满足密钥持久化加固目标。
  * 范围：`electron/services/secrets/secret-store.ts`、`tests/unit/secret-store.test.ts`
  * 处理结果：已修复。secret 持久化改为 fail-closed；无安全存储能力时拒绝写入并清理不安全旧数据；补充了不可用分支与迁移分支测试。
  * 状态：已验证

#### Frontend findings

* `P0` `MarkdownContent` 新增的 inline `declare module` 破坏了 renderer `typecheck`。
  * 范围：`src/pages/Chat/MarkdownContent.tsx`
  * 复现：`pnpm run typecheck`
  * 处理结果：已修复。移除了非法 inline module augmentation，改为使用现有 `react-markdown` 组件类型重写 renderer props。
  * 状态：已验证
* `P0` Markdown 本地文件/外链点击走到了不存在的 preload API，Electron 内链接实际不可用。
  * 范围：`src/pages/Chat/MarkdownContent.tsx`、`electron/preload/index.ts`
  * 处理结果：已修复。本地文件改走 `window.electron.ipcRenderer.invoke('shell:openPath', ...)`，外链改走 `window.electron.openExternal(...)`。
  * 状态：已验证
* `P1` Settings 新接线的若干控制项仍只停留在 renderer/store，本轮审计判定为“视觉接线完成，但运行时仍未生效”。
  * 范围：`src/pages/Settings/index.tsx`、`src/stores/settings.ts`、`tests/unit/settings-center.test.tsx`
  * 处理结果：已修复为真实持久化设置链路。实验开关走 `/api/settings/<key>`，列表型配置走 `/api/settings` 原子更新；测试已改为断言 host settings API 持久化调用。
  * 状态：已验证

#### Round 1 补充说明

* Round 1 最终全量验证：
  * `pnpm test`
  * `pnpm run typecheck`
  * `pnpm exec tsc -p tsconfig.node.json --noEmit`
  * `pnpm run lint`
  * `pnpm run build:vite`
  * `pnpm run comms:replay`
  * `pnpm run comms:compare`
* 验证结论：以上命令已在 Round 1 收尾阶段重新跑通；`pnpm test` 当前为 `71/71` 文件、`311/311` 用例通过。

### Round 2（已完成）

#### Backend findings

* `P0` secret-store 当前的 fail-closed 实现会在 `safeStorage` 不可用时于读取路径上删除既有 provider secrets / legacy apiKeys，导致启动或打开 Provider 设置时可能直接丢凭据。
  * 范围：`electron/services/secrets/secret-store.ts`、`tests/unit/secret-store.test.ts`
  * 处理结果：已修复。读取路径改为“不可解密则返回 null 但不破坏存量数据”，同时保留 fail-closed 写入策略与加密恢复后的安全迁移。
  * 状态：已验证
* `P1` Agent 删除仍非事务性：先删配置，再做必须成功的 Gateway restart；若重启失败，会留下“配置已删、响应报错、workspace 未清理”的中间态。
  * 范围：`electron/api/routes/agents.ts`、`tests/unit/openclaw-agents-route.test.ts`
  * 处理结果：已修复。Gateway restart 失败时会回滚 agent 配置，保持删除操作事务性，同时仍保留 PID 安全护栏。
  * 状态：已验证
* `P1` updater channel 语义仍与真实发布链路不一致：当前 feed URL / channel 命名与 `electron-builder.yml` 及 release workflow 发布目录不匹配。
  * 范围：`electron/main/updater.ts`、`tests/unit/openclaw-updater.test.ts`、`electron-builder.yml`、`.github/workflows/release.yml`
  * 处理结果：已修复。用户/持久化层继续使用 `stable|beta|dev`，feed 目录显式映射为 `latest|beta|alpha`，与实际发布目录对齐。
  * 状态：已验证

#### Frontend findings

* `P1` browser-preview 模式被当前 `hostApiFetch` / `host-events` 改坏，shim 存在但 preview transport 已无法工作，且测试把失败当成了预期。
  * 范围：`src/lib/host-api.ts`、`src/lib/host-events.ts`、`src/lib/browser-preview.ts`、`tests/unit/host-api.test.ts`、`tests/unit/host-events.test.ts`、`tests/unit/browser-preview.test.ts`
  * 处理结果：已修复。恢复 preview fallback，同时保持 Electron 模式仍优先/仅走 IPC，测试已改为验证 preview 路径可用。
  * 状态：已验证
* `P1` Settings memory browser 用 `file.name` 当唯一身份，basename 冲突时会读/写错文件。
  * 范围：`src/components/settings-center/settings-memory-browser.tsx`、`tests/unit/settings-memory-browser.test.tsx`
  * 处理结果：已修复。列表选择、读取和保存统一改用稳定 `path` 身份，并新增 basename 冲突回归测试。
  * 状态：已验证
* `P1` Channel Advanced 中的 `groupChatMode` / `groupRate` 仍未走 host settings API；`Global Risk Level` selector 仍是无效控件。
  * 范围：`src/stores/settings.ts`、`src/pages/Settings/index.tsx`、`tests/unit/settings-center.test.tsx`
  * 处理结果：已修复。`groupChatMode` / `groupRate` 已持久化到 host settings API；`Global Risk Level` 已接入真实存储字段并补测试。
  * 状态：已验证
* `P2` workbench empty-state 的建议卡片在 gateway down 时仍表现为可点击、可聚焦但实际 no-op，容易误导。
  * 范围：`src/components/workbench/workbench-empty-state.tsx`、`tests/unit/workbench-empty-state.test.tsx`
  * 处理结果：已修复。gateway down 时会显示明确提示，并禁用 suggestion cards，避免误导性可点击状态。
  * 状态：已验证

#### Round 2 最终全量验证

* `pnpm exec vitest run tests/unit/secret-store.test.ts tests/unit/openclaw-agents-route.test.ts tests/unit/openclaw-updater.test.ts tests/unit/host-api.test.ts tests/unit/host-events.test.ts tests/unit/settings-memory-browser.test.tsx tests/unit/workbench-empty-state.test.tsx tests/unit/settings-center.test.tsx`
* `pnpm test`
* `pnpm run typecheck`
* `pnpm exec tsc -p tsconfig.node.json --noEmit`
* `pnpm run lint`
* `pnpm run build:vite`
* `pnpm run comms:replay`
* `pnpm run comms:compare`
* 验证结论：Round 2 修复后，全量 `pnpm test` 当前为 `71/71` 文件、`317/317` 用例通过；其余命令同步通过。

### Round 3（已完成）

#### Backend findings

* `P1` Agent 删除回滚仍未覆盖 runtime / channel side effects，只回了配置文件。
  * 范围：`electron/api/routes/agents.ts`、`electron/utils/agent-config.ts`、`tests/unit/openclaw-agents-route.test.ts`、`tests/unit/agent-config.test.ts`
  * 处理结果：已修复。删除流程改为将 runtime/workspace 清理延后到 restart 成功之后，失败回滚时不会留下 side effects 已删但配置回来的中间态。
  * 状态：已验证
* `P1` beta/dev 新安装在首启时会被 persisted/default `stable` 覆盖，错误跳回 stable feed。
  * 范围：`electron/main/updater.ts`、`electron/utils/store.ts`、`tests/unit/openclaw-updater.test.ts`
  * 处理结果：已修复。新增显式“用户是否手动设置过 channel”语义，fresh prerelease install 会保留版本派生通道，只有显式设置后才覆盖。
  * 状态：已验证
* `P2` memory host API 仍在 Electron 主线程中执行 `execSync`，会卡住 UI/IPC。
  * 范围：`electron/api/routes/memory.ts`、`tests/unit/openclaw-memory-status.test.ts`
  * 处理结果：已修复。`memory status` / `reindex` 已改为异步子进程执行，接口返回结构保持不变。
  * 状态：已验证

#### Frontend findings

* `P1` Settings controls / inline editors 缺少可访问名称，测试只按泛化 role 查询，形成假绿。
  * 范围：`src/pages/Settings/index.tsx`、`tests/unit/settings-center.test.tsx`
  * 处理结果：已修复。核心 switches / selects / inputs / inline editors 已补程序化 label，测试改为按可访问名称断言。
  * 状态：已验证
* `P2` General Settings 中“手机号 / 注销账号”是假数据 + 假操作，造成误导。
  * 范围：`src/pages/Settings/index.tsx`
  * 处理结果：已修复。替换为明确说明卡，显式声明桌面端当前不提供账号管理/注销能力。
  * 状态：已验证

#### Round 3 最终全量验证

* `pnpm exec vitest run tests/unit/settings-center.test.tsx tests/unit/openclaw-updater.test.ts tests/unit/openclaw-agents-route.test.ts tests/unit/agent-config.test.ts tests/unit/openclaw-memory-status.test.ts`
* `pnpm test`
* `pnpm run typecheck`
* `pnpm exec tsc -p tsconfig.node.json --noEmit`
* `pnpm run lint`
* `pnpm run build:vite`
* `pnpm run comms:replay`
* `pnpm run comms:compare`
* 验证结论：Round 3 修复后，全量 `pnpm test` 当前为 `72/72` 文件、`320/320` 用例通过；其余命令同步通过。

### Round 4（已完成）

#### Backend findings

* `P0` media-send 仍可接受任意磁盘路径，存在从 renderer / host-api 侧绕过 staged outbound-media 目录的本地文件读取风险。
  * 范围：`electron/main/ipc-handlers.ts`、`electron/api/routes/gateway.ts`、`electron/utils/outbound-media.ts`、`tests/unit/gateway-routes-security.test.ts`、`tests/unit/app-request-security.test.ts`
  * 处理结果：已修复。IPC 与 Host API 两条 send-with-media 链路都统一走 staged outbound-media 路径校验，非 staged 路径直接拒绝；补充 focused backend tests 证明拒绝生效。
  * 状态：已验证
* `P2` updater runtime 与发布配置说明存在残余不一致，GitHub fallback 文案与实际运行路径不符。
  * 范围：`electron-builder.yml`
  * 处理结果：已修复。更新构建配置说明，明确 runtime autoUpdater 仅使用 OSS generic feed，GitHub release 由 workflow 单独处理，不再误导为 runtime fallback。
  * 状态：已验证

#### Frontend findings

* `P1` browser-preview 下 POST/PUT 仍未自动补 JSON `Content-Type`，preview mutation flows 有解析失败风险。
  * 范围：`src/lib/host-api.ts`、`tests/unit/host-api.test.ts`
  * 处理结果：已修复。browser preview fetch 在 string body 且未显式声明时自动补 `application/json`，并新增 preview mutation 覆盖测试。
  * 状态：已验证
* `P1` Settings 新增 route/tool-permission editor 仍可能在 persistence 未成功前误报“已保存”。
  * 范围：`src/stores/settings.ts`、`src/pages/Settings/index.tsx`、`tests/unit/settings-center.test.tsx`
  * 处理结果：已修复。新增项改为先写 host settings API，成功后再更新 store/重置 editor/弹 success；失败时保留编辑内容并弹 error。
  * 状态：已验证

#### Round 4 最终全量验证

* `pnpm exec vitest run tests/unit/host-api.test.ts tests/unit/settings-center.test.tsx tests/unit/app-request-security.test.ts tests/unit/gateway-routes-security.test.ts`
* `pnpm test`
* `pnpm run typecheck`
* `pnpm exec tsc -p tsconfig.node.json --noEmit`
* `pnpm run lint`
* `pnpm run build:vite`
* `pnpm run comms:replay`
* `pnpm run comms:compare`
* 验证结论：Round 4 修复后，全量 `pnpm test` 当前为 `73/73` 文件、`326/326` 用例通过；其余命令同步通过。

---

## 2026-03-24 功能验证快照

### 1. 对话功能 / 模型配置

* 状态：已验证通过
* 覆盖内容：
  * 聊天发送、目标 Agent 路由、附件发送与 staged media 约束
  * 默认模型配置、Provider 配置读写、Provider 验证链路
  * `provider:getApiKey` 已阻断 raw secret 回传
* 证据：
  * `tests/unit/chat-input.test.tsx`
  * `tests/unit/chat-target-routing.test.ts`
  * `tests/unit/providers.test.ts`
  * `tests/unit/provider-validation.test.ts`
  * `tests/unit/app-request-security.test.ts`
  * `tests/unit/gateway-routes-security.test.ts`
* DeepSeek 说明：
  * 代码/配置层已验证 DeepSeek 相关模型路径（如 SiliconFlow 默认 `deepseek-ai/DeepSeek-V3` 与设置页 DeepSeek 选项）。
  * 本轮未做真实联网 API key 级 live call，因为仓库内没有可用的 DeepSeek 实钥；当前结论基于配置链路、Provider 映射与单测证据。

### 2. 创建分身 / 编辑分身名称与 persona

* 状态：已验证通过
* 覆盖内容：
  * 新增分身
  * 编辑分身名称
  * 新增并编辑 persona / role 字段
  * 删除分身的事务性与回滚
* 证据：
  * `tests/unit/agent-config.test.ts`
  * `tests/unit/openclaw-agents-route.test.ts`
* 实现结果：
  * 分身配置现已支持 `persona`
  * Agents 页面新增 persona 输入/编辑能力

### 3. 费用量展示

* 状态：已验证通过
* 覆盖内容：
  * recent usage
  * dashboard summary
  * by-agent breakdown
* 证据：
  * `tests/unit/costs-page.test.tsx`
  * `tests/unit/usage-routes.test.ts`

### 4. 迁移功能

* 状态：已验证通过
* 覆盖内容：
  * migration panel 入口
  * migration wizard 当前流程
* 证据：
  * `tests/unit/settings-migration-panel.test.tsx`
  * `tests/unit/settings-migration-wizard.test.tsx`

### 5. 安全基础版本设置（工具权限 / Skills / MCP 基础）

* 状态：已验证通过
* 覆盖内容：
  * route rules / path whitelist / terminal blacklist / custom tool grants / global risk level 持久化
  * Skills / MCP 配置页基础交互
  * host-api / preload / unified IPC / staged media 的安全边界
* 证据：
  * `tests/unit/settings-center.test.tsx`
  * `tests/unit/preload-security.test.ts`
  * `tests/unit/app-request-security.test.ts`
  * `tests/unit/gateway-routes-security.test.ts`
  * `tests/unit/channel-config.test.ts`

### 6. 知识库（记忆知识库基础）

* 状态：已验证通过
* 覆盖内容：
  * memory browser 双栏浏览/编辑
  * basename 冲突下按稳定 path 读写
  * memory strategy / knowledge panel
  * memory extract / memory file route / memory status
* 证据：
  * `tests/unit/settings-memory-browser.test.tsx`
  * `tests/unit/settings-memory-strategy.test.tsx`
  * `tests/unit/openclaw-memory-extract.test.ts`
  * `tests/unit/openclaw-memory-file-route.test.ts`
  * `tests/unit/openclaw-memory-status.test.ts`

### 最终全量验证（最新工作区）

* `pnpm test` -> `73/73` files, `326/326` tests passed
* `pnpm run typecheck` -> 通过
* `pnpm exec tsc -p tsconfig.node.json --noEmit` -> 通过
* `pnpm run lint` -> 通过
* `pnpm run build:vite` -> 通过
* `pnpm run comms:replay` -> 通过
* `pnpm run comms:compare` -> 通过
