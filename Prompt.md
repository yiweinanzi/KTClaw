# ClawX 持久化开发指令

工作目录：`C:\Users\22688\Desktop\ClawX-main`

---

## 角色分工

| 角色 | 工具 | 职责 |
|------|------|------|
| **Claude Code（你）** | 本体 | 架构设计、任务拆分、代码审查、质量把关 |
| **Codex MCP（GPT-5.3 high）** | `mcp__codex-mcp__codex` | 批量写代码、修改文件、运行命令 |

优先用 Codex 写业务代码，Claude 负责架构与审查。

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
- 主题 token：
  - `--bg: #ffffff`
  - `--bg2: #f2f2f7`
  - `--bg3: #e5e5ea`
  - `--tx: #000000`
  - `--tx2: #3c3c43`
  - `--tx3: #8e8e93`
  - `--bd: #c6c6c8`
  - `--ac: #007aff`
- Sidebar：展开 `260px` / 收起 `64px`
- 验证命令：
  - `pnpm run typecheck`
  - `pnpm exec tsc -p tsconfig.node.json --noEmit`
  - `pnpm run lint`
  - `pnpm run build:vite`
  - `pnpm test`
  - `pnpm run test:e2e`

---

## 当前焦点

`PLAN-2026-03-24-PLATFORM-CLOSURE`

目标：平台级 P0 中的 `MCP runtime closure`、`Release / install / E2E 深化`、`日文支持移除 / zh-en i18n 基线` 已完成；P1 已完成一部分 `Chat / Workbench` 与 `Kanban` 深化，当前继续推进波次 2 剩余 runtime/kanban 联动，以及后续 `Cron / Channels / Costs / Memory / Settings / a11y`。

---

## Latest Delta（2026-03-26）

