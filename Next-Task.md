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
- Fixed a fatal PWA caching issue where an outdated `index.html` would request missing JS/CSS bundles. `sw.js` now uses a "Network-First" strategy and properly clears old caches on activation.
- Upgraded the particle system in `animation.ts` to include gravity and floor bouncing physics (z-axis logic).
- Increased death particle burst density (10-20 particles) and slightly lengthened their lifespan.
- Implemented CSS-based `.shake` screen shake animation in `style.css`.
- Triggered `triggerScreenShake()` in `combat.ts` during critical hits (elemental combos) and heavy boss damage (>10 or from Chrono-Lich).
- Restyled `.action-log` in `index.css` (mobile) to show a single wrapping line with fixed height.
- Bound click listener to action-log HUD element to open the new modal.

## Todo This Session
Nothing queued — awaiting next direction