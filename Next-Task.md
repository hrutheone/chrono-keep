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
Follow-up balance pass on two leftovers flagged at the end of the 10x weapon curve overhaul. Reviewed with advisor and amended with floor-scaled/weighted-roll requirements — item 1's implementation approach is now a decision, not an open question.

### 1. Mini-Boss signature-weapon drops break the tier curve on Mk I floors
`combat.ts`'s `MINI_BOSS_WEAPON` map (~line 302) drops the *same* signature weapon every time a mini-boss dies, regardless of Mk stage:
- `INFERNO_GOLEM: 'IFRITS_BLADE'` (native ATK 11, Mid Tier) at F10/F40/F70.
- `STORM_CALLER: 'BLITZ_WHIP'` (native ATK 16, Late Tier) at F20/F50/F80.
- `GLACIAL_KNIGHT: 'ICE_BRAND'` (native ATK 16, Late Tier) at F30/F60/F90.

Every other reward channel in the game scales with floor — chest rolls (`rollWeaponForDepth`), Elite drops (`rollWeaponForDepth` + `applyEliteWeaponBonus`), even the boss's own HP/ATK/DEF (`BOSS_EVOLUTION`) — except this one hardcoded weapon key. The mini-boss kill already gets a jackpot bundle (Anchor + 2 Time Shards + 25 Echoes, `combat.ts` ~446-458) independent of the weapon, so the weapon spike reads as an oversight rather than intentional generosity. **Confirm this reading before implementing** — if the F10 Ifrit's Blade is deliberate, the actual fix is documenting it in Game.md instead, not touching `combat.ts`.

**ATK clamp (decided):** clamp `weapon.atk` with `Math.min`, not a negative `upgradeBonus`. A negative `upgradeBonus` breaks two things at once: `itemMeltValue` (`content.ts` ~802-821) computes `baseAtk = w.atk - bonus`, so a negative bonus inflates the apparent base and makes `bonusMelt = bonus * 20` negative; and `itemDisplayName` (~803-810) only special-cases a *truthy* bonus, so it would render as `"Ifrit's Blade +-5"`. Setting `.atk` directly avoids both.

Rule: after `createWeapon(weaponKey, ...)` but **before** `applyEliteWeaponBonus` runs (`combat.ts`'s mini-boss branch), clamp down by `miniBossRepeatNumber(state.run.currentFloor)` (from `arenas.ts`):
```
Mk I (repeat 0): weapon.atk = Math.min(weapon.atk, 6)   // Early Tier ceiling
Mk II (repeat 1): weapon.atk = Math.min(weapon.atk, 15) // Mid Tier ceiling
Mk III (repeat 2): no clamp                              // native ATK stands
```
Clamping *before* `applyEliteWeaponBonus` (not after) matters: the bonus should land on top of the tier-appropriate base, same as a normal chest-tier weapon roll, not get swallowed by a clamp applied afterward. This is also a plain no-op for weapons whose native ATK already sits at or under the stage's cap (e.g. Ifrit's Blade at Mk II/III) — no boss-specific special-casing needed.

**Naming:** add the Mk stage as a Roman-numeral suffix on display (e.g. "Ice Brand II"), so the player can tell which encounter a copy came from. Don't mutate `Weapon.name` itself — `loreForItem`, `itemMeltValue`, and `rollSameTierWeapon` all look up a weapon by matching `WEAPONS[key].name === w.name`, and a renamed item would silently fail every one of those lookups (lore disappears, melt value loses its tier bonus, Chrono-Anvil sidegrades break). Instead add a small optional field (e.g. `Weapon.bossStage?: 1 | 2 | 3`, set alongside the ATK clamp above) and extend `itemDisplayName` (`content.ts` ~803-810) to append it — after the existing `+N` bonus suffix, e.g. `"Ice Brand II +2"` — so the two suffixes compose instead of colliding.

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

After changing these, spot-check `itemMeltValue` and the Inventory/Status tab displays still read sanely with the new bonus magnitudes (they scale off `upgradeBonus`, so should just work, but verify live).

**Verification:** dev-warp + Cheat Mode as used last session; typecheck, then a quick visual check of a Mk I mini-boss kill's dropped weapon (ATK clamp + "II"/"III" suffix), a Blood Anvil/Chrono-Anvil accept at a low vs. high floor (confirm the 1-8 scaling), and a handful of Elite kills to eyeball the low-end skew — no need to re-drive every boss floor again.