- 已新增完成：
  - Wave 2：runtime subagent tree / Kanban retry lineage
  - Wave 3：`/api/costs/analysis` + Costs 分析卡片 + realtime auto-refresh
  - Wave 3：Channels `/test` / `/send` rate limiting guardrails
  - Wave 4：Memory 多 agent scope / search / hit highlights / stale-write / atomic write / copy / download / reindex-after-save
  - Wave 4：Settings `Re-run Setup` / `Reset All Settings` / `Clear Server Data`
  - Wave 4：Settings global `logo / icon upload`
  - Wave 4：standalone read-only `/agents/:agentId`
  - Session 25：i18n Memory (~45) + Costs (~50) 迁至 `t()` 调用；locale 新增 ~100 key
  - Session 25：`reportsTo/directReports` 持久化到 agent config + API + AgentDetail 前端
  - Session 25：测试 setup 初始化 i18n `changeLanguage('zh')` 保持兼容
  - Session 25：修复 Settings `EditableChipListProps` TS 编译错误
  - Session 26：Settings shell / memory / migration 子面板迁至 locale；TeamOverview / TeamMap 页面壳层迁至 locale
  - Session 26：avatar 持久化链打通到 agent snapshot / shared types / store / Settings / AgentDetail
  - Session 26：Kanban approval lineage session-key binding + active approval polling + child run detail list
  - Session 26：新增 AgentDetail / Settings / Memory route+page / TaskKanban / TeamOverview / TeamMap 回归测试
  - Session 27：Feishu integration foundation：host status/install/doctor routes + dedicated onboarding wizard entry
  - Session 27：Channels 多账号隔离增强：account-scoped delete/connect/disconnect + unknown scoped channel guard
  - Session 27：Channels 左侧家族列表改为 supported+configured 动态生成，Telegram/Discord/WhatsApp 等不再被四个硬编码 tab 限死
  - Session 27b：Feishu app-internal auth QR flow：Device Flow 复用官方插件内核，用户授权不再依赖输入 `/feishu auth`
  - Session 27b：existing robot 配置完成后自动回到向导并启动用户授权；new robot 提供官方创建页二维码入口
  - Session 28：Feishu onboarding wizard 收口为单一应用内状态机：create/link/configure/app-scope recheck/user auth 一体化，不再跳转单独 Feishu 配置弹窗
  - Session 28：Channels 页面与新 Feishu wizard 文案迁回 locale；`Channels` 这批新增/残留硬编码完成一轮收口
  - Session 28：Agent detail 新增 backend-owned `/api/agents/:agentId/cron-relations`，并可 deep link 到对应 Cron pipeline detail
  - Session 28c：`AskUserQuestionWizard` 外壳文案迁回 `common` locale，P0 i18n 收口进一步前推到 Cron / TaskKanban / Sidebar
  - Session 29：runtime records 保留 structured `history`，`/api/sessions/subagents/:id` 支持单 run drill-down，TaskKanban detail 可在 parent/latest/child runs 间切换并渲染 thinking/tool 结构化历史
  - Session 29：修复并稳定 Cron / Sidebar 这轮 locale 接线，保证当前改动在 typecheck / lint / build / targeted vitest 下全部通过
  - Session 30：Wave 5 update policy 补齐 channel 切换后的 `nextEligibleAt` / jitter 重算，并在 Settings auto-update section 暴露 update channel selector
  - Session 30：Wave 5 a11y / governance 收口到 Cron，`lint:a11y` / `test:a11y` 已覆盖 Activity + Cron + Settings + Workbench empty state，并在 README / README.zh-CN 记录新门禁命令
  - Session 30：Costs realtime tab 改为在 polling 之外额外消费 `gateway:notification` usage 事件，live usage entries / KPI / model distribution 可即时追加
  - Session 30：TaskKanban runtime detail 新增 `executionRecords` 与 runtime `skillSnapshot` / `toolSnapshot` 展示，补齐 tool execution path / skill bridge 的前端可见层
  - Session 31：Channels `/send` / `/test` 在多账号同类型场景下不再接受歧义 bare channelType，请求必须解析到唯一 scoped `channelId`
  - Session 31：runtime `executionRecords` 现在可链接到 spawned child runtime，TaskKanban detail 支持从 execution card 直接 drill-down 到关联 child run，并补充 lineage 导航
  - Session 32：Channels `config` / `config/:type` / `whatsapp/start` 已补 scoped account guard，未知 `accountId` 不再静默创建/读取/删除孤儿配置
  - Session 32：Memory `/api/memory` 已接入 `memory.qmd.paths`，QMD collection files 作为只读 `qmd/<collection>/...` sources 暴露到 Memory browser
  - Session 33：Costs dashboard 新增 `/api/costs/by-model` 消费与 `Model Costs` 明细表，“更完整图表与明细层”进一步收口
  - Session 33：locale parity 目前已恢复到全量测试通过；`pnpm test` 再次全绿
  - Session 34：新增 Feishu conversation binding store，`/api/channels/workbench/messages` 改为对已绑定/已发现会话优先读取 runtime `chat.history`，并为未知 synthetic Feishu 会话返回 neutral payload，避免 sidebar 与 Channels transcript 分叉
  - Session 34：Channels `/send` 在 Feishu 会话场景下优先进入绑定 runtime `chat.send`；Channels 页面移除本地伪 agent reply，改为以服务端 transcript 为准，并在 `gateway:notification` 到来时即时刷新当前会话
  - Session 35：Feishu workbench read/send 对齐真实 per-chat runtime session key；发送后补充多段 history refresh 轮询，发送失败时恢复输入框草稿
  - Session 36：收口当前重点 i18n 剩余项，Sidebar / TaskKanban / Cron 的历史硬编码用户文案迁回 locale，并补齐对应回归验证
  - Session 37：Kanban detail 现在支持从当前选中的 child run 发起 retry；runtime backend 新增 rooted tree 读取能力（`SessionRuntimeManager.getTree()` + `/api/sessions/subagents/:id/tree`），为后续 subagent tree orchestration 可见层打基础
- 因此下面旧清单里，涉及上述能力的"剩余"描述请以本段为准，不要重复实现已完成部分。
- 当前真正还缺的重点：
  - `Kanban` 剩余仍是更完整的 runtime tree / latest-vs-selected run / subtree 状态与操作闭环
  - `Multi-agent runtime / tool registry` 剩余仍是更完整的 subagent tree orchestration、registry 级交互与 skills->runtime bridge
  - `通用 UX 收尾` 剩余仍是 empty-state illustration 与 mobile chat adaptation
  - `Docs / Help` 继续保持停用，除非用户再次明确要求恢复


