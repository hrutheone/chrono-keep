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
  - Restored, then re-removed on user direction, the 6th Cursed Rift event (`chrono_lich_projection`, previously shipped as `lich_projection` and deliberately removed in a past commit). Cursed Rifts stay a 5-event roulette: Rift Shop, Blood-Infused Anvil, Frozen Watchwarden, Paradox Mirror, Echo Geode.
  - Added Mk I/II/III movesets in `enemyAI.ts`: Inferno-Golem gets Cross Magma Slam + Ember Aura + Ash-Fiend summons at Mk II, then 5x5 Magma Slam + Supernova (spawns an Obsidian Pillar for shelter) + Hellfire-Magus summons at Mk III. Storm-Caller gets double-fork Chain Bolt + Magnetic Pull + Storm-Stalker summons at Mk II, then Overload Rain (permanently shatters a copper pillar per cast) + Tesla-Coil summons at Mk III — also fixed Mk II's summon, which was spawning a Frost enemy on a Volt boss. Glacial-Knight gets Glacial Lunge (smashes barricades, slides the player) + Void-Spirit summons at Mk II, then Fire-only-meltable permanent Ice-Barricades + Permafrost Storm's extra Turn drain + Glacial-Monolith summons at Mk III.
  - All mechanics driven live on floors 40/50/60/70/80/90/99 via Dev Tools warp + Cheat Mode; confirmed no console errors and correct log/visual feedback for every new mechanic (Cross Slam's telegraphed cross shape, Supernova's Obsidian Pillar, Magnetic Pull, Overload Rain's pillar shatter, Glacial Lunge's slide).
  - Updated `Game.md`'s Weapons/Monsters/Cursed Rifts/Echo Economy sections to match the new values.

## Todo This Session
Follow-up balance pass on two leftovers flagged (not fixed) at the end of the 10x weapon curve overhaul:

### 1. Mini-Boss signature-weapon drops break the tier curve on Mk I floors
`combat.ts`'s `MINI_BOSS_WEAPON` map (~line 302) drops the *same* signature weapon every time a mini-boss dies, regardless of which Mk stage it was:
- `INFERNO_GOLEM: 'IFRITS_BLADE'` (ATK 11, Mid Tier) — including at F10 Mk I, where the Early Tier chest pool caps at ATK 6.
- `STORM_CALLER: 'BLITZ_WHIP'` (ATK 16, Late Tier) — including at F20 Mk I.
- `GLACIAL_KNIGHT: 'ICE_BRAND'` (ATK 16, Late Tier) — including at F30 Mk I.

Storm-Caller and Glacial-Knight are actually worse offenders than the one flagged (Late Tier weapon at F20/F30, a bigger jump than Golem's Mid Tier one at F10).

**Plan:** keep each boss's signature weapon identity (name/passive/lore stay the same — that's the flavor payoff), but scale the *ATK value* of the drop to the Mk stage instead of always using the weapon's flat base ATK from `WEAPONS`. In `killEnemy`'s mini-boss branch (`combat.ts` ~line 446-458), where `createWeapon(weaponKey, ...)` is called before `applyEliteWeaponBonus`: after creating the weapon, override `weapon.atk` down for early Mk stages — e.g. Mk I drops at roughly Early Tier ceiling (~ATK 6), Mk II at roughly Mid Tier ceiling (~ATK 15), Mk III keeps the weapon's real (Late Tier) ATK. Use `miniBossRepeatNumber(state.run.currentFloor)` (from `arenas.ts`, already imported in similar files) to pick the stage. Store the reduction as a negative `upgradeBonus` or just set `.atk` directly — check how `itemDisplayName`/`itemMeltValue` read `upgradeBonus` before choosing, so the Inventory UI and melt value don't show something confusing like a signature weapon with a negative bonus suffix.

### 2. Small flat ATK bonuses are noise at the new ATK-32 ceiling
These were tuned against the old ATK 3-14 range and need roughly the same ~2.3x scale-up the weapon table got:
- `BLOOD_ANVIL_ATK_BONUS = 2` (`content.ts`) — Cursed Rift's Blood-Infused Anvil event. Suggest 4-5.
- Chrono-Anvil's "Upgrade" outcome, `state.run.equippedWeapon.atk += 2` / `upgradeBonus += 2` (`chronoAnvil.ts` line ~38-39). Suggest 4-5, matching whatever Blood Anvil lands on for consistency (both are "+X permanent ATK" events).
- `ELITE_DROP_ATK_BONUS_EARLY/MID/LATE` ranges `[1,2]/[1,3]/[2,4]` (`content.ts` ~line 1212-1214). Suggest roughly doubling each range's min/max.
- `GIANTS_ANVIL_ATK = 5` (`inventory.ts` line 133) — also update its label text at `content.ts`'s `RELIC_EFFECT_TEXT.giants_anvil` (~line 733, currently "ATK: +5 flat") to match. Suggest 10-12.

After changing these, spot-check `itemMeltValue` (`content.ts`) and the Inventory/Status tab displays still read sanely with the new bonus magnitudes (they scale off `upgradeBonus`, so should just work, but verify live).

**Verification:** dev-warp + Cheat Mode as used last session; no new mechanics here, just numeric tuning, so a typecheck plus a quick visual check of a Mk I mini-boss kill's dropped weapon ATK and a Blood Anvil/Chrono-Anvil accept is enough — no need to re-drive every boss floor again.
