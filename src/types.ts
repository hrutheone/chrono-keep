// Game State Schema (GDD Section 3), transcribed verbatim.

export type Element = 'PHYSICAL' | 'FIRE' | 'VOLT' | 'FROST' | 'CHRONO';
export type StatusEffect = 'NONE' | 'BURN' | 'STUN' | 'CHILLED';

// Player baseline (constants, not saved): PLAYER_BASE_ATK = 2, PLAYER_BASE_DEF = 0.
// Total ATK = PLAYER_BASE_ATK + equippedWeapon.atk. Total DEF = PLAYER_BASE_DEF + accessory bonuses.
export const PLAYER_BASE_ATK = 2;
export const PLAYER_BASE_DEF = 0;

export interface GameState {
  persistent: {
    rngSeed: number;         // Seeded ONCE per save; dungeon layout is derived
                             // from hash(rngSeed, floorNumber) so it is identical
                             // across loops. New Game = new seed.
    loopCount: number;       // Total loops attempted on this save
    echoes: number;          // Currency spent on upgrades and skills
    // Permanent Stat Upgrades
    maxHpUpgrade: number;    // +5 max HP per level
    maxStamUpgrade: number;  // +2 max Stamina per level
    turnBonusUpgrade: number;// +5 turns per level
    baseAtkUpgrade: number;  // +1 ATK per level (5 levels, its own cost curve — shop.ts)
    // Skill Unlocks & Upgrades (Level 0 = locked, 1-3 = unlocked/upgraded)
    skills: Record<string, number>; // New saves start with { dash: 1 }
    // Small Improvements: the player's Q/E/R/F loadout, persisted so it
    // survives a loop reset instead of collapsing back to just Dash on Q
    // every time. `run.activeSkills` is seeded from this on every loop start
    // (state.ts) and menus.ts writes back here whenever the player reassigns
    // a slot.
    skillLoadout: string[];
    // 99-Floor Descent (Section 7): Biome start floors (11, 21, 31, ...)
    // pinned by collected Temporal Anchors — permanent warp destinations for
    // the Hub's Shortcut Gate. Replaces the old per-floor unlockedShortcuts.
    unlockedAnchors: number[];
    stats: {
      deepestFloor: number;
      bestTurnsRemaining: number; // On victory
      wins: number;
    };
    // Fun & Feel #1: monster kinds the player has actually encountered (an
    // enemy waking up marks it known) — the Bestiary tab reads as field notes
    // being filled in, not a spoiler dump from turn 1.
    bestiaryKnown: string[];
    // Fun & Feel #8: New Game+ escalation. Incremented each time New Game+ is
    // chosen from VICTORY; content.ts scales enemy HP by this.
    ngPlusLevel: number;
    // Testing/QA toggle (Inventory screen): auto-heals to full HP at the end
    // of every turn while on, so a tester can walk through content without
    // dying. Lives in `persistent` (not `run`) so it survives a loop reset —
    // exactly when a tester is most likely to still want it on — and only a
    // full New Game wipes it.
    cheatModeEnabled: boolean;
  };

