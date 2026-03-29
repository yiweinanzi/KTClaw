# Roadmap: KTClaw Team Control Plane Evolution

## Overview

This roadmap takes KTClaw's existing Team Control Plane MVP and turns it into a more operational team experience. The sequence is deliberate: first make backend-only worker access rules real, then clarify who owns user-facing entry points, then translate runtime execution data into clearer team work visibility without introducing a new orchestration model.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions if this stream needs them later

- [x] **Phase 1: Enforce Leader-only Access** - Turn `leader_only` from display metadata into real behavior across team and chat entry paths
- [x] **Phase 2: Clarify Team Entry Ownership** - Show who owns user-facing entry points and preserve the boundary between members, channels, and work
- [x] **Phase 3: Expose Team Work Visibility** - Translate existing runtime and kanban signals into clearer team-level work status and drill-down paths
- [x] **Phase 4: Productize Leader Progress Briefing** - Turn the leader into a first-class progress-reporting surface across private chat and team views
- [x] **Phase 5: Refine leader control plane UI to match product intent** - Turn the current team pages into a denser, leader-facing command center aligned to the product document

## Phase Details

### Phase 1: Enforce Leader-only Access
**Goal**: Make `leader_only` workers behave like backend-facing team members instead of ordinary direct-chat peers.
**Depends on**: Nothing (first phase)
**Requirements**: [TEAM-ACCESS-01, TEAM-ACCESS-02, TEAM-ACCESS-03, TEAM-LEAD-02]
**UI hint**: yes
**Canonical refs**:
- `team-项目文档.md` - original leader/sub-agent product intent
- `docs/superpowers/specs/2026-03-27-team-control-plane-mvp-design.md` - MVP scope and architecture decisions
- `docs/superpowers/plans/2026-03-27-team-control-plane-mvp.md` - prior implementation boundaries
- `Prompt.md` - continuity summary of completed team MVP work
**Success Criteria** (what must be TRUE):
  1. User cannot directly enter a blocked `leader_only` worker conversation from supported team-facing UI paths
  2. When a direct worker chat is blocked, the UI explains the rule and shows the correct leader-facing alternative instead of failing silently
  3. Host-side behavior no longer treats `leader_only` as a label only; invalid direct-entry attempts are guarded consistently
  4. Team and agent detail surfaces explain access/reporting consequences in plain language
**Plans**: 3 plans

Plans:
- [ ] 01-01: Audit and harden `leader_only` entry points across renderer flows
- [ ] 01-02: Add host/store enforcement for blocked direct-worker chat paths
- [ ] 01-03: Refine messaging, tests, and edge-case coverage for restricted access

### Phase 2: Clarify Team Entry Ownership
**Goal**: Make it obvious which leader owns each user-facing team entry point while preserving the separation between members, channels, and runtime work.
**Depends on**: Phase 1
**Requirements**: [TEAM-ENTRY-01, TEAM-ENTRY-02, TEAM-ENTRY-03, TEAM-LEAD-01]
**UI hint**: yes
**Canonical refs**:
- `team-项目文档.md` - leader-owned channel and meeting-entry semantics
- `docs/superpowers/specs/2026-03-27-team-control-plane-mvp-design.md` - team vs runtime object boundaries
- `Prompt.md` - MVP completion state and deferred next-step candidates
**Success Criteria** (what must be TRUE):
  1. User can identify the leader that owns a user-facing channel or team entry point from team surfaces without reading raw config
  2. Missing or ambiguous ownership states are surfaced clearly enough for the user to fix them
  3. Team UI still distinguishes persistent members, channel ownership, and temporary work instead of blending them into one graph
  4. Leader-vs-worker coordination roles are obvious at a glance in team-facing pages
**Plans**: 3 plans

Plans:
- [ ] 02-01: Derive and surface ownership signals from existing channel/binding data
- [ ] 02-02: Integrate ownership semantics into Team Overview, Team Map, and relevant detail surfaces
- [ ] 02-03: Add edge-state warnings, copy, and regression coverage

