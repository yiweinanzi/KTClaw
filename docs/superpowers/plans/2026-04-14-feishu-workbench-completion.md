# Feishu Workbench Completion Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the Feishu placeholder overlay and finish the remaining Feishu workbench behaviors without changing WeChat behavior.

**Architecture:** Keep the shared `Channels` workbench in place and make Feishu completion an additive change on top of the existing shell. Use the existing host-api routes as the only renderer/backend interface, extend Feishu-specific route contracts only where the current Phase 10 requirements still need explicit status, search, or self-send semantics.

**Tech Stack:** React 19, TypeScript, Electron host-api routes, Vitest, Testing Library

---

## File Map

- Modify: `src/pages/Channels/index.tsx`
  - Remove Feishu placeholder usage.
  - Add Feishu status-driven banner/CTA logic.
  - Restore Feishu identity toggle and send-mode handling.
  - Add Feishu-only fallback search behavior.
- Delete or stop referencing: `src/components/channels/FeishuWorkbenchPlaceholder.tsx`
- Modify: `electron/api/routes/channels.ts`
  - Add or extend Feishu route behavior for fallback search, send downgrade warnings, and session-state mapping.
- Modify: `electron/services/feishu-integration.ts` if `/api/feishu/status` needs a clearer normalized shape.
- Modify: `tests/unit/channels-page.test.tsx`
  - Replace placeholder-era expectations with formal Feishu workbench expectations.
  - Add red/green coverage for Feishu status states and fallback search.
- Modify: `tests/unit/channel-sync-routes.test.ts`
  - Add red/green coverage for Feishu self-send downgrade and search/session metadata.

## Chunk 1: Remove Placeholder And Restore Formal Feishu UI State

### Task 1: Remove the full-pane Feishu placeholder

**Files:**
- Modify: `tests/unit/channels-page.test.tsx`
- Modify: `src/pages/Channels/index.tsx`
- Delete or stop referencing: `src/components/channels/FeishuWorkbenchPlaceholder.tsx`

- [ ] **Step 1: Write the failing test**

Add a test in `tests/unit/channels-page.test.tsx` that renders Feishu and asserts:
- the real workbench shell is visible
- `data-testid="feishu-workbench-placeholder"` is absent

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/unit/channels-page.test.tsx`
Expected: FAIL because the placeholder still renders for Feishu.

- [ ] **Step 3: Write minimal implementation**

In `src/pages/Channels/index.tsx`:
- remove `showFeishuWorkbenchPlaceholder`
- remove opacity/pointer-events masking tied to that flag
- remove `FeishuWorkbenchPlaceholder` rendering
- remove the now-dead placeholder action helpers

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- tests/unit/channels-page.test.tsx`
Expected: PASS for the new test.

### Task 2: Add Feishu status-driven banners instead of blocking overlays

**Files:**
- Modify: `tests/unit/channels-page.test.tsx`
- Modify: `src/pages/Channels/index.tsx`
- Modify: `electron/services/feishu-integration.ts` only if route shape needs normalization

- [ ] **Step 1: Write the failing test**

Add focused tests for Feishu states:
- bot-only/degraded state renders a non-blocking warning banner
- unconfigured state renders an onboarding CTA instead of a blocking overlay

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/unit/channels-page.test.tsx`
Expected: FAIL because the page does not yet render the new Feishu state treatment.

- [ ] **Step 3: Write minimal implementation**

In `src/pages/Channels/index.tsx`:
- fetch `/api/feishu/status` only when the active channel type is Feishu
- derive a small Feishu UI state
- render banner/CTA fragments inside the existing page chrome

If needed, normalize `/api/feishu/status` so the renderer can distinguish:
- unconfigured
- authorized
- bot-only/degraded
- error

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- tests/unit/channels-page.test.tsx`
Expected: PASS for the new status-state tests.

## Chunk 2: Restore Identity-Aware Send

### Task 3: Re-enable Feishu identity toggle when self-send is truly available

**Files:**
- Modify: `tests/unit/channels-page.test.tsx`
- Modify: `src/pages/Channels/index.tsx`

- [ ] **Step 1: Write the failing test**