  // Active Run State (Reset each loop)
  run: {
    currentHp: number;
    maxHp: number;
    currentStamina: number;
    maxStamina: number;
    turnsRemaining: number;  // PER-FLOOR counter (Section 7): refilled to
                             // 100 + turnBonusUpgrade*5 on every floor entry;
                             // frozen (never decrements) while currentFloor === 0.
    currentFloor: number;    // 0 = Hub (Watchwarden's Post, Phase 13), 1-99 (Floor 99 = Chrono-Lich arena)
    startFloor: number;      // Floor this run began on (1, or an anchored
                             // Biome start via the Hub's Shortcut Gate — Phase 13)
    playerX: number;
    playerY: number;
    facing: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT'; // Last direction moved; directional skills fire this way

    // Inventory & Equipment System
    inventory: Item[];         // Max 25 slots (5x5 grid) — see inventory.ts's INVENTORY_CAP
    equippedWeapon: Weapon | null;
    equippedAccessory: Accessory | null;
    activeSkills: string[];    // Up to 4 skill IDs mapped to hotkeys Q/E/R/F
                                // (Small Improvements); seeded each loop from
                                // persistent.skillLoadout.
    status: StatusEffect;
    statusTurns: number;

    // Section 7/8 Tactical Brace: +1 DEF until the start of the player's next
    // turn. Kept separate from `status` so it can coexist with Burn/Stun/Chilled.
    braced: boolean;
    // Ice Aegis shield charges (blocks the next N attacks) and whether Lvl3's
    // "attackers are Chilled" is active for the current shield.
    iceAegisCharges: number;
    iceAegisChillsAttacker: boolean;

    // Section 7 Echo Economy bookkeeping for the current loop.
    floorDamageTaken: boolean;      // Cleared on floor entry; set on any HP loss (Flawless Floor bonus).
    floorsVisitedThisLoop: number[]; // Floor numbers already awarded the "first reached" bonus this loop.

    // Phase 18: Save the Queen's negate_first_hit_per_floor weapon passive —
    // cleared on floor entry (mirrors floorDamageTaken's reset), consumed by
    // the first HP-damage instance the player takes on that floor.
    floorFirstHitNegated: boolean;

    // Phase 8 usage-count buffs (Section 8: distinct from the turn-duration
    // StatusEffect above — these count down by *actions*, not turns).
    quicksilverCharges: number; // Quicksilver Flask: next N moves/attacks cost 0 turns.
    whetstoneCharge: boolean;   // Whetstone: next weapon attack deals 2x damage.

    // Phase 18 (20-skill roster) support state:
    recallMarkX: number | null; // Recall: the marked tile to teleport back to (null = unmarked).
    recallMarkY: number | null;
    vanishCharges: number;      // Vanish: next N moves ignore wall collision.
    reflectBarrierCharges: number; // Reflect Barrier: blocks next N hits, reflecting 3x ATK.
    reflectBarrierStuns: boolean;  // Reflect Barrier Lv3: the reflected hit also Stuns.
    tempAtkBonus: number;       // Chakra Lv3's temporary +ATK...
    tempAtkBonusTurns: number;  // ...and how many Tick Phases it has left.
    tempDefBonus: number;       // Provoke's temporary +DEF...
    tempDefBonusTurns: number;  // ...and how many Tick Phases it has left.
    statusImmuneTurns: number;  // Aura: blocks new Burn/Stun/Chilled while > 0.

    // Phase 19 (Chronofacts): infinite-stacking passives, never equipped —
    // picked up (drops/Elite kills/Cursed Rifts), added here immediately,
    // effect lasts the rest of the run. IDs into content.ts's RELICS.
    relics: string[];
    // Static Generator relic support: steps since the last charge, and
    // whether the next attack is primed to auto-Stun (consumed on hit).
    staticGenSteps: number;
    staticGenCharged: boolean;
    // Troll Blood relic support: real dungeon turns since its last auto-heal
    // tick (Hub excluded, same as every other Tick-Phase-gated counter).
    trollBloodCounter: number;
  };