### Phase 3: Expose Team Work Visibility
**Goal**: Translate existing runtime, child-runtime, and kanban data into higher-level team work visibility without inventing a new runtime backend.
**Depends on**: Phase 2
**Requirements**: [TEAM-RUNTIME-01, TEAM-RUNTIME-02, TEAM-RUNTIME-03]
**UI hint**: yes
**Canonical refs**:
- `team-项目文档.md` - progress reporting and leader/sub-agent coordination expectations
- `docs/superpowers/specs/2026-03-27-team-control-plane-mvp-design.md` - runtime visibility decisions
- `Prompt.md` - recent runtime/kanban groundwork already completed in the repo
**Success Criteria** (what must be TRUE):
  1. Team Overview expresses member state in team language using existing runtime and kanban signals
  2. Team pages show recent work or workload cues without duplicating the entire kanban/runtime UI
  3. Team Map visually separates long-lived members from temporary execution work and routes users toward the correct detailed page for deeper inspection
**Plans**: 3 plans

Plans:
- [ ] 03-01: Define derived member work-state logic from current runtime and kanban data
- [ ] 03-02: Upgrade Team Overview and Team Map with clearer work visibility and drill-down affordances
- [ ] 03-03: Validate runtime-to-team language, docs, and regression coverage

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8 -> 9

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Enforce Leader-only Access | 3/3 | Complete | 2026-03-27 |
| 2. Clarify Team Entry Ownership | 3/3 | Complete | 2026-03-27 |
| 3. Expose Team Work Visibility | 3/3 | Complete | 2026-03-27 |
| 4. Productize Leader Progress Briefing | 4/4 | Complete | 2026-03-27 |
| 5. Refine leader control plane UI to match product intent | 3/3 | Complete | 2026-03-28 |
| 6. Polish team pages to SaaS command-center visual standard | 3/3 | Complete | 2026-03-28 |
| 7. Wire team runtime signals to frontend | 3/3 | Complete   | 2026-03-29 |
| 8. Team Grouping, Broadcast Chat, and Workspace Edit | 3/3 | Complete | 2026-03-29 |
| 9. Channel Feishu Sync Workbench | 0/? | Not started | — |

### Phase 7: Wire team runtime signals to frontend

**Goal:** Connect the existing `sessionRuntimeManager` and session runtime APIs to the team-facing UI so TeamOverview, TeamMap, and OperationsRail show real live Sub-Agent execution data instead of hardcoded mocks. Add workspace file read endpoint so the Workspace tab loads actual AGENTS.md/SOUL.md content.
**Depends on:** Phase 6
**Requirements**: [TEAM-RUNTIME-01, TEAM-RUNTIME-02, TEAM-RUNTIME-03]
**UI hint**: yes
**Canonical refs**:
- `team-项目文档.md` - Section 6.2 (progress reporting), Section 6.3 (workspace micro-operations), Section 7.1 (sessions_spawn workflow)
- `.planning/phases/07-wire-team-runtime-signals-to-frontend/07-CONTEXT.md` - locked implementation decisions
- `electron/services/session-runtime-manager.ts` - existing runtime data source
- `electron/api/routes/sessions.ts` - existing session routes
**Success Criteria** (what must be TRUE):
  1. TeamOverview and TeamMap member status dots reflect real Sub-Agent `RuntimeSessionStatus` (running/blocked/waiting_approval) updated within 3 seconds of state change
  2. TeamMap Workspace tab loads real AGENTS.md and SOUL.md file content from the agent's workspace directory (read-only)
  3. TeamMap Live Log tab shows the actual message history from the agent's most recent runtime session
  4. When an agent has an active running session, the OperationsRail shows a Kill button that terminates it via the existing `/api/sessions/subagents/:id/kill` route
**Plans:** 3/3 plans complete

Plans:
- [x] 07-01: Add workspace file read endpoint and verify session runtime response shape
- [x] 07-02: Add useTeamRuntime polling hook and update team-work-visibility and team-progress-brief
- [x] 07-03: Wire TeamMap Workspace tab, Live Log tab, and OperationsRail kill button to real data

