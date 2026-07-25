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
- Implemented the 10x Weapon Damage Curve overhaul and 3-Stage Boss Evolution system, verified live via Chrome DevTools MCP against the running dev server:
  - Rescaled all `WEAPONS` ATK values in `content.ts` to a 2-32 range (was 2-14) across Trash/Early/Mid/Late/Ultimate tiers.
  - Reset `BESTIARY`'s mini-boss templates to Mk I baselines and rescaled `CHRONO_LICH` to HP 4500/ATK 120/DEF 25; added a `BOSS_EVOLUTION` map with hand-tuned Mk II/III stats per arena floor, replacing `arenas.ts`'s old flat repeat-multiplier (deleted `miniBossRepeatMultiplier` as dead code).
  - Verified Weakness Exploit (+1 Stamina, 3-turn cooldown), Tactical Brace (+2 Stamina), the +8%/5-floor Depth Multiplier, boss exemption from it, and the Upgrade Shop's cost curves were already correct from prior sessions — no changes needed there.
  - Restored the 6th Cursed Rift event (previously shipped as `lich_projection`, deliberately removed in a past commit) under the new key `chrono_lich_projection`, matching the name Game.md already documented.
  - Added Mk I/II/III movesets in `enemyAI.ts`: Inferno-Golem gets Cross Magma Slam + Ember Aura + Ash-Fiend summons at Mk II, then 5x5 Magma Slam + Supernova (spawns an Obsidian Pillar for shelter) + Hellfire-Magus summons at Mk III. Storm-Caller gets double-fork Chain Bolt + Magnetic Pull + Storm-Stalker summons at Mk II, then Overload Rain (permanently shatters a copper pillar per cast) + Tesla-Coil summons at Mk III — also fixed Mk II's summon, which was spawning a Frost enemy on a Volt boss. Glacial-Knight gets Glacial Lunge (smashes barricades, slides the player) + Void-Spirit summons at Mk II, then Fire-only-meltable permanent Ice-Barricades + Permafrost Storm's extra Turn drain + Glacial-Monolith summons at Mk III.
  - All mechanics driven live on floors 40/50/60/70/80/90/99 via Dev Tools warp + Cheat Mode; confirmed no console errors and correct log/visual feedback for every new mechanic (Cross Slam's telegraphed cross shape, Supernova's Obsidian Pillar, Magnetic Pull, Overload Rain's pillar shatter, Glacial Lunge's slide).
  - Updated `Game.md`'s Weapons/Monsters/Cursed Rifts/Echo Economy sections to match the new values.

## Todo This Session
Nothing queued — awaiting next direction