  // Map and Entities (regenerated deterministically on floor entry)
  dungeon: {
    width: number;
    height: number;
    tiles: number[][];       // 0 = Void, 1 = Floor, 2 = Wall, 3 = Door,
                             // 4 = Exit (stairs), 5 = Shortcut Gate (Hub only), 6 = Boss Gate,
                             // 7 = Fire Hazard (from Flame Arc Lvl 3 / boss),
                             // 8 = Shop Terminal (Hub only, Phase 13),
                             // 9 = Frost Hazard (Scourge skill). Cursed Rift
                             // (Phase 19) is NOT a tile value — see riftX/Y below.
    enemies: Enemy[];
    items: WorldItem[];
    // This floor's spawn point (Section 8 Phase 8: Recall Rune teleports back
    // here). Set once on floor entry; the player moves away from it, so it
    // has to be persisted somewhere reachable rather than re-derived.
    spawnX: number;
    spawnY: number;
    // Phase 19: this floor's Stairs position, mirroring spawnX/Y — needed so
    // a [Wealthy] Elite (enemyAI.ts) can flee toward a fixed target instead
    // of re-scanning the tile grid every activation. Meaningless on the Hub/
    // Arena/Boss floors (no Stairs there); set equal to spawnX/Y on those,
    // same "set even where nothing can use it" precedent as spawnX/Y itself.
    stairsX: number;
    stairsY: number;
    // Phase 19: this floor's Cursed Rift, if any (null = none this floor).
    // Deliberately a coordinate marker, NOT a `tiles` grid entry — every
    // other "special" tile the deterministic generator can place (Stairs
    // aside) is either hand-authored-Hub-only or a play-time-only overlay
    // (expiringTiles); baking one into a procedural floor's tiles grid
    // risked it landing on the single corridor tile connecting spawn to
    // Stairs and (per verify-phase1.ts's independent walkability check,
    // which deliberately doesn't know about tile types outside FLOOR/DOOR/
    // STAIRS) flagging the floor as unreachable. A coordinate sitting on
    // top of an ordinary FLOOR tile can never do that.
    riftX: number | null;
    riftY: number | null;
    // Player-created tile mutations (Flame Arc Lvl 3's Fire Hazard, Phase 8's
    // Ice-Barricade Scroll). Kept off the deterministic `tiles` grid entirely
    // — `tileType` is what render.ts/isWalkable treat the tile as while it's
    // active; restored to the original tile on expiry.
    expiringTiles: { x: number; y: number; turnsLeft: number; tileType: number }[];
    // Telegraphed AOE warning tiles (Phase 6 Chrono-Lich Time-Blast; Phase 14
    // Cinder-Shaman's firebomb / Frost-Sentinel's cross pulse): marked N turns
    // before they detonate, then cleared. `payload` picks what detonation does
    // (turnController.ts's tickTelegraphTiles): 'stun' matches the original
    // Time-Blast; 'fire_aoe' deals ATK Fire damage + leaves a Fire Hazard;
    // 'chill_pulse' deals ATK Frost damage + a 50% Chilled roll.
    telegraphTiles: {
      x: number;
      y: number;
      turnsUntil: number;
      payload: 'stun' | 'fire_aoe' | 'chill_pulse';
      sourceAttack: number;
      // 'fire_aoe' only: true for the single center tile of the 3x3 (or 5x5,
      // Inferno-Golem's Mk II+ Magma Slam) that also leaves a Fire Hazard on
      // detonation (the other tiles just deal damage).
      hazard?: boolean;
      // 'fire_aoe' + hazard only: how long that Fire Hazard burns — Cinder-
      // Shaman's firebomb (2) vs. Inferno-Golem's Magma Slam (3). Defaults to
      // 2 (Phase 14 behavior) if omitted.
      hazardTurns?: number;
    }[];
  };

  // Engine state
  ui: {
    // 'MENU' is the unified Status/Inventory/Chronofacts/Skill/Bestiary/
    // Settings&Help overlay (menus.ts's renderMenu) — the tab currently shown
    // lives in menus.ts's own module-level `menuTab`, not in this schema,
    // since it's pure UI-navigation state with no gameplay meaning.
    // 'CONFIRM' (Fun & Feel #6) replaces window.confirm()'s native dialog with
    // a styled overlay for the Boss Gate Threshold Warning and New Game.
    // 'SHORTCUT_GATE' (Phase 13): the Hub's destination picker, opened by
    // stepping onto the Shortcut Gate tile — Floor 1 plus every unlocked Anchor.
    // 'CURSED_RIFT' (Phase 19): the sacrifice-pact modal, opened by stepping
    // onto a procedural floor's Cursed Rift tile.
    currentScreen: 'TITLE' | 'GAME' | 'MENU' | 'UPGRADE_SHOP' | 'SHORTCUT_GATE' | 'CURSED_RIFT' | 'CONFIRM' | 'DEATH' | 'VICTORY';
    log: string[];           // Message log for combat actions (last 3 shown in HUD)
  };
}

