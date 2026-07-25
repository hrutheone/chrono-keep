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
Follow-up balance pass on two leftovers flagged at the end of the 10x weapon curve overhaul. Reviewed with advisor, then item 1's approach was revised again: mini-boss weapons become 9 real tiered catalog items instead of one weapon key with a runtime ATK clamp.

### 1. Mini-Boss signature-weapon drops: split into 3 real tiered items per boss
**Superseded design decision:** instead of one weapon key with a runtime ATK clamp/bonus (the earlier version of this plan), create 9 genuinely separate `WEAPONS` entries — 3 per mini-boss, one per Mk stage — each with its own fixed, tier-appropriate ATK. This is simpler than the clamp approach and sidesteps every workaround that approach needed (no `bossStage` field, no display-suffix hack, no Elite-bucket-by-stage question — all moot once each tier is its own catalog item).

**Add, don't replace.** Keep the existing `IFRITS_BLADE` (ATK 11), `BLITZ_WHIP` (ATK 16), and `ICE_BRAND` (ATK 16) entries exactly as they are — they stay in `MID_TIER_WEAPON_KEYS`/`LATE_TIER_WEAPON_KEYS` and remain reachable through the general pool (Elite drops, Chrono-Anvil, chests via `rollWeaponForDepth`, the Predator/Shadow floor events). The 9 new entries are a separate, exclusive trophy set only obtainable by killing that mini-boss — **do not** add them to `EARLY_TIER_WEAPON_KEYS`/`MID_TIER_WEAPON_KEYS`/`LATE_TIER_WEAPON_KEYS` or any chest pool, or they'd start showing up as generic loot and lose their "boss-only" identity.

**New `WEAPONS` entries** (`content.ts`), same element/passive/lore per family as the existing weapon, ATK set to one tier ceiling above the standard band so a boss trophy always beats an equivalent chest find:
| Key | Name | ATK | Element | Passive |
|---|---|---|---|---|
| `IFRITS_BLADE_I` | Ifrit's Blade I | 7 | Fire | `cleave_3_front` |
| `IFRITS_BLADE_II` | Ifrit's Blade II | 16 | Fire | `cleave_3_front` |
| `IFRITS_BLADE_III` | Ifrit's Blade III | 28 | Fire | `cleave_3_front` |
| `BLITZ_WHIP_I` | Blitz Whip I | 7 | Volt | `chain_lightning_1` |
| `BLITZ_WHIP_II` | Blitz Whip II | 16 | Volt | `chain_lightning_1` |
| `BLITZ_WHIP_III` | Blitz Whip III | 28 | Volt | `chain_lightning_1` |
| `ICE_BRAND_I` | Ice Brand I | 7 | Frost | `chill_spread_on_kill` |
| `ICE_BRAND_II` | Ice Brand II | 16 | Frost | `chill_spread_on_kill` |
| `ICE_BRAND_III` | Ice Brand III | 28 | Frost | `chill_spread_on_kill` |