---

## 当前剩余需求

### P0

#### 1. i18n 收口

- 已补 locale parity / 覆盖检查：`scripts/i18n/check-parity.mjs`、`tests/unit/i18n-parity.test.ts`、`pnpm run i18n:check`
- 已将本批 `MCP` / `Settings` 新增文案迁回 locale
- 已移除全部日文支持：`README.ja-JP.md`、`src/i18n/locales/ja/*`、语言入口均已下线
- 已完成：当前重点 `Cron / TaskKanban / Sidebar` 历史硬编码文案迁回 locale
- 说明：MCP 页面现已按用户补充定义收口为“KTClaw 本身可以调用的 MCP 服务管理页”，启停语义与 Skills 靠近，同时保留 runtime / tool discovery / logs

### P1

#### 4. Chat / Workbench 深化

- 已完成：流式 reasoning 自动展开 / 收起
- 已完成：reasoning 生成中状态提示
- 已完成：对话左上角 `{分身名} 正在思考中`
- 已完成：QuickAction 二级 `PromptPanel`
- 已完成：QuickAction 技能映射标签
- 已完成：QuickAction 回填输入框
- 已完成：AskUserQuestion 支持结构化 `toolInput.questions`
- 已完成：AskUserQuestion 支持回填已有答案
- 已完成：AskUserQuestion 展示请求上下文
- 已完成：工具调用确认 UI：专门 review dialog、完整 tool input、危险操作告警
- 已完成：文件变更预览：按 turn/tool group 展开 `edit` / `write` / `multiedit` 的输入与结果

#### 5. Kanban 深化

- 已完成：`assigneeRole`
- 已完成：更完整的 ticket detail panel
- 已完成：最小 runtime 联动：`Start work / Send follow-up / Stop runtime / Retry work`
- 已完成：最小 ticket chat history（基于 runtime transcript）
- 已完成：进行中任务禁止手动拖拽
- 已完成：active runtime ticket 轮询 `/wait`
- 已完成：`running / blocked / waiting_approval / completed / error/killed/stopped` → ticket `workState` / column 状态联动
- 已完成：`completed` 自动进入 review-ready 状态并展示 `workResult`
- 已完成：runtime session records 跨主进程重启持久化与恢复
- 已完成：detail panel 按 runtime `sessionKey` 绑定当前 ticket 的 approvals，可直接 `Review / Respond`
- 已完成：approval lineage session-key binding（当前 run + parent lineage）
- 已完成：active runtime approval polling
- 已完成：detail panel child run list（不再只显示 child count）
- 剩余：
  - 更深的 agent work / retry / 状态联动（runtime tree drill-down 继续深化、更多 lineage / subtree 交互）

#### 6. Cron 深化

- 已完成：状态筛选
- 已完成：delivery 配置概览
- 已完成：配置错误 / 执行错误 banner
- 已完成：最近更新时间
- 已完成：`PipelineWizard`
- 已完成：`PipelineGraph`
- 已完成：`failureAlertAfter`
- 已完成：`failureAlertCooldownSeconds`
- 已完成：`failureAlertChannel`
- 已完成：`deliveryBestEffort`

#### 7. Costs 深化

- 已完成：按 `job / cron` 提供第一批 read-only drill-down
- 已完成：`TopCrons`
- 已完成：job cost table
- 已完成：更完整图表与明细层（analysis cards + Top Crons + Cron Job Costs + Model Costs）
- 已完成优化分析：
  - 已完成：optimization score
  - 已完成：anomaly detection
  - 已完成：week-over-week
  - 已完成：cache savings
  - 已完成：insights
- 已完成 realtime usage stream（gateway notification 驱动的即时追加，保留 polling 兜底）

#### 8. Memory 深化

- 已完成：按照不同的分身agent，可以看到它们不同的memory，以及它们的其他文件：AGENTS.md、HEARTBEAT.md、IDENTITY.md、SOUL.md、TOOLS.md、USER.md。并且可编辑
- 已完成：full-text search
- 已完成：命中数与高亮
- 已完成：editor helpers
  - 已完成：copy / download
  - 已完成：unsaved changes 提示
  - 已完成：reindex after save
