# Feishu Workbench Completion Design

## Goal

Promote the Feishu channel workbench from a placeholder-blocked surface to a real, first-class sync workbench, while keeping the existing WeChat implementation behavior unchanged.

## Background

The current Channels page already contains a shared sync workbench shell in `src/pages/Channels/index.tsx`. Feishu sessions, conversations, pagination, media rendering, mentions, optimistic send, and onboarding all exist in some form, but the page still mounts `FeishuWorkbenchPlaceholder` on top of the Feishu pane. Roadmap Phase 10 and `SYNC-FEISHU-01` still require Feishu-specific completion work around status handling, identity-aware send, search fallback, and session-state polish.

## Scope

- Remove the full-pane Feishu placeholder overlay.
- Keep the shared `Channels` workbench shell and continue using it for Feishu.
- Complete the remaining Feishu workbench behaviors needed to match Phase 10 success criteria.
- Preserve the existing Feishu onboarding and settings entry points.
- Treat WeChat as read-only reference: no intended behavior changes, no route contract changes, no UI-flow changes.

## Non-Goals

- No broad refactor of the shared channel workbench into a new component hierarchy.
- No changes to WeChat flows, route shapes, media handling, or onboarding.
- No new standalone Feishu page or duplicate workbench implementation.
- No changes to the renderer/backend boundary policy.

## Recommended Approach

Continue using the existing shared `Channels` workbench and remove the Feishu-only overlay. Add a small Feishu status layer that drives banners, CTAs, and identity availability instead of blocking the entire workbench. Complete missing Feishu-specific behaviors in the existing frontend and route contracts rather than introducing a second Feishu-specific surface.

This keeps the change set localized, preserves current WeChat behavior, and aligns with the current codebase direction where channel families share a workbench shell but retain channel-specific branches where necessary.

## User-Visible Behavior

### 1. Feishu no longer shows a full-screen placeholder

- Opening a Feishu channel renders the real workbench immediately.
- The old `FeishuWorkbenchPlaceholder` overlay is removed from the page.
- Existing conversation history remains visible even when Feishu is degraded.

### 2. Feishu status becomes an in-page state, not a blocker

- If Feishu is not configured, the page shows an empty-state CTA that opens `FeishuOnboardingWizard`.
- If Feishu is configured but only bot send is available, the page shows a non-blocking warning banner and continues to allow bot-mode usage.
- If user authorization is expired or unavailable, the page removes self-send controls and explains the degradation in-page.
- If diagnostics detect runtime/plugin problems, the page preserves settings and recovery actions without masking existing synced history.

### 3. Identity-aware send is restored as a real capability

- Default send identity remains `bot`.
- When Feishu status reports user authorization is available, the composer shows an identity toggle: `机器人 | 我`.
- Sending with `我` must submit `identity: 'self'`.
- If the backend cannot honor self-send, it falls back to bot send and returns a warning that the UI surfaces to the user.

### 4. Session list polish is completed

- Search remains local-first on `title` and `previewText`.
- If local filtering yields no results, Feishu can use backend-assisted message-content fallback search.
- Invalid sessions remain visible instead of disappearing.
- Recently invalid sessions show a visible warning/error badge.
- Older invalid sessions move into the archived treatment instead of polluting the active list.

### 5. Existing admin/onboarding flows remain the only entry points

- `设置` still opens channel configuration.
- Quick-add and add-channel flows still route Feishu through `FeishuOnboardingWizard`.
- No second Feishu management surface is introduced.

## Architecture and File Boundaries

### Frontend

Primary file:

- `src/pages/Channels/index.tsx`

Responsibilities for this change:

- Remove Feishu placeholder state and overlay rendering.
- Add Feishu runtime status fetch/state handling.
- Gate identity-toggle visibility and selected send identity from Feishu status.
- Surface Feishu-only banners/CTAs for unconfigured, degraded, or bot-only states.
- Extend session filtering to support Feishu fallback search without affecting WeChat.
- Keep the shared session/message/composer shell intact.

Possible supporting cleanup:

- Delete `src/components/channels/FeishuWorkbenchPlaceholder.tsx` if no longer referenced.
- Update `tests/unit/channels-page.test.tsx` to replace placeholder-era expectations with formal workbench expectations.

### Backend

Primary file:

- `electron/api/routes/channels.ts`

Responsibilities for this change:

- Keep existing workbench routes as the canonical renderer interface.
- Extend Feishu-facing route payloads only where needed for:
  - backend-assisted search fallback
  - self-send fallback/warning semantics
  - invalid/archived session-state mapping
- Preserve existing WeChat route shapes and behavior.

Possible supporting file:

- `electron/services/feishu-integration.ts`

Responsibilities for this change:

- Normalize the status information used by `/api/feishu/status` so the renderer can reliably distinguish:
  - not configured
  - configured but bot-only
  - authorized
  - degraded
  - error

## Testing Strategy

### Frontend tests

Update or add coverage in `tests/unit/channels-page.test.tsx` for:

- Feishu no longer rendering the placeholder overlay.
- Feishu rendering the real workbench shell as the primary experience.
- Identity toggle visible only when Feishu self-send is truly available.
- Bot-only/degraded banner behavior.
- Feishu send request body using `identity: 'self'` when selected.
- Fallback search behavior for Feishu when local filtering has no match.
- Invalid/archived session badges and ordering.
- WeChat flows remaining unchanged.

### Backend tests

Update or add coverage in `tests/unit/channel-sync-routes.test.ts` and Feishu-specific route/service tests for:

- Search fallback response shape.
- Feishu self-send downgrade behavior.
- Session invalid/archived metadata mapping.
- Existing Feishu history/member/media behavior remaining green.

## Risks and Mitigations

- `src/pages/Channels/index.tsx` is already large.
  - Mitigation: keep changes targeted and channel-scoped rather than performing unrelated refactors.
- Feishu and WeChat share the same shell.
  - Mitigation: lock the scope to Feishu-only branches and preserve existing WeChat tests.
- Feishu status may be underspecified today.
  - Mitigation: normalize backend status payloads before adding renderer logic that depends on them.

## Success Criteria

- Feishu opens directly into a usable workbench with no placeholder overlay.
- Feishu users can view synced sessions and paginated message history.
- Feishu users can send as bot or self when authorized, and degrade safely when not.
- Feishu media, mention, search, and session-state behaviors match the active roadmap requirement.
- WeChat behavior and tests remain unchanged.