(7 = Early Tier ceiling of 6, +1; 16 = Mid Tier ceiling of 15, +1, which also happens to land exactly on the Late Tier floor; 28 = a strong Late Tier value, above Masamune's 26 but below Apocalypse's 30 and the Ultimate Elemental chase weapons' 32 — trophies stay special without dethroning the actual best-in-slot weapons.) These are proposed numbers, not locked — sanity-check them against a real Mk I/II/III fight before committing.

**Wiring (`combat.ts`):** change `MINI_BOSS_WEAPON` from `Partial<Record<Enemy['kind'], WeaponKey>>` to one keyed by kind with a 3-tuple of keys (Mk I/II/III in order), then in `killEnemy`'s mini-boss branch index it with `miniBossRepeatNumber(state.run.currentFloor)` (import from `arenas.ts`) instead of a flat lookup. Drop the `applyEliteWeaponBonus(weapon, state.run.currentFloor)` call for this branch entirely — these are fixed trophies now, not a base + random roll.

**No changes needed** to `itemDisplayName`, `loreForItem`, or `itemMeltValue`'s name-matching lookups — since each tier is a real `WEAPONS` entry with its own name, the existing `for (const w of Object.values(WEAPONS))` loops that build `LORE_BY_NAME` etc. pick them up automatically. Add lore text for each new entry (can reuse the family's existing flavor line, lightly reworded per tier, or keep identical — writer's call).

**Verify before landing:** `combat.ts` importing `miniBossRepeatNumber` from `arenas.ts` adds an edge into an *existing* circular reference (`combat.ts` -> `mapgen.ts` -> `combat.ts` already exists today) rather than creating a new one, so it should be safe, but confirm with a typecheck and a live mini-boss kill rather than assuming — import cycles can produce `undefined`-at-module-eval bugs that `tsc` won't catch.

Every mini-boss kill also drops a fixed bundle regardless of floor: 1 Temporal Anchor (`value: 0`, a checkpoint unlock — no stat to scale), 2 Time Shards (`value: 5` Turns each), and a flat 25 Echoes (`combat.ts`'s `killEnemy`). Only the Echoes need a fix — see item 2.

### 2. Flat/random ATK bonuses need to scale with floor and skew low, not just get bigger
Tuned against the old ATK 3-14 range; amended to scale with depth and to weight rolls toward the low end instead of a flat or uniform bump:

- **Blood-Infused Anvil** (`BLOOD_ANVIL_ATK_BONUS`, `content.ts`) and **Chrono-Anvil's "Upgrade" outcome** (`upgradeBonus += 2` / `atk += 2`, `chronoAnvil.ts` ~line 38-39): both become floor-scaled, 1-8, and matched to the same formula so the two "+X permanent ATK" events feel consistent. Add one shared helper next to `depthMultiplier`/`biomeOf` in `content.ts` (same file already doing floor-based scaling for Echo bounties):
  ```
  export function floorScaledAtkBonus(floorNumber: number): number {
    return Math.min(8, 1 + Math.floor((floorNumber - 1) / 14));
  }
  ```
  This gives floor 1 -> 1, floor 99 -> 8, in 8 even steps. Call it from both `resolveBloodAnvil` (`cursedRift.ts`) and the Chrono-Anvil "Upgrade" branch (`chronoAnvil.ts`), passing `state.run.currentFloor`.

- **Elite weapon drops** (`ELITE_DROP_ATK_BONUS_EARLY/MID/LATE`, `content.ts` ~line 1212-1214): new ranges Early `[1,3]`, Mid `[1,6]`, Late `[1,8]`. Also reroll `getRandomBonus` (`content.ts`, next to those constants) so higher values in a range are rarer than lower ones — a flat `[1,3]` roll shouldn't hand out +3 as often as +1. Skew with a quadratic bias toward the low end instead of building a full weighted table:
  ```
  function getRandomBonus(min: number, max: number): number {
    return min + Math.floor((max - min + 1) * Math.random() ** 2);
  }
  ```
  Squaring `Math.random()` before scaling concentrates rolls near `min`; e.g. for `[1,8]`, +1/+2 come up far more often than +7/+8. Sanity-check the distribution live (roll it ~20 times via Dev Tools' Elite spawns, or a throwaway console loop) rather than trusting the formula blind.

- **Mini-Boss kill's flat 25 Echoes** (`combat.ts`'s `killEnemy`, mini-boss branch — `awardEchoes(state, 25, 'Mini-Boss kill')`): this is the same reward channel `enemyKillBounty`/`flawlessFloorBonus` already scale via `depthMultiplier`, and it's currently the one exception still flat. Shop costs run 50 -> 15000+ across the game, so a flat 25 is meaningful at F10 and rounds to noise by F90. Fix: `awardEchoes(state, Math.round(25 * depthMultiplier(state.run.currentFloor)), 'Mini-Boss kill')` (`depthMultiplier` already exported from `content.ts`) — ~25 at F10 scaling to ~93 at F90. **Leave the Anchor and 2 Time Shards flat** — the Anchor has no stat to scale (`value: 0`, a checkpoint unlock), and Time Shards are measured against the 100-turn floor budget, which is a fixed constant at every depth per Game.md, so a flat bonus stays proportionally the same at F10 or F90 — no scaling problem to fix there.

After changing these, spot-check `itemMeltValue` and the Inventory/Status tab displays still read sanely with the new bonus magnitudes (they scale off `upgradeBonus`, so should just work, but verify live).

**Verification:** dev-warp + Cheat Mode as used last session; typecheck, then a quick visual check of one kill per Mk stage on at least one mini-boss (confirm the right tiered item name/ATK drops and the scaled Echo reward), a Blood Anvil/Chrono-Anvil accept at a low vs. high floor (confirm the 1-8 scaling), and a handful of Elite kills to eyeball the low-end skew — no need to re-drive all 9 boss/stage combinations or every arena floor again.
