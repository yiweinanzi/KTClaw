# OpenClaw 多团队 Agent 编排方案

> 基于 OpenClaw 开源 AI Agent 平台的 Team Leader → Sub-Agent 协作架构

---

## 1. 项目概述

[OpenClaw](https://github.com/openclaw/openclaw) 是由 Peter Steinberger 创建的开源自托管 AI Agent 平台（前身为 Clawdbot / Moltbot），支持通过 WhatsApp、Telegram、Slack、Discord、飞书、微信等 20+ 消息平台与 AI Agent 交互。其核心架构为 **单 Gateway 进程 + 多 Agent 隔离**，每个 Agent 拥有独立的 Workspace、Session、Auth Profile 和 Skills。

本文档描述我们在 OpenClaw 之上构建的 **Team Leader + Sub-Agent 协作模式**：用户通过群聊/私聊与 Team Leader 交互，Team Leader 利用 `sessions_spawn` 工具调度下属 Sub-Agent 并行执行任务，实现类似"管理 AI 团队"的工作流。

### 核心设计原则

- **单 Gateway 多 Agent**：运行一个 Gateway 进程，内部承载多个隔离的 Agent "大脑"
- **Team Leader 统一调度**：用户通过群聊/私聊与 Team Leader 沟通，Leader 通过 `sessions_spawn` 分派任务
- **Sub-Agent 不可私聊**：用户可在 Workspace 中微操 Sub-Agent（调整配置、Skills），但不能直接与 Sub-Agent 对话
- **多群聊并行会议**：用户可在不同 Channel/群组中与不同 Team Leader "开会"

---

## 2. OpenClaw 原生架构映射

### 2.1 官方架构概览

OpenClaw 的官方架构如下：

```
消息平台 (WhatsApp / Telegram / Slack / Discord / 飞书 / 微信 / WebChat ...)
                          │
                          ▼
              ┌───────────────────────┐
              │       Gateway         │
              │   (单进程控制平面)       │
              │  ws://127.0.0.1:18789 │
              └───────────┬───────────┘
                          │
            ┌─────────────┼─────────────┐
            ▼             ▼             ▼
      ┌──────────┐ ┌──────────┐ ┌──────────┐
      │ Agent A  │ │ Agent B  │ │ Agent C  │
      │ (隔离大脑) │ │ (隔离大脑) │ │ (隔离大脑) │
      └──────────┘ └──────────┘ └──────────┘
```

### 2.2 关键概念与我们方案的映射

| OpenClaw 原生概念 | 我们的方案 | 说明 |
|---|---|---|
| **Gateway** | Gateway（唯一） | 单进程控制平面，管理所有 Session、Channel、Tools 和事件 |
| **Agent**（`agents.list`） | Team Leader / Sub-Agent | 每个 Agent 是一个完全隔离的"大脑"，拥有独立 Workspace |
| **Workspace**（`~/.openclaw/workspace-<id>`） | 每个 Agent 的工作目录 | 包含 `AGENTS.md`、`SOUL.md`、`USER.md`、`TOOLS.md`、`MEMORY.md` 等 |
| **Binding** | 消息路由规则 | 将特定 Channel/Account/Peer 路由到指定 Agent |
| **Session** | 对话会话 | `main` 为私聊会话，`group:<id>` 为群聊会话 |
| **Sub-Agent**（`sessions_spawn`） | 后台工作 Agent | 由 Team Leader 通过 `sessions_spawn` 动态创建的后台任务 |
| **Skills**（`<workspace>/skills/`） | Agent 能力模块 | 每个 Agent 独立配置的技能集 |

---

## 3. 系统架构

```
用户
 │
 ├── 群聊频道 A ───→ Team Leader "Main"
 ├── 群聊频道 B ───→ Team Leader "研发团队"
 └── 私聊 ─────────→ Team Leader（进度查询）
         │
┌────────▼──────────────────────────────────────────┐
│                  Gateway (单实例)                    │
│        路由 · 鉴权 · Session 管理 · 事件分发          │
│              ws://127.0.0.1:18789                  │
└────────┬──────────────┬──────────────┬─────────────┘
         │              │              │
   ┌─────▼─────┐  ┌─────▼─────┐  ┌─────▼─────┐
   │ Team A    │  │ Team B    │  │ Team C    │
   │ Leader    │  │ Leader    │  │ Leader    │
   │ (Agent)   │  │ (Agent)   │  │ (Agent)   │
   └─┬───┬───┬─┘  └─┬───┬───┬─┘  └─┬───┬───┬─┘
     │   │   │      │   │   │      │   │   │
     ▼   ▼   ▼      ▼   ▼   ▼      ▼   ▼   ▼
    SA  SA  SA     SA  SA  SA     SA  SA  SA
   (sessions_spawn 动态创建的后台 Sub-Agent)
```

---

## 4. Workspace 文件结构

每个 Agent（无论 Team Leader 还是 Sub-Agent）都遵循 OpenClaw 标准的 Workspace 文件结构：

```
~/.openclaw/workspace-<agentId>/
├── AGENTS.md          # 操作指令：行为规则、工作流、优先级
├── SOUL.md            # 人格定义：语气、价值观、行为边界
├── USER.md            # 用户信息：身份、偏好、上下文
├── IDENTITY.md        # Agent 名称、表情符号、身份标识
├── TOOLS.md           # 工具使用说明和本地约定
├── HEARTBEAT.md       # 心跳任务检查清单（可选）
├── MEMORY.md          # 长期记忆：持久化的事实和决策
├── memory/
│   └── YYYY-MM-DD.md  # 每日工作日志
└── skills/
    └── <skill>/
        └── SKILL.md   # 技能定义和使用说明
```

### 关键文件职责

**AGENTS.md** — Agent 的"标准操作手册"（SOP），定义每次会话启动时读取的文件顺序、工作流程和行为规则。

**SOUL.md** — Agent 的"性格"，定义语气、价值观和不可逾越的边界。Team Leader 的 SOUL.md 应包含团队管理和任务拆解能力的描述。

**MEMORY.md + memory/** — Agent 的记忆系统。每次会话结束后 Agent 会将关键信息写入日志，长期重要信息提炼进 MEMORY.md。

> **注意**：Sub-Agent 通过 `sessions_spawn` 创建时，仅注入 `AGENTS.md` + `TOOLS.md`，不会加载 `SOUL.md`、`IDENTITY.md`、`USER.md` 等文件。因此对 Sub-Agent 的关键指令应写在 `AGENTS.md` 和 `TOOLS.md` 中。

---

## 5. 配置示例

### 5.1 openclaw.json — Agent 定义与路由

```jsonc
{
  "agents": {
    "defaults": {
      "model": "deepseek-chat",
      "subagents": {
        "model": "deepseek-chat",       // Sub-Agent 默认使用更经济的模型
        "runTimeoutSeconds": 300         // Sub-Agent 超时 5 分钟
      }
    },
    "list": [
      {
        "id": "main",
        "name": "Main",
        "workspace": "~/.openclaw/workspace-main",
        "model": "deepseek-chat"
      },
      {
        "id": "analyst",
        "name": "分析助手",
        "workspace": "~/.openclaw/workspace-analyst",
        "model": "deepseek-chat"
      },
      {
        "id": "coder",
        "name": "代码交付助手",
        "workspace": "~/.openclaw/workspace-coder",
        "model": "deepseek-chat"
      }
    ]
  },

  "bindings": [
    {
      "agentId": "main",
      "match": { "channel": "feishu" }
    },
    {
      "agentId": "main",
      "match": { "channel": "wechat" }
    }
  ],

  "tools": {
    "agentToAgent": {
      "enabled": true,
      "allow": ["main", "analyst", "coder"]
    }
  }
}
```

### 5.2 Team Leader 的 AGENTS.md 示例

```markdown
# Team Leader — Main Agent

## 每次会话启动
1. 读取 `SOUL.md` — 你的身份
2. 读取 `USER.md` — 你服务的用户
3. 读取 `memory/YYYY-MM-DD.md`（今天 + 昨天）获取近期上下文
4. 读取 `MEMORY.md` 获取长期记忆

## 核心职责
你是团队的 Team Leader，负责：
- 理解用户需求并拆解为可执行的子任务
- 通过 `sessions_spawn` 将任务分派给 Sub-Agent
- 跟踪每个 Sub-Agent 的执行状态
- 在用户私聊时汇报团队整体进度和成员状态

## 任务分派规则
- 数据分析类任务 → 分派给 `analyst`
- 代码开发类任务 → 分派给 `coder`
- 可以同时启动多个 Sub-Agent 并行工作

## 进度汇报格式
当用户询问进度时，按以下格式回复：
- 团队整体完成度
- 每个活跃 Sub-Agent 的状态（执行中/完成/失败）
- 阻塞项和风险点
- 下一步计划
```

### 5.3 Sub-Agent 的 AGENTS.md 示例（分析助手）

```markdown
# 分析助手 (analyst)

## 职责
你是一个专注于数据分析的 Sub-Agent。接收任务后：
1. 明确分析目标和数据范围
2. 使用可用工具获取和处理数据
3. 产出清晰的分析结论
4. 完成后将结果汇报给调用者

## 输出规范
- 结论先行，数据支撑
- 包含关键指标和趋势
- 如有异常数据，主动标注

## 注意
- 不要尝试编写生产代码，代码类任务应由 coder 负责
- 如果发现任务超出你的能力范围，明确说明并建议转交
```

---

## 6. 交互模式

### 6.1 群聊（多人会议模式）

利用 OpenClaw 的 **Channel Binding** 和 **Group Chat** 机制，将不同群组路由到不同的 Team Leader：

```jsonc
"bindings": [
  // 飞书研发群 → Main Team Leader
  {
    "agentId": "main",
    "match": {
      "channel": "feishu",
      "peer": { "kind": "group", "id": "oc_research_group_id" }
    }
  }
]
```

- 群聊中通过 `@mention` 触发 Team Leader 响应（需配置 `mentionPatterns`）
- Team Leader 接收指令后自动通过 `sessions_spawn` 拆解任务给 Sub-Agent
- Sub-Agent 完成后通过 **announce** 机制将结果回传到群聊

### 6.2 私聊（进度查询）

用户在 DM 中直接与 Team Leader 对话，Session 类型为 `agent:<agentId>:main`。

```
用户：目前团队进度怎么样？

Team Leader (Main)：
  📊 团队整体进度：72%

  🔍 分析助手 (analyst)
     状态：执行中
     当前任务：用户行为数据分析
     预计完成：约 2 小时

  🤖 代码交付助手 (coder)
     状态：等待中（依赖分析结果）
     队列任务：API 接口开发 × 3
     预计启动：分析完成后自动触发

  ⚠️ 风险项：无
```

Team Leader 通过以下工具获取 Sub-Agent 状态：
- `/subagents list` — 列出当前所有 Sub-Agent 运行状态
- `/subagents info <id>` — 查看指定 Sub-Agent 的详细元数据
- `/subagents log <id>` — 查看 Sub-Agent 的执行日志
- `sessions_history` — 获取 Sub-Agent 的会话历史

### 6.3 Workspace 微操

用户可通过 Gateway Dashboard（`http://localhost:18789`）或直接编辑 Workspace 文件：

| 操作 | 方式 |
|------|------|
| 调整 Sub-Agent 的行为 | 编辑 `~/.openclaw/workspace-<id>/AGENTS.md` |
| 修改 Sub-Agent 的人格 | 编辑 `~/.openclaw/workspace-<id>/SOUL.md` |
| 管理 Skills | 添加/删除 `<workspace>/skills/<skill>/SKILL.md` |
| 更换模型 | 修改 `openclaw.json` 中对应 Agent 的 `model` 字段 |
| 移除 Agent | 从 `agents.list` 中删除并执行 `openclaw gateway restart` |
| 查看 Agent 状态 | `openclaw agents list --bindings` |

> ⚠️ 微操限制：用户可以修改 Sub-Agent 的配置和 Skills，但**不能直接与 Sub-Agent 私聊**。所有任务指令必须通过 Team Leader 的 `sessions_spawn` 下发。

---

## 7. Sub-Agent 调度机制

### 7.1 sessions_spawn 工作流

```
Team Leader 收到用户任务
        │
        ▼
 拆解为多个子任务
        │
        ├──→ sessions_spawn(agentId="analyst", task="分析用户留存数据")
        │     └─→ 返回 { status: "accepted", runId, childSessionKey }
        │
        └──→ sessions_spawn(agentId="coder", task="实现数据导出 API")
              └─→ 返回 { status: "accepted", runId, childSessionKey }

        ... Sub-Agent 在后台并行执行 ...

Sub-Agent 完成 → announce 结果到 Team Leader 的会话
        │
        ▼
Team Leader 聚合结果 → 回复用户
```

### 7.2 关键约束

| 约束 | 说明 |
|------|------|
| 非阻塞 | `sessions_spawn` 立即返回，不阻塞 Team Leader |
| 隔离 Session | Sub-Agent 运行在独立 Session `agent:<agentId>:subagent:<uuid>` |
| 上下文限制 | Sub-Agent 仅注入 `AGENTS.md` + `TOOLS.md`，不加载 `SOUL.md` |
| 嵌套深度 | 最大 5 层（`maxSpawnDepth`），建议不超过 2 层 |
| 成本控制 | 可为 Sub-Agent 配置更经济的模型（`agents.defaults.subagents.model`） |

---

## 8. 权限矩阵

| 操作 | 用户 → Team Leader | 用户 → Sub-Agent | Team Leader → Sub-Agent |
|------|:---:|:---:|:---:|
| 私聊对话 | ✅ | ❌ | ✅（`sessions_spawn`） |
| 群聊 @ 触发 | ✅ | ❌ | — |
| 查看 Workspace 配置 | ✅ | ✅ | ✅ |
| 编辑 AGENTS.md / SOUL.md | ✅ | ✅ | — |
| 管理 Skills | ✅ | ✅ | — |
| 分配任务 | ✅（对话下发） | ❌（必须经由 Leader） | ✅（`sessions_spawn`） |
| 查看进度 | ✅（私聊 / `/subagents list`） | ✅（Dashboard） | ✅ |
| 解雇（移除 Agent） | ✅（编辑 config） | — | — |

---

## 9. 参考社区方案

### openclaw-agents（shenhao-stu）

[github.com/shenhao-stu/openclaw-agents](https://github.com/shenhao-stu/openclaw-agents) 提供了一键部署 9 个专业化 Agent 的配置套件，包含 planner、ideator、critic、surveyor、coder、writer、reviewer、scout 等角色，支持群组路由和安全配置合并。可作为 Team 组建的参考模板。

### Lobster 工作流引擎

OpenClaw 内置的确定性工作流引擎，适合需要固定流水线（代码 → 评审 → 测试）的场景。与 `sessions_spawn` 的 LLM 驱动编排互补。

---

## 10. 路线图

### Phase 1 — MVP ✅

- [x] 单 Gateway 部署
- [x] Team Leader（Main Agent）+ 多个 Sub-Agent 配置
- [x] 飞书/微信群聊 Binding
- [x] `sessions_spawn` 任务分派
- [ ] Team Leader 进度汇报 AGENTS.md 模板优化

### Phase 2 — 多团队扩展

- [ ] 多个 Team Leader 分管不同业务线
- [ ] 跨 Team 协作（Team Leader 之间通过 `sessions_send` 通信）
- [ ] Sub-Agent 自动扩缩（基于任务队列动态 spawn）
- [ ] Skills Marketplace 接入（ClawHub）

### Phase 3 — 生产化

- [ ] Docker 沙箱隔离（`sandbox.mode: "non-main"`）
- [ ] 成本监控与 Token 用量追踪
- [ ] 团队绩效分析（基于 Sub-Agent announce 数据）
- [ ] 外部 API / MCP 集成

---

## 11. 术语表

| 术语 | 定义 |
|------|------|
| **Gateway** | OpenClaw 的单进程控制平面，管理所有 Session、Channel、工具和事件 |
| **Agent** | 一个完全隔离的 AI "大脑"，拥有独立的 Workspace、Session 和 Auth Profile |
| **Team Leader** | 面向用户的 Agent，负责任务拆解和 Sub-Agent 调度 |
| **Sub-Agent** | 通过 `sessions_spawn` 动态创建的后台执行 Agent |
| **Workspace** | Agent 的工作目录，包含 `AGENTS.md`、`SOUL.md` 等配置文件 |
| **Binding** | 消息路由规则，将 Channel/Account/Peer 映射到特定 Agent |
| **Session** | 对话会话，`main` 为私聊，`group:<id>` 为群聊 |
| **sessions_spawn** | OpenClaw 内置工具，用于非阻塞地创建后台 Sub-Agent 运行 |
| **announce** | Sub-Agent 完成后将结果发布回请求者频道的机制 |
| **Skills** | 挂载在 Agent Workspace 下的能力模块（`<workspace>/skills/`） |
| **AGENTS.md** | Agent 的标准操作手册（SOP），每次会话加载 |
| **SOUL.md** | Agent 的人格定义文件，每次会话加载 |
| **ClawHub** | OpenClaw 的技能注册中心，Agent 可自动搜索和安装 Skills |
| **Pi** | OpenClaw 内置的 Agent 运行时，支持 RPC 模式的工具流和块流 |

---

## 12. 参考链接

- OpenClaw GitHub：https://github.com/openclaw/openclaw
- 官方文档：https://docs.openclaw.ai
- Multi-Agent Routing：https://docs.openclaw.ai/concepts/multi-agent
- Sub-Agents：https://docs.openclaw.ai/tools/subagents
- Workspace 说明：https://docs.openclaw.ai/concepts/agent-workspace
- openclaw-agents 社区方案：https://github.com/shenhao-stu/openclaw-agents

---

*基于 OpenClaw 构建 — 让 AI 团队像人类团队一样协作 🦞*