- 已完成：safer write pipeline
  - 已完成：路径白名单
  - 已完成：mtime 冲突检测
  - 已完成：内容规范化
  - 已完成：git snapshot
  - 已完成：原子写入
- 已完成：health analysis
  - 已完成：health score
  - 已完成：stale daily logs
  - 已完成：AI-powered analysis
- 已完成：多路径知识源 / `extraPaths` / QMD collection

#### 9. Multi-agent runtime / tool registry

- 已完成：`sessions_spawn`
- 已完成：subagent `list/kill/steer/wait`
- 已完成：thread / session mode、attachments / sandbox / timeout 字段骨架
- 已完成：Gateway-backed runtime adapter：`chat.send` / `chat.abort` / `sessions.list` / `chat.history`
- 已完成：runtime record 持有真实 `sessionKey` / `runId` / `status` / `lastError` / transcript
- 已完成：spawn-time capability snapshot：connected MCP tools + enabled skills
- 已完成：runtime records durable persistence / restart restore
- 剩余：
  - 更完整的 subagent tree orchestration
  - runtime 工具执行路径 / capability snapshot 已可在 TaskKanban detail 查看，后续仍可继续深化 registry 级交互
  - skills 到 runtime 的更深层执行桥接

#### 10. Channels / backend runtime 能力

- IM 消息格式适配与 capability runtime
- 已完成：`/api/channels/capabilities`
- 已完成：normalized `status / availableActions / capabilityFlags / configSchemaSummary`
- 已完成：Channels 详情页展示 runtime capabilities 摘要
- 已完成：account-scoped delete/connect/disconnect 基础链路
- 已完成：unknown scoped channel send/test guard
- 已完成：supported+configured 动态频道家族列表
- 已完成：Feishu integration foundation：`/api/feishu/status|install|update|doctor` + dedicated onboarding wizard entry
- 已完成：Feishu existing-robot app-internal auth QR flow（Device Flow + token persistence）
- 已完成：Feishu onboarding 单一向导闭环（官方创建页二维码入口、应用内凭证保存、app-scope recheck、用户授权二维码）
- 已完成：本地 API auth gate 深化
- 已完成：多用户隔离与 rate limiting
- 已完成：Feishu Channels workbench conversation/session binding，消息读取与发送统一接到 runtime session，桌面发言与飞书来信不再走两套 transcript

#### 11. Agent detail page

- 已完成：独立 agent 详情页
- 已完成：metadata / hierarchy
- 已完成：`reportsTo / directReports`
- 已完成：cron 关联视图（backend-owned relation endpoint + Cron pipeline deep link 第一批已完成）
- 已完成：avatar upload / remove

#### 12. Settings 深化

- 已完成：全局 logo / icon 上传
- 已完成：agent 图片 override
- 已完成：`Re-run Setup`
- 已完成：`Reset All Settings`
- 已完成：`Clear Server Data`


### P2

#### 14. 应用自动更新链路一致性

- 已完成：决定是否补 Host API update route
- 已完成：继续保证 update 链路一致
- 已完成：渐进发布 / 多 channel 策略补齐
  - 已完成：rollout delay / jitter
  - 已完成：beta check interval
  - 已完成：attempt state persistence

#### 15. 通用 UX 收尾

- 已完成：unified toast
- 已完成：持久可关闭反馈
- 已完成：skeleton
- 已完成：motion token
- empty-state illustration
- mobile chat adaptation

#### 16. a11y / 工程治理

- 已完成：a11y 自动化防回归
- 已完成：a11y lint / test gate
- 已完成：docs governance
- 已完成：boundary / dead-code / cycle 脚本化检查

---

## 明确不要回退

- 不要重新加回聊天页顶部 `Export` 按钮
- `Docs / Help` 继续保持停用，除非用户再次明确要求恢复

---

## 当前参考优先级

1. `Wave 2 剩余：multi-agent runtime / Kanban 更深联动`
2. `Wave 3：Channels / Costs / Cron pipeline`
3. `Wave 4：Memory / Agent detail / Settings`
4. `Wave 5：Update / UX / a11y / 工程治理`