**Goal**: Turn the leader into a first-class progress-reporting surface across private chat and team views.
**Depends on**: Phase 3
**Requirements**: [TEAM-BRIEF-01, TEAM-BRIEF-02, TEAM-BRIEF-03, TEAM-BRIEF-04, TEAM-BRIEF-05]
**UI hint**: yes
**Canonical refs**:
- `team-项目文档.md` - original leader progress-reporting intent and private-chat examples
- `.planning/PROJECT.md` - current product boundary and core value
- `.planning/REQUIREMENTS.md` - leader briefing requirement IDs
- `Prompt.md` - continuity summary for the completed team control plane evolution stream
**Success Criteria** (what must be TRUE):
  1. User can open a Leader progress brief in private leader chat and in Team Overview
  2. Both entry points reflect the same aggregated member-level team state
  3. The brief reports overall status, blockers, current work, next steps, and ETA-oriented cues
  4. The brief keeps long-lived members as the primary reporting layer, with child runtime detail secondary
  5. The brief offers lightweight navigation into existing member or task surfaces
**Plans**: 4 plans

Plans:
- [x] 04-01: Build shared leader progress aggregation logic, Team Overview summary surface, and leader chat brief panel
- [x] 04-02: Redesign Team Overview into a leader-first control-plane layout
- [x] 04-03: Rework Team Map into a collaboration-aware structure view with richer nodes and a split detail panel
- [x] 04-04: Align Team Brief, wording, and lightweight actions across all team-facing surfaces

### Phase 5: Refine leader control plane UI to match product intent

**Goal:** Turn the current team pages into a leader-facing command center that better matches the product document's orchestration intent, without changing the existing derived-team backend model.
**Requirements**: [TEAM-UX-01, TEAM-UX-02, TEAM-UX-03, TEAM-UX-04, TEAM-UX-05]
**Depends on:** Phase 4
**UI hint**: yes
**Canonical refs**:
- `team-项目文档.md` - original Team Leader + Sub-Agent control-plane intent, progress-reporting examples, and permission boundaries
- `.planning/phases/05-refine-leader-control-plane-ui-to-match-product-intent/05-CONTEXT.md` - locked visual and interaction decisions from discuss-phase
- `.planning/PROJECT.md` - architecture constraints and current product boundaries
- `.planning/phases/04-productize-leader-progress-briefing/04-VERIFICATION.md` - current shipped baseline that Phase 5 must refine rather than replace
**Success Criteria** (what must be TRUE):
  1. Team Overview reads as a leader command center, with progress, blockers, active work, and next-step guidance ahead of member profile information
  2. Team Map reads as an operations topology with node-level task state and a persistent task/member detail surface
  3. Team-facing pages use medium-high operational density in leader language while de-emphasizing raw engineering metadata
  4. The visual system feels like a warm, premium command center instead of a generic admin screen
  5. Team-facing pages stay in observe+navigate scope and do not introduce direct orchestration controls in this phase
**Plans:** 3 plans

Plans:
- [x] 05-01: Rebuild Team Overview into a leader command-center dashboard
- [x] 05-02: Rework Team Map into a dense operations topology surface
- [x] 05-03: Align shared control-plane wording, polish, and final verification across team surfaces

### Phase 6: Polish team pages to SaaS command-center visual standard

**Goal:** Elevate the visual quality of TeamOverview, TeamMap, and AgentDetail to a refined SaaS command-center standard — stronger metric display, clearer status language, denser information layout, and consistent visual tokens across all three pages — without altering data models, routes, or backend behavior.
**Depends on:** Phase 5
**Requirements**: [TEAM-VIS-01, TEAM-VIS-02, TEAM-VIS-03]
**UI hint**: yes
**Canonical refs**:
- `team-项目文档.md` - leader/sub-agent product intent and progress reporting reference
- `.planning/phases/05-refine-leader-control-plane-ui-to-match-product-intent/05-CONTEXT.md` - Phase 5 visual decisions that this phase must stay compatible with
**Success Criteria** (what must be TRUE):
  1. TeamOverview metric cards display status-colored indicators alongside numbers, and the member list uses tighter, denser cards with clear status badges
  2. TeamMap AgentNode cards distinguish root/leader nodes visually, and OperationsRail panel matches the same visual language as TeamOverview
  3. AgentDetail replaces legacy iOS color tokens with project-standard Tailwind tokens and aligns section card styling with TeamOverview/TeamMap
