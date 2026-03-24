# ClawX 持久化开发命令

工作目录：`C:\Users\22688\Desktop\ClawX-main`

---

## 角色分工

| 角色 | 工具 | 职责 |
|------|------|------|
| **Claude Code（你）** | 本体 | 架构师 + 质检师：分析需求、设计方案、审查代码、质量把关 |
| **Codex MCP（GPT-5.3 high）** | `mcp__codex-mcp__codex` | 代码执行者：按架构师指令写代码、修改文件、运行命令 |

**调用 Codex 的标准姿势：**
```text
mcp__codex-mcp__codex(
  prompt: "<精确的任务描述，含文件路径、接口签名、验收标准>",
  model: "gpt-5.3-codex",
  reasoningEffort: "high",
  sandbox: "workspace-write",
  workingDirectory: "C:/Users/22688/Desktop/ClawX-main"
)
````

> ⚠️ Codex MCP 已恢复可用。优先用 Codex 写业务代码，Claude 负责架构设计和审查。

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
* **预览命令**：`pnpm run build:vite`
* **类型检查**：`npx tsc --noEmit`（必须零报错）

---

## 当前待实现功能（优先级排序）

### P0 — 已完成

#### 12. Chat 指令面 / 全局搜索 / Activity 结构化视图 ✅ session-10

* **状态**：已完成
* **实现**：
  * `src/pages/Chat/ChatInput.tsx` + `src/pages/Chat/slash-commands.ts`：补齐 slash menu、本地命令执行、键盘导航与 Markdown 导出
  * `src/components/layout/Sidebar.tsx` + `src/components/search/GlobalSearchModal.tsx`：补齐 Sidebar 搜索入口、`Ctrl/Cmd+K`、sessions / agents / pages / chat history 搜索
  * `src/pages/Activity/index.tsx`：补齐结构化日志卡片、level/category/filter/search、raw 展开、多行日志归并
* **测试**：
  * `tests/unit/chat-input-slash-commands.test.ts`
  * `tests/unit/chat-input.test.tsx`
  * `tests/unit/workbench-global-search.test.tsx`
  * `tests/unit/activity-page.test.tsx`

### P1 — 已完成

#### 6. 记忆提取增强（规则 + LLM judge）✅ session-7

* **状态**：已完成
* **实现**：`electron/api/routes/memory-extract.ts` — 加减分评分模型、LLM 缓存（TTL 10min, max 256）、borderline 检测（0.08 margin）、request-style 检测、长度调整
* **测试**：`tests/unit/memory-extract-scoring.test.ts`（13 条）+ `tests/unit/openclaw-memory-extract.test.ts`（3 条）

### P2 — 后续

#### 11. 应用自动更新（链路一致性待补）

* **当前状态**：update store + Settings UI 已有 `check/download/install/progress`
* **剩余工作**：决定是否补 Host API update route，并继续保证更新链路一致性

#### 13. 会话管理增强（置顶 / 更多导出入口待补）

* **当前状态**：全局搜索（含 chat history）、slash 导出、侧边栏会话/分身右键导出入口、会话置顶、结构化 Activity 与 live 刷新已补齐；按用户反馈已移除聊天页顶部 Export 按钮
* **剩余工作**：补会话详情里的更多导出入口，以及更完整的会话管理表面

#### 14. QuickAction / Markdown 增强 ✅ session-12

* **状态**：已完成
* **实现**：
  * `src/pages/Chat/MarkdownContent.tsx`：补齐 KaTeX `mhchem` 支持
  * `src/components/workbench/workbench-empty-state.tsx`：把空态快捷入口升级为更接近持久 QuickAction bar 的结构
* **测试**：
  * `tests/unit/markdown-content-mhchem.test.tsx`
  * `tests/unit/workbench-empty-state.test.tsx`

---

## 当前 backlog / 已知问题

### P0 — 安全 / 持久化 / 验证基线 ✅ 全部关闭

| # | 问题 | 状态 | 关闭原因 |
| - | --- | --- | --- |
| 1 | Host API CORS 全开放 | ✅ session-7 | `isAuthorizedHostApiRequest` 会话密钥校验已就位；`applyCorsOrigin()` 仅对受信 origin 设置 `Access-Control-Allow-Origin`（defense-in-depth） |
| 2 | Host API / SSE 暴露敏感数据 | ✅ session-6/7 | API key 已 `maskSecret()`；SSE 在 session-token auth 之后；control UI URL 已剥离 token |

---

### P1 — 后端 / 架构 / 数据正确性 ✅ 全部关闭

| #  | 问题 | 状态 | 关闭原因 |
| -- | --- | --- | --- |
| 5  | 传输策略漂移 | ✅ session-7 验证 | `gateway:rpc` 已固定 `['ipc']`，无 localStorage 控制 |
| 6  | renderer 保留 localhost fetch 回退 | ✅ session-7 验证 | 仅在 `isBrowserPreviewMode()` 下启用，正常 Electron 不触发 |
| 10 | secret 仍落在 electron-store | ✅ session-7 验证 | `secret-store.ts` 已使用 `safeStorage` 加密（`ktclaw-safe-storage/v1`） |
| 12 | 删除 agent 误杀进程 | ✅ session-7 验证 | 已有 `isGatewayPid` 安全门，无 PID 时拒绝 port-kill 并返回错误 |
| 13 | 删除 default account 残留镜像 | ✅ session-7 验证 | `remirrorDefaultAccountToTopLevel` 先调 `clearTopLevelChannelMirror` 再重镜像 |
| 14 | channel 校验假阳性 | ✅ session-7 验证 | `validateChannelConfig` 已正确使用 `runOpenClawDoctor()`，失败时返回 `valid: false` |

---

### P1 — 测试债务 / 假红修复 ✅ 全部关闭

| #  | 问题 | 状态 | 关闭原因 |
| -- | --- | --- | --- |
| 28 | chat-input 签名断言过时 | ✅ session-7 验证 | 测试已有 4 参数断言（含 `workingDirectory`） |
| 33 | sidebar 测试隔离不足 | ✅ session-7 验证 | `fetchAgents`/`fetchChannels` 已正确 mock，无 API 噪声 |

---

### P2 — 文档 / 脚本 / 清理 ✅ 全部关闭

| #  | 问题 | 状态 | 关闭原因 |
| -- | --- | --- | --- |
| 38 | 后端 console.* 清理 | ✅ session-7 验证 | 所有 electron/ 代码已统一使用 `logger`，仅 `logger.ts` 自身保留 `console.*` |

---

## 全量代码审计结果 (2026-03) ✅ 全部关闭

### 新增与已验证的 Backlog 补充
1. **Host API CORS 与鉴权设计** ✅：`applyCorsOrigin()` 已添加 origin 白名单；`isAuthorizedHostApiRequest` 会话密钥校验已就位。
2. **Renderer 层的直接网络请求** ✅：仅在 `isBrowserPreviewMode()` 下启用，正常 Electron 不触发。
3. **明文存储风险** ✅：`secret-store.ts` 已使用 `safeStorage` 加密（`ktclaw-safe-storage/v1` 格式）。
4. **编译与类型基线** ✅：`typecheck` + `tsc -p tsconfig.node.json` 零错误；`build:vite` 通过。
5. **任务管理与进程清理机制** ✅：`isGatewayPid` 安全门已就位，无 PID 时拒绝 port-kill。

---

## 持久化开发分桶（后续任务组织方式）

* `Persistence / Session Integrity`：只处理 `continue/task.json`、`continue/progress.txt`、编码/结构校验、单一 `current_focus`、恢复命令可执行性。
* `Verification Hygiene`：统一标准验证命令，新增非破坏性 `lint:check`，明确哪些任务必须跑 full test / targeted test / build / comms compare。
* `Test Harness Repair`：拆分 Vitest `node` / `jsdom` 环境，修复 Electron/Node util 测试归位问题。
* `UI Test Refresh`：重写 Chat / Workbench / Settings 的陈旧断言，避免硬编码视觉类名、过时文案、旧 IA。
* `Static vs Live Contracts`：逐页标注“真实 API”“静态占位”“过渡态 mock”，防止继续误报“已全量接真实数据”。
* `Accessibility & Test Seams`：补 `aria-label` / landmark / 可访问角色，并为 `hostApiFetch`、store 注入点等建立稳定 mock seam。
* `Docs & Script Safety Sync`：README / Prompt / continue 三处同步规则、命令副作用、已完成声明的更新责任。
* `E2E / Release Verification`：补 Playwright 命令、关键流程 smoke、更新链路 / 打包链路验证。

---

## LobsterAI 参考价值总结

| 模块          | 参考文件                                                        | 可借鉴内容                  |
| ----------- | ----------------------------------------------------------- | ---------------------- |
| Markdown 渲染 | `src/renderer/components/MarkdownContent.tsx`               | 代码高亮、数学公式、本地文件链接、复制按钮  |
| 审批 Wizard   | `src/renderer/components/cowork/CoworkQuestionWizard.tsx`   | AskUserQuestion 多步骤 UI |
| 快捷操作        | `src/renderer/components/quick-actions/QuickActionBar.tsx`  | 空会话快捷入口                |
| 工作区选择       | `src/renderer/components/cowork/FolderSelectorPopover.tsx`  | 文件夹选择 popover          |
| 会话列表        | `src/renderer/components/cowork/CoworkSessionItem.tsx`      | 置顶、批量删除、相对时间           |
| 记忆提取        | `src/main/libs/coworkMemoryExtractor.ts`                    | 规则引擎自动提取记忆             |
| 记忆判断        | `src/main/libs/coworkMemoryJudge.ts`                        | LLM 辅助判断是否值得记忆         |
| MCP 管理      | `src/main/libs/mcpServerManager.ts`                         | MCP 服务器生命周期管理          |
| 定时任务历史      | `src/renderer/components/scheduledTasks/AllRunsHistory.tsx` | 运行历史 UI                |
| Toast 通知    | `src/renderer/components/Toast.tsx`                         | 简洁 toast 样式参考          |

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

## 2026-03-24 Reference Gap Audit

### UI/UX Gap (LobsterAI + ClawPort)

- 【已实现】Slash 命令：session-10 已补 `/` 解析、候选下拉、Arrow/Tab/Enter 键盘交互、本地命令执行与导出链路。
- 【已实现】会话搜索 / 全局搜索：session-10 已补 Sidebar 搜索入口、`Ctrl/Cmd+K`，并支持 sessions / agents / pages / chat history 搜索。
- 【部分完成】会话置顶 / 导出：session-11 已补侧栏会话置顶、会话/分身右键导出；聊天详情里的更多导出入口仍未补齐。
- 【部分完成】QuickAction bar：session-12 已把空态快捷入口升级为更接近持久 QuickAction bar 的结构，但二级 prompt panel / 更深的技能映射仍未补齐。
- 【不完善】思维链展示：当前 `src/pages/Chat/ChatMessage.tsx` 仅静态折叠；参考 `reference/LobsterAI-main/src/renderer/components/cowork/CoworkSessionDetail.tsx` 的流式 reasoning 展示。
- 【不完善】AskUserQuestion / 工具确认 / 文件变更预览：当前 `src/pages/TaskKanban/AskUserQuestionWizard.tsx` 与 `src/pages/TaskKanban/index.tsx` 只覆盖简化审批流；参考 `CoworkQuestionWizard.tsx` 与 `CoworkPermissionModal.tsx`。
- 【不完善】Toast 与操作反馈：当前以分散 `sonner` 调用为主；参考 `reference/LobsterAI-main/src/renderer/components/Toast.tsx` 的统一视觉和反馈闭环。
- 【缺失】骨架屏：当前以 spinner / loading text 为主；参考 `reference/clawport-ui-main/components/ui/skeleton.tsx`。
- 【不完善】移动端聊天 / 过渡动画 / 空状态：当前仍以桌面双栏和基础 transition 为主；参考 `reference/clawport-ui-main/app/chat/page.tsx`、`components/MobileSidebar.tsx`、`app/globals.css`。

### Backend Capability Gap (openclaw-main + control-center)

- ⚠️ MCP 目前只有配置 CRUD：`electron/api/routes/mcp.ts`；缺少 runtime 生命周期与日志，参考 `reference/LobsterAI-main/src/main/libs/mcpServerManager.ts`。
- ❌ 缺少多 agent 协作 runtime：当前 `electron/utils/agent-config.ts` 主要做静态 agent/workspace/account 管理；参考 `reference/openclaw-main/src/agents/tools/sessions-spawn-tool.ts` 与 `subagents-tool.ts`。
- ⚠️ 技能系统偏安装 / 配置层：`electron/utils/skill-config.ts`、`electron/gateway/clawhub.ts`；缺少 runtime 工具注册，参考 `reference/openclaw-main/src/agents/pi-bundle-mcp-tools.ts`。
- ✅ Cron 基础 CRUD 已有，但 ⚠️ 历史筛选能力有限，且 ❌ 缺失败重试 / delivery alert / policy 闭环；当前 `electron/api/routes/cron.ts`，参考 `reference/openclaw-main/src/gateway/server-methods/cron.ts`。
- ✅ Memory 文件存储与抽取已有，但 ⚠️ 向量检索主要是代理 `openclaw memory status/reindex`，且 ❌ 缺知识库 / 多路径 / QMD 管理；当前 `electron/api/routes/memory.ts`、`memory-extract.ts`。
- ✅ Channel 配置、凭证校验、插件安装已有，但 ❌ 缺统一消息格式适配与 capability runtime；当前 `electron/api/routes/channels.ts`、`electron/utils/channel-config.ts`，参考 `reference/openclaw-main/src/channels/plugins/types.core.ts`。
- ⚠️ Host API session auth 已有，但 ❌ 缺多用户隔离与 rate limiting；当前 `electron/api/route-utils.ts`、`electron/api/server.ts`，参考 `reference/openclaw-main/src/gateway/auth.ts` 与 `auth-rate-limit.ts`。
- ✅ Electron 自动更新链路较完整：`electron/main/updater.ts`；但 ⚠️ 渐进发布和跨安装形态策略仍弱于 `reference/openclaw-main/src/infra/update-startup.ts`。

### Page Completeness Gap (ClawPort)

#### Kanban

- ClawPort 有 `assigneeRole`、ticket chat side panel、`useAgentWork` 驱动的自动执行与 retry；ClawX 的 `src/pages/TaskKanban/index.tsx` 仍以本地状态和静态详情为主。

#### Cron

- ClawPort 有面向运维的总览层、`PipelineWizard` / `PipelineGraph` 编辑闭环和 richer run details；ClawX 的 `src/pages/Cron/index.tsx` 仍偏基础看板。

#### Costs

- ClawPort 有按 cron/job 的成本聚合、`DailyCostChart`、`TokenDonut`、`RunDetailTable`、优化分析和实时 usage stream；ClawX 的 `src/pages/Costs/index.tsx` 主要还是 agent/model 维度的摘要。

#### Memory

- ClawPort 有正文搜索、编辑器增强、安全写入链路和 health analysis；ClawX 的 `src/pages/Memory/index.tsx` 仍以文件浏览 + 基础编辑为主。

#### Docs

- ClawPort 有独立 `/docs`、章节导航、检索和 deep link；ClawX 按用户反馈已暂时停用 Docs / Help，如后续恢复，需要重新补齐 standalone `/docs`、章节导航、页面内检索与 deep link。

#### Activity

- ClawPort 有结构化审计事件、分类过滤、详情展开和 live logs 入口；ClawX 已在 session-10/11 补齐结构化事件卡片、分类过滤、详情 raw 展开和 live 自动刷新入口。

#### Settings

- ClawPort 额外覆盖全局 logo/icon 上传、agent 图片 override、rerun setup / reset / clear data；ClawX 的设置中心还没有这些动作。

#### Agent 管理

- ClawPort 有 agent 独立详情页、metadata / hierarchy / cron 关联 / avatar upload；ClawX 当前仍以列表页 + modal 为主。

### Engineering & DX Gap

- 测试覆盖：3/5。当前约 `74` 个测试文件，单测面不小，但 `package.json` 的 `test:e2e` 允许空跑；相比 `reference/openclaw-main/package.json` 的 coverage / e2e / install smoke / live matrix 仍偏轻。
- 类型安全：4/5。`tsconfig.json` 与 `tsconfig.node.json` 都开了 `strict`，显式 `any` 数量不高；但还缺 `openclaw-main` 那类更强的边界检查与工程脚本化约束。
- 错误处理：3/5。`src/App.tsx` 和 `src/components/common/ErrorBoundary.tsx` 已有错误边界，但缺主进程级异常治理和对应测试，弱于 `reference/openclaw-main/src/infra/unhandled-rejections*.test.ts`。
- 国际化：2/5。`src/i18n/` 已有 `en/zh/ja` 三语资源，但页面和组件仍有大量硬编码文案，locale parity 也没有自动门禁。
- a11y：2/5。项目里已有不少 `aria-*`、`role`、键盘和焦点处理，但没有专门的 a11y lint / test gate。
- 构建与发布：3/5。当前 `.github/workflows/` 有 `check` / `comms-regression` / `release` / `package-win-manual`，但缺 CodeQL、install smoke、dead-code、release-check 等平台级门禁。
- 文档：2/5。README 三语已存在，也有 `docs/superpowers/`，但当前仓未见 `CONTRIBUTING.md` 或架构文档门禁；文档治理仍弱于 `openclaw-main` / `clawport-ui-main`。
- 代码组织：3/5。`src/pages`、`src/components`、`src/stores`、`electron` 分层清晰，但 cycle / boundary / dead-code 仍未脚本化。

### Cross-Project Priority Candidates

- P0：继续补会话详情里的更多导出入口，并继续打磨已落地的会话置顶 / Slash commands / 全局搜索 / 会话搜索。
- P0：补齐 MCP runtime 生命周期、per-server 日志与工具可见性。
- P0：继续深化 Activity 和 Cron 运行详情视图（Activity 结构化卡片已落地），补 delivery / error context。
- P0：补真实 Playwright E2E、CI 深度门禁、release / install smoke。
- P0：收口 i18n，把硬编码文案迁回 locale，并加 locale parity 检查。
- P1：设计 multi-agent runtime、subagent orchestration 和工具注册机制。
- P1：升级 Costs，为 job / cron 提供 drill-down、优化分析和 realtime usage stream。
- P1：升级 Memory，补全文搜索、安全写入、health analysis 和多路径知识源管理。
- P1：建立 Docs / Help 系统，并为 Agent 补独立详情页和 cron 关联视图。
- P2：统一 toast、skeleton、motion、empty state 和移动端聊天适配。
- P2：补全局品牌图标、agent 头像上传，以及 a11y 自动化防回归。
