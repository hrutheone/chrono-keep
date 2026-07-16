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
    inventory: Item[];         // Max 10 slots (2x5 grid)
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

    // Phase 8 usage-count buffs (Section 8: distinct from the turn-duration
    // StatusEffect above — these count down by *actions*, not turns).
    quicksilverCharges: number; // Quicksilver Flask: next N moves/attacks cost 0 turns.
    whetstoneCharge: boolean;   // Whetstone: next weapon attack deals 2x damage.
  };

  // Map and Entities (regenerated deterministically on floor entry)
  dungeon: {
    width: number;
    height: number;
    tiles: number[][];       // 0 = Void, 1 = Floor, 2 = Wall, 3 = Door,
                             // 4 = Exit (stairs), 5 = Shortcut Gate (Hub only), 6 = Boss Gate,
                             // 7 = Fire Hazard (from Flame Arc Lvl 3 / boss),
                             // 8 = Shop Terminal (Hub only, Phase 13)
    enemies: Enemy[];
    items: WorldItem[];
    // This floor's spawn point (Section 8 Phase 8: Recall Rune teleports back
    // here). Set once on floor entry; the player moves away from it, so it
    // has to be persisted somewhere reachable rather than re-derived.
    spawnX: number;
    spawnY: number;
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
      // 'fire_aoe' only: true for the single center tile of the 3x3 that also
      // leaves a Fire Hazard on detonation (the other 8 tiles just deal damage).
      hazard?: boolean;
    }[];
  };

  // Engine state
  ui: {
    // 'HELP' added for Section 8's Quick Controls Help overlay (Phase 5); not
    // in the GDD's Section 3 enum literal, but required by Section 8's content.
    // 'CONFIRM' (Fun & Feel #6) replaces window.confirm()'s native dialog with
    // a styled overlay for the Boss Gate Threshold Warning and New Game.
    // 'SHORTCUT_GATE' (Phase 13): the Hub's destination picker, opened by
    // stepping onto the Shortcut Gate tile — Floor 1 plus every unlocked Anchor.
    currentScreen: 'TITLE' | 'GAME' | 'INVENTORY' | 'SKILL_MENU' | 'UPGRADE_SHOP' | 'SHORTCUT_GATE' | 'HELP' | 'CONFIRM' | 'DEATH' | 'VICTORY';
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
    | 'FROST_SENTINEL';
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
}

export interface Item {
  id: string;
  kind: 'WEAPON' | 'ACCESSORY' | 'POTION' | 'CONSUMABLE' | 'ANCHOR' | 'TIME_SHARD';
  name: string;
  value: number;             // Heal amount for potions; +turns for Time Shards; unused otherwise
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