**Plans:** 3/3 plans complete

Plans:
- [x] 06-01: Upgrade TeamOverview metric cards, hero section, and member card visual system
- [x] 06-02: Polish TeamMap AgentNode, root node treatment, and OperationsRail visual language
- [x] 06-03: Modernize AgentDetail styling and enforce cross-page visual token consistency

### Phase 8: Team Grouping, Broadcast Chat, and Workspace Edit

**Goal:** Deliver three parallel user-facing features aligned to the product document's core principles: (1) TeamOverview grouped by Leader → Sub-Agent hierarchy using existing `reportsTo` field; (2) KTClaw-internal broadcast chat where one message is sent to multiple Team Leaders simultaneously; (3) Workspace file write (AGENTS.md/SOUL.md) and Skills management UI in TeamMap/AgentDetail.
**Depends on:** Phase 7
**Requirements**: [TEAM-ACCESS-01, TEAM-ENTRY-01, TEAM-RUNTIME-03]
**UI hint**: yes
**Canonical refs**:
- `team-项目文档.md` §1-3 (architecture intent), §6.1 (group chat/multi-leader), §6.3 (workspace micro-ops)
- `.planning/phases/08-team-grouping-broadcast-chat-workspace-edit/08-CONTEXT.md` — locked decisions
**Success Criteria** (what must be TRUE):
  1. TeamOverview groups agents under their Leader with collapsible sections; standalone agents fall into an "Independent" group
  2. User can select multiple Team Leaders and send a broadcast message; each Leader responds independently in the same view
  3. AGENTS.md and SOUL.md content is editable in TeamMap OperationsRail with a Save button that writes to disk
  4. AgentDetail shows a Skills tab listing the agent's configured skill directories with SKILL.md content
**Plans:** 2/3 plans executed

Plans:
- [x] 08-01: TeamOverview Leader-grouped layout
- [x] 08-02: KTClaw internal broadcast chat view
- [x] 08-03: Workspace write endpoint + Save UI, Skills read endpoint + Skills tab

### Phase 9: Channel Feishu Sync Workbench

**Goal:** Upgrade the Channel page into a full bidirectional sync workbench for Feishu. Users can view all group/private conversations the bot participates in (full message history, paginated), send messages as bot or as themselves, and see messages role-colored by self/bot/others. Layout is adaptive (3-col wide, 2-col narrow). Config flow is wizard-based; token expiry degrades gracefully to bot-only mode.
**Depends on:** Phase 8
**Requirements**: [CHANNEL-SYNC-01]
**UI hint**: yes
**Canonical refs**:
- `OpenClaw 飞书官方插件使用指南（公开版）.md` — Feishu bot setup, plugin install, auth flow
- `src/pages/Channels/index.tsx` — existing channel page with sync session/conversation/message types
- `src/types/channel-sync.ts` — ChannelSyncSession, ChannelSyncConversation, ChannelSyncMessage
- `.planning/phases/09-channel-feishu-sync-workbench/09-CONTEXT.md` — locked decisions
**Success Criteria** (what must be TRUE):
  1. Channel page shows all Feishu conversations (groups the bot is in + private chats) with full message history
  2. Messages are role-colored: self (right-aligned blue), bot (left-aligned brand), others (left-aligned grey)
  3. User can send as bot or as self via a per-session toggle next to the composer
  4. Scrolling to top triggers paginated history load (infinite scroll upward)
  5. Images show inline with lightbox on click; files show info card + download button
  6. Search filters sessions by title first, then message content
  7. Bot-removed sessions are marked invalid but preserved; token expiry degrades to bot-only
  8. Layout is adaptive: 3-col on wide screens, 2-col (merged rail+session list) on narrow
**Plans:** 4 plans written, ready for execution

Plans:
- [ ] 09-01: Message display layer — role-colored messages, image lightbox, file cards, paginated history
- [ ] 09-02: Composer upgrade — identity toggle (bot/self), send failure handling, @mention picker
- [ ] 09-03: Session list upgrade — adaptive layout, search (title + content), invalid session state
- [ ] 09-04: Backend sync endpoints — paginated message fetch, send-as-user, session state tracking