export interface Enemy {
  id: string;
  kind:
    | 'BONE_GRUNT'
    | 'EMBER_BAT'
    | 'VOLT_TURRET'
    | 'FROST_WRAITH'
    | 'TIME_WEAVER'
    | 'CHRONO_LICH'
    // Deep-Biome Regulars (GDD Section 6C, Phase 14): first appear Biome 3+.
    | 'BONE_KNIGHT'
    | 'CINDER_SHAMAN'
    | 'VOLT_HOUND'
    | 'FROST_SENTINEL'
    // Mini-Bosses (GDD Section 6C, Phase 15): fixed Arena floors 10/20/30,
    // and their empowered Mk II/III repeats on floors 40-90 (same kind,
    // scaled at spawn — see arenas.ts's miniBossRepeatMultiplier).
    | 'INFERNO_GOLEM'
    | 'STORM_CALLER'
    | 'GLACIAL_KNIGHT';
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  element: Element;          // Its own element; weakness & resistance derive from the Elemental Wheel
  weakness: Element | null;  // Cached from the wheel: the element that beats this one (null for Chrono)
  speed: number;             // Tiles moved per turn (0 = stationary)
  awake: boolean;            // Set true when player enters activation radius
  status: StatusEffect;      // Enemies can be Burned/Stunned/Chilled too
  statusTurns: number;

  // Phase 18 (Defuse/Slow skills): temporary stat overrides, restored to the
  // stashed original value once their timer runs out. Optional — absent
  // (rather than 0) on every enemy that's never been hit by either skill.
  defuseTurnsLeft?: number;
  defuseOriginalDef?: number;
  slowTurnsLeft?: number;
  slowOriginalSpeed?: number;

  // Phase 19 Elite Affixes: a normal enemy has a 10% spawn chance (mapgen.ts)
  // to roll one of content.ts's ELITE_AFFIXES instead — a randomized prefix
  // that modifies behavior/stats and guarantees a Relic-or-Tier-3-Weapon
  // drop. Absent (not 'none') on every non-Elite enemy.
  affix?: string;
  // [Shielded] only: hits remaining before damage starts landing normally.
  // Set to 3 at spawn, decremented in combat.ts, never restored.
  shieldedHitsLeft?: number;
}

export interface Item {
  id: string;
  // Phase 19: 'RELIC' joins 'ANCHOR'/'TIME_SHARD' as an instant-pickup kind —
  // never occupies an inventory slot (inventory.ts's pickupItemsAt adds it
  // straight to `run.relics` and removes the WorldItem).
  kind: 'WEAPON' | 'ACCESSORY' | 'POTION' | 'CONSUMABLE' | 'ANCHOR' | 'TIME_SHARD' | 'RELIC';
  name: string;
  value: number;             // Heal amount for potions; +turns for Time Shards; unused otherwise
  // Phase 18 Inventory Stacking: POTION/CONSUMABLE instances merge into one
  // slot when a matching (same `name`) item is already held — undefined/1
  // both mean "not stacked." Weapons/Accessories never stack (equip-only,
  // one at a time); Anchors/Time Shards never occupy a slot at all (instant
  // pickup effects), so `count` is meaningless for them.
  count?: number;
  // Phase 18: POTION sub-kind discriminator (heal_flat / heal_percent_max /
  // heal_percent_max_cleanse / permanent_max_hp) — mirrors Consumable's own
  // required `effect` below, kept optional on the base Item so POTION can
  // reuse the same dispatch shape without a dedicated Potion subtype.
  effect?: string;
}

export interface Weapon extends Item {
  kind: 'WEAPON';
  atk: number;
  element: Element;
  passive: string;           // ID of special effect (see Weapons table)
}

export interface Accessory extends Item {
  kind: 'ACCESSORY';
  passive: string;           // ID of passive effect (see Accessories table)
}

/** Section 6E's 8 Tactical Consumables (Phase 8) — always 1 turn to use, in or
 * out of combat, unlike Potions (0 turns out of combat, see Section 7).
 * `Item.kind` for these is 'CONSUMABLE'; the base Potion stays 'POTION'
 * (a Phase 3-era kind, kept as-is rather than folded into this to avoid
 * touching already-working equip/pickup code for no behavioral gain). */
export interface Consumable extends Item {
  kind: 'CONSUMABLE';
  effect: string;            // ID of the specific effect (see Section 6E's table)
}

export interface WorldItem {
  item: Item;
  x: number;
  y: number;
  // Section 7 Dynamic Chest Loot: true for mapgen-placed loot chests (not the
  // Anchor). Contents are rerolled from gameplay RNG at pickup time so a
  // chest's *contents* vary loop to loop while its *position* stays seeded.
  chestLoot?: boolean;
}
