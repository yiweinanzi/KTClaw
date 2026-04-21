# Local Embeddings Runtime On-Demand Design

Date: 2026-04-21
Status: Draft approved in conversation, awaiting written-spec review

## Context

KTClaw currently bundles OpenClaw plus its transitive runtime dependencies into `build/openclaw/` before Electron packaging.

The largest contributor to package-preparation cost is the `node-llama-cpp` runtime tree and its platform variants. The current bundle contains more than 1GB of `@node-llama-cpp` payload before platform cleanup. This slows CI packaging and inflates default install size.

At the same time, `node-llama-cpp` is not required for KTClaw's mainstream chat and provider flows:

- Remote providers are unaffected.
- Ollama is unaffected because it uses HTTP, not `node-llama-cpp`.
- Retained channel integrations are unaffected.

OpenClaw still uses `node-llama-cpp` for the `local` memory embeddings backend. That is a real capability and should not be removed outright.

## Problem

We are paying the installation and packaging cost of a heavy optional runtime for every user, even though only a subset of users will ever need local embeddings.

## Goal

Make local embeddings a first-class optional capability:

- Default KTClaw installation does not bundle `node-llama-cpp`.
- When a user triggers a local-embeddings-dependent action, KTClaw detects the missing runtime and offers to install it.
- The first version only supports CPU runtime download.

## Non-Goals

- No CUDA or Vulkan runtime download in v1.
- No background prefetch on first launch.
- No silent fallback to a different embeddings provider.
- No redesign of the Memory UI beyond the install prompt and a small management surface.
- No attempt to make `node-llama-cpp` optional for every OpenClaw local feature; v1 focuses on the local embeddings dependency path.

## User Experience

### Default state

- Fresh KTClaw install ships without `node-llama-cpp`.
- Users who never touch local embeddings never see any extra download flow.

### Triggered state

When a user runs an action that requires the local embeddings backend and the runtime is missing:

1. KTClaw intercepts the structured runtime-missing condition.
2. Instead of showing a raw OpenClaw error, KTClaw opens an install dialog.
3. The dialog explains:
   - This runtime is only required for local memory embeddings.
   - Ollama and cloud providers are not affected.
   - Approximate download size.
   - Install location.
4. User actions:
   - `Download and install`
   - `Cancel`

### Installation flow

- Show download progress, unpacking progress, and final status.
- On success:
  - Retry the blocked operation once when safe.
  - Otherwise tell the user to rerun the action.
- On failure:
  - Show a concrete error category:
    - network
    - checksum
    - unpack
    - permission/disk

### Manual management

Settings should expose a small "Local Embeddings Runtime" panel with:

- Status:
  - Not installed
  - Installing
  - Installed
  - Version mismatch
  - Error
- Actions:
  - Install
  - Reinstall
  - Remove

## Technical Design

### 1. Packaging changes

Default desktop packages must stop bundling `node-llama-cpp` runtime assets.

Specifically:

- Do not ship `@node-llama-cpp/*` prebuilt binaries in the default KTClaw package.
- Keep OpenClaw itself bundled.
- Keep all non-local-embeddings dependencies intact.

This preserves product behavior while moving the heavy optional runtime out of the default install path.

### 2. Runtime manager

Add a dedicated main-process service:

- `electron/services/local-embeddings-runtime-manager.ts`

Responsibilities:

- Resolve target version/platform/arch.
- Read bundled manifest metadata.
- Check local install status.
- Download runtime archives.
- Validate SHA256.
- Unpack into user data directory.
- Remove outdated or broken installs.
- Report progress to renderer.

Suggested API:

- `getStatus(): LocalEmbeddingsRuntimeStatus`
- `install(): Promise<InstallResult>`
- `remove(): Promise<void>`
- `ensureInstalled(): Promise<void>`
- `resolveRuntimeEnv(): Record<string, string>`

### 3. Runtime manifest

Ship a manifest owned by KTClaw, not dynamically discovered from third-party package metadata.

Suggested file:

- `resources/runtime-manifests/local-embeddings.json`

Manifest fields per target:

- version
- platform
- arch
- downloadUrl
- archiveSizeBytes
- sha256
- unpackSubdir

