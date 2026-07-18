export type Element = 'PHYSICAL' | 'FIRE' | 'VOLT' | 'FROST' | 'CHRONO';
export type StatusEffect = 'NONE' | 'BURN' | 'STUN' | 'CHILLED';

// Total ATK = PLAYER_BASE_ATK + equippedWeapon.atk. Total DEF = PLAYER_BASE_DEF + accessory bonuses.
export const PLAYER_BASE_ATK = 2;
export const PLAYER_BASE_DEF = 0;

export interface GameState {
  persistent: {
    rngSeed: number;         // Dungeon layout derives from hash(rngSeed, floorNumber); New Game = new seed.
    loopCount: number;       // Total loops attempted on this save
    echoes: number;          // Currency spent on upgrades and skills
    maxHpUpgrade: number;    // +5 max HP per level
    maxStamUpgrade: number;  // +2 max Stamina per level
    turnBonusUpgrade: number;// +5 turns per level
    baseAtkUpgrade: number;  // +1 ATK per level (5 levels, own cost curve — shop.ts)
    skills: Record<string, number>; // Level 0 = locked, 1-3 = unlocked/upgraded; new saves start with { dash: 1 }
    // The player's Q/E/R/F loadout. `run.activeSkills` is seeded from this on
    // every loop start; menus.ts writes back here on reassignment.
    skillLoadout: string[];
    // Biome start floors (11, 21, 31, ...) pinned by collected Temporal
    // Anchors — permanent warp destinations for the Hub's Shortcut Gate.
    unlockedAnchors: number[];
    stats: {
      deepestFloor: number;
      bestTurnsRemaining: number; // On victory
      wins: number;
    };
    // Monster kinds actually encountered (an enemy waking up marks it known)
    // — the Bestiary reads as field notes filled in, not a spoiler dump.
    bestiaryKnown: string[];
    // Incremented each time New Game+ is chosen from VICTORY; content.ts scales enemy HP by this.
    ngPlusLevel: number;
    // Auto-heals to full HP at the end of every turn while on. Lives in
    // `persistent` so it survives a loop reset; only a full New Game clears it.
    cheatModeEnabled: boolean;
  };

  run: {
    currentHp: number;
    maxHp: number;
    currentStamina: number;
    maxStamina: number;
    turnsRemaining: number;  // Per-floor counter: refilled to 100 + turnBonusUpgrade*5 on
                             // floor entry; frozen while currentFloor === 0.
    currentFloor: number;    // 0 = Hub, 1-99 (99 = Chrono-Lich arena)
    startFloor: number;      // Floor this run began on (1, or an anchored Biome start via the Shortcut Gate)
    playerX: number;
    playerY: number;
    facing: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT'; // Last direction moved; directional skills fire this way

    inventory: Item[];         // Max 25 slots (5x5 grid) — see inventory.ts's INVENTORY_CAP
    equippedWeapon: Weapon | null;
    equippedAccessory: Accessory | null;
    activeSkills: string[];    // Up to 4 skill IDs mapped to hotkeys Q/E/R/F, seeded each loop from persistent.skillLoadout
    status: StatusEffect;
    statusTurns: number;

    // +1 DEF until the player's next turn. Kept separate from `status` so it can coexist with Burn/Stun/Chilled.
    braced: boolean;
    // Ice Aegis shield charges (blocks the next N attacks) and whether Lvl3's
    // "attackers are Chilled" is active for the current shield.
    iceAegisCharges: number;
    iceAegisChillsAttacker: boolean;

    floorDamageTaken: boolean;      // Cleared on floor entry; set on any HP loss (Flawless Floor bonus).
    floorsVisitedThisLoop: number[]; // Floor numbers already awarded the "first reached" bonus this loop.

    // Save the Queen's negate_first_hit_per_floor passive — cleared on floor
    // entry, consumed by the first HP-damage instance taken on that floor.
    floorFirstHitNegated: boolean;

    // Usage-count buffs — count down by *actions*, not turns (unlike the StatusEffect above).
    quicksilverCharges: number; // Quicksilver Flask: next N moves/attacks cost 0 turns.
    whetstoneCharge: boolean;   // Whetstone: next weapon attack deals 2x damage.

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

    // Infinite-stacking passives, never equipped — picked up (drops/Elite
    // kills/Cursed Rifts), effect lasts the rest of the run. IDs into content.ts's RELICS.
    relics: string[];
    // Static Generator relic: steps since the last charge, and whether the
    // next attack is primed to auto-Stun (consumed on hit).
    staticGenSteps: number;
    staticGenCharged: boolean;
    // Troll Blood relic: real dungeon turns since its last auto-heal tick (Hub excluded).
    trollBloodCounter: number;
  };

