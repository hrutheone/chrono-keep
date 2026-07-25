# Chrono-Keep: next-session briefing

Read `Game.md` first — it's the current-state spec. There is
no separate implementation history/phase log anymore: Game.md tracks what
the game *is* right now, not how it got there. Development history lives in
git log if it's ever needed. This file tracks what's still outstanding.

Remember to follow ALL rules in CLAUDE.md:
Write strictly minimal/no comments.
Ensure all UI is strictly HTML/CSS.
Update Game.md, Next-Task.md in appropriate section to briefly mention development.
Auto-run git add, commit, and push for each update.

## Jobs Done Previous Session
Summary of changes:
- Implemented reddit-port.md Phase 0 (pre-port polish) and Phase 1 (local Devvit mock harness), verified live via Chrome DevTools MCP against the running dev server:
  - Added `turnCount` to `GameState['run']`, incrementing in both existing turn-spending paths (`turnController.ts`'s `runTickPhase`, and `turns.ts`'s `spendTurn` for inventory item costs) — the plan's original assumption that `spendTurn()` alone was "the" choke point was wrong; verified live and fixed.
  - Fixed `animation.ts`'s entity spring-lerp from frame-count-based to delta-time-based (exponential decay), with a clamped per-frame `dt` computed inside `updateAnimations()`.
  - Fixed mobile canvas scaling in `main.ts` to snap to an integer multiple instead of stretching fluidly via CSS.
  - Added `touch-action: none` on `#game` and a `touchmove` guard on `#app`; added `safe-area-inset-top` padding to `#hud-top`.
  - Fixed the audio-unlock gate: touch-only input never fired a real `click` (touchControls.ts's `preventDefault()` suppresses it), so `initAudio()` now also listens for `touchstart`/`pointerdown`. Switched BGM from eager-decode-all-6-tracks to lazy per-track decode with eviction of the previous track's buffer (confirmed via network panel: only the active track is fetched/decoded, re-fetched on return since it's evicted).
  - Added `src/devvitBridge.ts` (the only module owning `postMessage` traffic) plus `devvit-mock/index.html`, a static mock-host harness. Verified end-to-end: boot reconciliation round-trip (`CK_REQUEST_INIT`/`CK_INIT_STATE`) and hard-save reporting (`CK_SAVE_HARD`, wired at `hub.ts`'s `warpToFloor`) both confirmed working live, including across a mock-Redis-backed reload.

## Todo This Session
Nothing queued — awaiting next direction