v1 targets:

- `win32-x64`
- `win32-arm64`
- `linux-x64`
- `linux-arm64`
- `darwin-x64`
- `darwin-arm64`

Only CPU runtime artifacts are included in the manifest.

### 4. Install location

Install into app-controlled user data, not the application bundle.

Suggested path:

- `${app.getPath('userData')}/runtimes/node-llama-cpp/<version>/<platform>-<arch>/`

Why:

- avoids admin permissions
- keeps upgrades isolated
- lets us replace the runtime without reinstalling KTClaw
- supports future cleanup/version migration

### 5. Error detection and mapping

KTClaw must map OpenClaw's current raw error into a stable app-level condition.

Target condition:

- `LOCAL_EMBEDDINGS_RUNTIME_REQUIRED`

Detection sources:

- missing optional dependency error text from OpenClaw local embeddings path
- explicit "Local embeddings unavailable" text
- explicit `node-llama-cpp is missing` detail

The app should not string-match only in renderer. Detection belongs in the main/backend boundary so UI stays stable.

### 6. Operation integration

The first version should intercept local-embeddings-required failures for:

- Memory reindex
- Memory analyze, if it reaches vector path
- Any other host routes already wired to local embeddings backend

Behavior:

- If runtime missing:
  - return structured install-required response
- If runtime installed:
  - inject required runtime environment and continue

### 7. Retry behavior

After a successful installation:

- Retry the blocked operation once if it is deterministic and side-effect-safe.
- Otherwise return success plus an instruction for the UI to tell the user to rerun manually.

For v1, retrying `memory reindex` is acceptable and recommended.

## Data Flow

### Happy path

1. User triggers `memory reindex`
2. Main process checks whether local embeddings runtime is needed and installed
3. Runtime exists
4. Main process injects runtime env/path
5. OpenClaw executes
6. UI shows normal success

### Missing runtime path

1. User triggers `memory reindex`
2. Main process detects missing local embeddings runtime or receives mapped runtime-required failure
3. Route returns structured error
4. Renderer opens install dialog
5. User confirms install
6. Main process downloads and installs CPU runtime
7. Install succeeds
8. Main process retries reindex or signals retry-ready
9. UI shows success state

## Security and Integrity

- Every artifact must have SHA256 verification before activation.
- Failed verification deletes the archive and extracted directory.
- Download to temporary path first, then atomic move into final runtime path.
- Never execute from partially downloaded directories.
- Manifest should be versioned with the app release.

## Observability

Add structured logs for:

- runtime status checks
- download start/finish/failure
- checksum success/failure
- install success/failure
- operation retry after install

Suggested event names:

- `local-embeddings-runtime:status`
- `local-embeddings-runtime:download-start`
- `local-embeddings-runtime:download-complete`
- `local-embeddings-runtime:install-complete`
- `local-embeddings-runtime:error`

## Testing Strategy

### Unit tests

- manifest parsing
- platform/arch resolution
- installed/version-mismatch status logic
- checksum validation
- cleanup of failed installs
- runtime-required error mapping

### Integration tests

- memory route returns install-required state when runtime missing
- successful install updates status
- successful install triggers retry-ready or retry execution

### Packaging tests

- default desktop package no longer contains `@node-llama-cpp` bundled runtime assets

## Rollout Plan

### Phase 1

- Stop bundling `node-llama-cpp` by default
- Add runtime manager
- Add install-required error mapping
- Add install dialog
- Add settings status panel
- CPU only

### Phase 2

- Better resume/retry UX
- Runtime upgrade path
- Optional GPU runtime variants

## Risks

### Risk: hidden OpenClaw paths require `node-llama-cpp`

Mitigation:

- keep explicit error mapping
- limit first rollout to known local embeddings dependency path
- test memory flows thoroughly

### Risk: runtime source drift

Mitigation:

- KTClaw-owned manifest with checksums
- pin exact version

### Risk: users confuse Ollama with local embeddings runtime

Mitigation:

- explicit UI copy saying Ollama does not require this install

## Recommendation

Proceed with Phase 1 only.

This gives the strongest package-size and install-speed win while preserving the underlying OpenClaw local embeddings capability for users who actually need it.