  // Regenerated deterministically on floor entry.
  dungeon: {
    width: number;
    height: number;
    tiles: number[][];       // 0 Void, 1 Floor, 2 Wall, 3 Door, 4 Stairs, 5 Shortcut Gate
                             // (Hub only), 6 Boss Gate, 7 Fire Hazard, 8 Shop Terminal
                             // (Hub only), 9 Frost Hazard. Cursed Rift is NOT a tile value — see riftX/Y.
    enemies: Enemy[];
    items: WorldItem[];
    // This floor's spawn point (Recall Rune teleports back here). Set once on
    // floor entry since the player moves away from it.
    spawnX: number;
    spawnY: number;
    // This floor's Stairs position, mirroring spawnX/Y — lets a [Wealthy]
    // Elite (enemyAI.ts) flee toward a fixed target without re-scanning the
    // grid. Meaningless on Hub/Arena/Boss floors; set equal to spawnX/Y there.
    stairsX: number;
    stairsY: number;
    // This floor's Cursed Rift, if any (null = none). A coordinate marker,
    // not a `tiles` grid entry — baking it into the grid risked landing on
    // the single corridor connecting spawn to Stairs and flagging the floor
    // unreachable to verify-phase1.ts's walkability check.
    riftX: number | null;
    riftY: number | null;
    // Player-created tile mutations (Flame Arc Lvl 3's Fire Hazard, Ice-
    // Barricade Scroll). Kept off the deterministic `tiles` grid — `tileType`
    // is what render.ts/isWalkable treat the tile as while active, restored on expiry.
    expiringTiles: { x: number; y: number; turnsLeft: number; tileType: number }[];
    // Telegraphed AOE warning tiles (Chrono-Lich Time-Blast; Cinder-Shaman's
    // firebomb; Frost-Sentinel's cross pulse): marked N turns before they
    // detonate. `payload` picks what detonation does (turnController.ts's
    // tickTelegraphTiles): 'stun' matches Time-Blast; 'fire_aoe' deals ATK
    // Fire damage + leaves a Fire Hazard; 'chill_pulse' deals ATK Frost
    // damage + a 50% Chilled roll.
    telegraphTiles: {
      x: number;
      y: number;
      turnsUntil: number;
      payload: 'stun' | 'fire_aoe' | 'chill_pulse';
      sourceAttack: number;
      // 'fire_aoe' only: true for the single center tile of the 3x3 (or 5x5,
      // Inferno-Golem's Magma Slam) that also leaves a Fire Hazard on detonation.
      hazard?: boolean;
      // 'fire_aoe' + hazard only: how long that Fire Hazard burns — Cinder-
      // Shaman's firebomb (2) vs. Inferno-Golem's Magma Slam (3). Defaults to 2 if omitted.
      hazardTurns?: number;
    }[];
  };

  ui: {
    // 'MENU' is the unified Status/Inventory/Chronofacts/Skill/Bestiary/
    // Settings&Help overlay — the current tab lives in menus.ts's own
    // module-level `menuTab`, not here, since it's pure UI-navigation state.
    // 'CONFIRM' replaces window.confirm() for the Boss Gate Threshold Warning
    // and New Game. 'SHORTCUT_GATE' is the Hub's destination picker.
    // 'CURSED_RIFT' is the sacrifice-pact modal.
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
    // Deep-Biome Regulars: first appear Biome 3+.
    | 'BONE_KNIGHT'
    | 'CINDER_SHAMAN'
    | 'VOLT_HOUND'
    | 'FROST_SENTINEL'
    // Mini-Bosses: fixed Arena floors 10/20/30, plus empowered Mk II/III
    // repeats on floors 40-90 (same kind, scaled at spawn — arenas.ts).
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

  // Defuse/Slow: temporary stat overrides, restored to the stashed original
  // value once their timer runs out. Absent (not 0) if never hit by either.
  defuseTurnsLeft?: number;
  defuseOriginalDef?: number;
  slowTurnsLeft?: number;
  slowOriginalSpeed?: number;

  // Elite Affixes: a normal enemy has a 10% spawn chance (mapgen.ts) to roll
  // one of content.ts's ELITE_AFFIXES instead, guaranteeing a Relic-or-Tier-3
  // drop. Absent on every non-Elite enemy.
  affix?: string;
  // [Shielded] only: hits remaining before damage lands normally. Set to 3 at
  // spawn, decremented in combat.ts, never restored.
  shieldedHitsLeft?: number;
}

export interface Item {
  id: string;
  // 'RELIC' joins 'ANCHOR'/'TIME_SHARD' as an instant-pickup kind — never
  // occupies an inventory slot (inventory.ts's pickupItemsAt adds it straight
  // to `run.relics` and removes the WorldItem).
  kind: 'WEAPON' | 'ACCESSORY' | 'POTION' | 'CONSUMABLE' | 'ANCHOR' | 'TIME_SHARD' | 'RELIC';
  name: string;
  value: number;             // Heal amount for potions; +turns for Time Shards; unused otherwise
  // POTION/CONSUMABLE instances merge into one slot when a matching (same
  // `name`) item is already held — undefined/1 both mean "not stacked."
  // Weapons/Accessories never stack; Anchors/Time Shards never occupy a slot.
  count?: number;
  // POTION sub-kind discriminator (heal_flat / heal_percent_max /
  // heal_percent_max_cleanse / permanent_max_hp) — mirrors Consumable's
  // required `effect` below, kept optional here so POTION can reuse the same
  // dispatch shape without a dedicated Potion subtype.
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

/** The 8 Tactical Consumables — always 1 turn to use, in or out of combat,
 * unlike Potions (0 turns out of combat). `Item.kind` for these is
 * 'CONSUMABLE'; the base Potion stays its own 'POTION' kind. */
export interface Consumable extends Item {
  kind: 'CONSUMABLE';
  effect: string;            // ID of the specific effect
}

export interface WorldItem {
  item: Item;
  x: number;
  y: number;
  // True for mapgen-placed loot chests (not the Anchor). Contents reroll
  // from gameplay RNG at pickup time, so they vary loop to loop while the chest's position stays seeded.
  chestLoot?: boolean;
}