Unskip or rewrite targeted tests so they assert:
- authorized Feishu status shows `data-testid="identity-toggle"`
- clicking `我` changes the send payload to `identity: 'self'`
- degraded/bot-only states hide the toggle

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/unit/channels-page.test.tsx`
Expected: FAIL because the page currently always sends Feishu messages as `identity: 'bot'`.

- [ ] **Step 3: Write minimal implementation**

In `src/pages/Channels/index.tsx`:
- add Feishu-only send identity state
- show the toggle only for eligible Feishu status
- send the selected identity in `handleSend`
- preserve WeChat behavior

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- tests/unit/channels-page.test.tsx`
Expected: PASS for authorized/degraded send-mode tests.

### Task 4: Preserve safe backend fallback for unavailable self-send

**Files:**
- Modify: `tests/unit/channel-sync-routes.test.ts`
- Modify: `electron/api/routes/channels.ts`

- [ ] **Step 1: Write the failing test**

Add a route test asserting that a Feishu send request with `identity: 'self'`:
- downgrades safely to bot send when self-send is unavailable
- returns a warning the UI can surface

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/unit/channel-sync-routes.test.ts`
Expected: FAIL because the route does not yet expose the expected fallback contract.

- [ ] **Step 3: Write minimal implementation**

In `electron/api/routes/channels.ts`:
- preserve current send path
- attach explicit fallback metadata/warning when `identity: 'self'` cannot be honored

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- tests/unit/channel-sync-routes.test.ts`
Expected: PASS for the new self-send fallback test.

## Chunk 3: Finish Feishu Search And Session-State Polish

### Task 5: Add Feishu fallback search when local filtering has no match

**Files:**
- Modify: `tests/unit/channels-page.test.tsx`
- Modify: `src/pages/Channels/index.tsx`
- Modify: `tests/unit/channel-sync-routes.test.ts`
- Modify: `electron/api/routes/channels.ts`

- [ ] **Step 1: Write the failing test**

Add frontend and route tests that assert:
- Feishu first filters locally by title/preview
- if nothing matches, the page calls a Feishu search route and renders the fallback result
- WeChat keeps its current local behavior

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/unit/channels-page.test.tsx tests/unit/channel-sync-routes.test.ts`
Expected: FAIL because the fallback search behavior is not implemented.

- [ ] **Step 3: Write minimal implementation**

Add a Feishu-only search route/contract in `electron/api/routes/channels.ts` and wire `src/pages/Channels/index.tsx` to use it only when local filtering yields zero results.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- tests/unit/channels-page.test.tsx tests/unit/channel-sync-routes.test.ts`
Expected: PASS for the new fallback-search tests.

### Task 6: Surface invalid and archived Feishu session states cleanly

**Files:**
- Modify: `tests/unit/channels-page.test.tsx`
- Modify: `src/pages/Channels/index.tsx`
- Modify: `tests/unit/channel-sync-routes.test.ts`
- Modify: `electron/api/routes/channels.ts` if needed

- [ ] **Step 1: Write the failing test**

Add tests asserting:
- recent invalid Feishu sessions show a visible warning/error badge
- older invalid Feishu sessions render in archived treatment
- existing rename/hide behavior still works

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/unit/channels-page.test.tsx tests/unit/channel-sync-routes.test.ts`
Expected: FAIL if the current data mapping does not fully express the required state.

- [ ] **Step 3: Write minimal implementation**

Adjust session-state mapping and UI labels to clearly distinguish:
- `synced`
- `invalid`
- `error`
- archived stale sessions

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- tests/unit/channels-page.test.tsx tests/unit/channel-sync-routes.test.ts`
Expected: PASS for the new invalid/archive tests.

## Chunk 4: Final Verification

### Task 7: Verify Feishu changes without regressing WeChat

**Files:**
- No new files required

- [ ] **Step 1: Run focused unit suites**

Run:
- `pnpm test -- tests/unit/channels-page.test.tsx`
- `pnpm test -- tests/unit/channel-sync-routes.test.ts`

Expected: PASS

- [ ] **Step 2: Run adjacent Feishu/WeChat coverage**

Run:
- `pnpm test -- tests/unit/openclaw-feishu-routes.test.ts tests/unit/openclaw-feishu-integration.test.ts`

Expected: PASS

- [ ] **Step 3: Run typecheck if route/page types changed**

Run: `pnpm run typecheck`
Expected: PASS

- [ ] **Step 4: Review docs impact**

Check whether `README.md`, `README.zh-CN.md`, and `README.ja-JP.md` need updates for the Feishu workbench no longer being placeholder-blocked. Update only if behavior is user-visible in docs.

- [ ] **Step 5: Prepare completion summary**

Record:
- what changed for Feishu
- what was intentionally not changed for WeChat
- which tests were run
