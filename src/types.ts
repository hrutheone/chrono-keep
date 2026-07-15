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
    unlockedShortcuts: string[];    // IDs of shortcut gates opened (stay open forever)
    stats: {
      deepestFloor: number;
      bestTurnsRemaining: number; // On victory
      wins: number;
    };
  };

  // Active Run State (Reset each loop)
  run: {
    currentHp: number;
    maxHp: number;
    currentStamina: number;
    maxStamina: number;
    turnsRemaining: number;
    currentFloor: number;    // 1 to 3, then Floor 4 (Boss Room)
    anchorsCollected: number;// Progress toward unlocking the boss gate (0 to 3)
    playerX: number;
    playerY: number;
    facing: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT'; // Last direction moved; directional skills fire this way

    // Inventory & Equipment System
    inventory: Item[];         // Max 10 slots (2x5 grid)
    equippedWeapon: Weapon | null;
    equippedAccessory: Accessory | null;
    activeSkills: string[];    // 2 skill IDs mapped to hotkeys Q and E
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
  };

  // Map and Entities (regenerated deterministically on floor entry)
  dungeon: {
    width: number;
    height: number;
    tiles: number[][];       // 0 = Void, 1 = Floor, 2 = Wall, 3 = Door,
                             // 4 = Exit (stairs), 5 = Shortcut Gate, 6 = Boss Gate,
                             // 7 = Fire Hazard (from Flame Arc Lvl 3 / boss)
    enemies: Enemy[];
    items: WorldItem[];
    // Player-created tile mutations (Flame Arc Lvl 3's Fire Hazard). Kept off
    // the deterministic `tiles` grid entirely; restored to FLOOR on expiry.
    expiringTiles: { x: number; y: number; turnsLeft: number }[];
  };

  // Engine state
  ui: {
    // 'HELP' added for Section 8's Quick Controls Help overlay (Phase 5); not
    // in the GDD's Section 3 enum literal, but required by Section 8's content.
    currentScreen: 'TITLE' | 'GAME' | 'INVENTORY' | 'SKILL_MENU' | 'UPGRADE_SHOP' | 'HELP' | 'DEATH' | 'VICTORY';
    log: string[];           // Message log for combat actions (last 3 shown in HUD)
  };
}

export interface Enemy {
  id: string;
  kind: 'BONE_GRUNT' | 'EMBER_BAT' | 'VOLT_TURRET' | 'FROST_WRAITH' | 'TIME_WEAVER' | 'CHRONO_LICH';
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
  kind: 'WEAPON' | 'ACCESSORY' | 'POTION' | 'ANCHOR' | 'TIME_SHARD';
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

export interface WorldItem {
  item: Item;
  x: number;
  y: number;
  // Section 7 Dynamic Chest Loot: true for mapgen-placed loot chests (not the
  // Anchor). Contents are rerolled from gameplay RNG at pickup time so a
  // chest's *contents* vary loop to loop while its *position* stays seeded.
  chestLoot?: boolean;
}
