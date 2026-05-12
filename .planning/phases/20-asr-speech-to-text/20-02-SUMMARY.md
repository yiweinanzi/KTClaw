---
phase: 20-asr-speech-to-text
plan: 02
subsystem: ui
tags: [speech-recognition, web-speech-api, react-hook, tailwind-animation, chat-input]

# Dependency graph
requires:
  - phase: 20-asr-speech-to-text
    provides: "Plan 20-01 media permission gate (Electron main process allows audio getUserMedia)"
provides:
  - "useSpeechRecognition custom React hook for browser SpeechRecognition API lifecycle"
  - "mic-pulse Tailwind CSS keyframe/animation for microphone listening state"
  - "Microphone button in ChatInput toolbar between Camera and 生成图片"
  - "Real-time speech-to-text insertion with cursor position awareness"
  - "Chinese-language error toast handling for all recognition failure modes"
affects: [chat-input, voice-input, accessibility]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Browser SpeechRecognition API wrapped in custom React hook with getUserMedia permission gate"
    - "useRef-based cursor position save/restore for inline text insertion during async recognition"
    - "Tailwind keyframe + animation extend pattern for icon pulse feedback"

key-files:
  created:
    - "src/hooks/useSpeechRecognition.ts - SpeechRecognition lifecycle management hook"
  modified:
    - "tailwind.config.js - mic-pulse keyframe and animation entry"
    - "src/pages/Chat/ChatInput.tsx - microphone button and speech recognition integration"

key-decisions:
  - "Used (window as any).SpeechRecognition cast — no @types/dom-speech-recognition package installed"
  - "getUserMedia({ audio: true }) called before SpeechRecognition instantiation — Chromium requires mic permission first"
  - "interimResults: true, continuous: false — single utterance per click with real-time display"
  - "lang defaults to zh-CN — matches project default language, no per-user picker"

patterns-established:
  - "Microphone button follows exact Camera button styling: h-[30px] w-[30px] round ghost variant"
  - "SpeechRecognition cleanup via abort() + media track stop(), both in useEffect return and manual stop"
  - "Cursor-aware text insertion: save prefix/suffix refs on start, insert transcript between them on result"

requirements-completed: [D-01, D-02, D-03, D-04, D-05, D-06, D-07, D-08, D-09, D-10, D-11, D-12, D-13]

# Metrics
duration: 8min
completed: 2026-05-12
---

# Phase 20 Plan 02: Microphone Button with Browser Speech-to-Text Integration

**Custom React hook wrapping Chromium SpeechRecognition API with mic-pulse animation and cursor-aware text insertion into the chat composer**

## Performance

- **Duration:** 8 min
- **Started:** 2026-05-12T04:54:00Z
- **Completed:** 2026-05-12T05:02:42Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments
- useSpeechRecognition custom hook with start/stop lifecycle, getUserMedia permission gate, interim/final result callbacks, and all error modes (no-speech, aborted, network, nomatch, permission-denied, not-supported)
- mic-pulse Tailwind animation with scale(1) to scale(1.2) pulse effect at 1.2s ease-in-out infinite
- Microphone button rendered between Camera and 生成图片 in ChatInput toolbar with identical visual styling
- Red MicOff icon + animate-mic-pulse while listening, placeholder changes to "正在聆听..."
- Cursor-aware text insertion: saves prefix/suffix at mic activation, inserts transcript at saved position with space separator
- Chinese sonner toast for all 12 error types
- Mic button hidden when SpeechRecognition API unsupported, disabled when `disabled || sending`

## Task Commits

Each task was committed atomically:

1. **Task 1: Create useSpeechRecognition custom hook** - `59aae35` (feat)
2. **Task 2: Add mic-pulse animation to tailwind.config.js** - `a936fd3` (feat)
3. **Task 3: Add microphone button to ChatInput toolbar** - `48c89d5` (feat)

## Files Created/Modified
- `src/hooks/useSpeechRecognition.ts` - SpeechRecognition lifecycle hook: isSupported detection, getUserMedia permission gate, start/stop/cleanup, interim/final/error callbacks, unmount cleanup
- `tailwind.config.js` - mic-pulse keyframe (scale 1->1.2 opacity 1->0.7) and animation (1.2s ease-in-out infinite) in extend block
- `src/pages/Chat/ChatInput.tsx` - Mic/MicOff lucide import, useSpeechRecognition import, micPrefixRef/micSuffixRef refs, handleSpeechInterim/handleSpeechResult/handleSpeechError callbacks, handleMicToggle logic, mic button JSX with conditional rendering, listening-aware placeholder

## Decisions Made
- Used `(window as any).SpeechRecognition` type casts throughout — project has no @types/dom-speech-recognition package
- `getUserMedia({ audio: true })` called before SpeechRecognition constructor — Chromium requires mic permission grant first
- `interimResults: true`, `continuous: false` — single utterance per click, interim results displayed in real-time
- `lang: 'zh-CN'` hardcoded — matches project's Chinese-default language policy, no per-user picker in this phase
- All 12 error codes mapped to Chinese toast messages via Record<string, string> lookup table

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript type errors from missing Web Speech API type declarations**
- **Found during:** Task 1 verification (TypeScript compilation)
- **Issue:** The plan's exact implementation used `InstanceType<typeof SpeechRecognition>`, `SpeechRecognitionEvent`, and `SpeechRecognitionErrorEvent` — none of these types exist in the project. `npx tsc --noEmit` failed with TS2552 errors.
- **Fix:** Changed `InstanceType<typeof SpeechRecognition>` to `any` for the recognition ref, and `SpeechRecognitionEvent`/`SpeechRecognitionErrorEvent` to `any` for event handler parameter types. This aligns with the plan's own note: "Must use `(window as any).SpeechRecognition` TypeScript cast — there is no `@types/dom-speech-recognition` in the project."
- **Files modified:** `src/hooks/useSpeechRecognition.ts` (lines 33, 95, 113)
- **Verification:** `npx tsc --noEmit` passes with zero errors
- **Committed in:** `59aae35` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 bug)
**Impact on plan:** Type-only fix, zero functional impact. All auto-fixes necessary for correctness.

## Issues Encountered
- TypeScript path alias resolution failed when checking single files with bare `tsc` — resolved by using project-level `npx tsc --noEmit` which uses tsconfig path mappings

## Next Phase Readiness
- Microphone button and speech-to-text fully functional in ChatInput toolbar
- Depends on Plan 20-01's media permission gate for Electron main process audio permission handling
- No blockers for subsequent plans

---
*Phase: 20-asr-speech-to-text*
*Completed: 2026-05-12*
