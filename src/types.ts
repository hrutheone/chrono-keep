export type Element = 'PHYSICAL' | 'FIRE' | 'VOLT' | 'FROST' | 'CHRONO';
export type StatusEffect = 'NONE' | 'BURN' | 'STUN' | 'CHILLED';

export type CursedRiftEventKind =
  | 'rift_shop'
  | 'blood_anvil'
  | 'frozen_watchwarden'
  | 'paradox_mirror'
  | 'lich_projection'
  | 'echo_geode';

/** The Cursed Rift's currently-active roulette event. Only 'rift_shop'/'echo_geode' use their own fields. */
export interface CursedRiftEvent {
  kind: CursedRiftEventKind;
  // Where the triggering Rift tile was — 'lich_projection' spawns its chest here.
  riftX: number;
  riftY: number;
  shopOffers: string[];
  shopPurchases: number;
  // 'echo_geode': mined entirely within this modal — no map presence.
  geodeTurnsMined: number;
}

export const PLAYER_BASE_ATK = 2;
export const PLAYER_BASE_DEF = 0;

export interface GameState {
  persistent: {
    rngSeed: number;
    loopCount: number;
    echoes: number;
    maxHpUpgrade: number;
    maxStamUpgrade: number;
    turnBonusUpgrade: number;
    baseAtkUpgrade: number;
    skills: Record<string, number>;
    skillLoadout: string[];
    unlockedAnchors: number[];
    stats: {
      deepestFloor: number;
      bestTurnsRemaining: number;
      wins: number;
    };
    bestiaryKnown: string[];
    ngPlusLevel: number;
    cheatModeEnabled: boolean;
    weaponSlot2Unlocked: boolean;
    accessorySlot2Unlocked: boolean;
    accessorySlot3Unlocked: boolean;

    // Silas's Priority-1 milestone lines, never repeated once spoken.
    dialogueSeenIds: string[];
    lastRun: LastRunInfo | null;
  };

  run: {
    currentHp: number;
    maxHp: number;
    currentStamina: number;
    maxStamina: number;
    turnsRemaining: number;
    currentFloor: number;
    startFloor: number;
    playerX: number;
    playerY: number;
    facing: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';

    inventory: Item[];
    equippedWeapon: Weapon | null;
    equippedWeapon2: Weapon | null;
    equippedAccessory: Accessory | null;
    equippedAccessory2: Accessory | null;
    equippedAccessory3: Accessory | null;
    activeSkills: string[];
    status: StatusEffect;
    statusTurns: number;

    braced: boolean;
    iceAegisCharges: number;
    iceAegisChillsAttacker: boolean;

    floorDamageTaken: boolean;
    floorsVisitedThisLoop: number[];

    floorFirstHitNegated: boolean;

    quicksilverCharges: number;
    whetstoneCharge: boolean;

    recallMarkX: number | null;
    recallMarkY: number | null;
    vanishCharges: number;
    reflectBarrierCharges: number;
    reflectBarrierMult: number;
    reflectBarrierStuns: boolean;
    timeStopTurnsLeft: number;
    tempAtkBonus: number;
    tempAtkBonusTurns: number;
    tempDefBonus: number;
    tempDefBonusTurns: number;
    statusImmuneTurns: number;

    relics: string[];
    staticGenSteps: number;
    staticGenCharged: boolean;
    trollBloodCounter: number;
    smugglerPresent: boolean;

    // Last hit the player took; read once at death to pick a Silas reaction line.
    lastDamageSource: { kind: string; element: Element } | null;

    cursedRiftEvent: CursedRiftEvent | null;
  };

  dungeon: {
    width: number;
    height: number;
    tiles: number[][];
    enemies: Enemy[];
    items: WorldItem[];
    spawnX: number;
    spawnY: number;
    stairsX: number;
    stairsY: number;
    riftX: number | null;
    riftY: number | null;
    expiringTiles: { x: number; y: number; turnsLeft: number; tileType: number }[];
    telegraphTiles: {
      x: number;
      y: number;
      turnsUntil: number;
      payload: 'stun' | 'fire_aoe' | 'chill_pulse';
      sourceAttack: number;
      hazard?: boolean;
      hazardTurns?: number;
      // Set on Mini-Boss/Final Boss telegraphed AOEs, for Tactical Brace's Stamina refund.
      isBossAoe?: boolean;
    }[];
    // Silas, the Old Watchwarden — only ever placed on the Hub floor.
    npc: { x: number; y: number } | null;
  };

  ui: {
    currentScreen:
      | 'TITLE'
      | 'GAME'
      | 'MENU'
      | 'UPGRADE_SHOP'
      | 'SHORTCUT_GATE'
      | 'CURSED_RIFT'
      | 'SMUGGLER'
      | 'CONFIRM'
      | 'DEATH'
      | 'VICTORY'
      | 'DIALOGUE';
    log: string[];
  };
}

/** What killed the player (or ran out the clock) last time, for Silas's reactive dialogue. */
export interface LastRunInfo {
  deathReason: 'HP' | 'TIMEOUT';
  enemyKind: string | null;
  element: Element | null;
  floor: number;
  nearStairs: boolean;
  statusAtDeath: StatusEffect;
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
    | 'BONE_KNIGHT'
    | 'CINDER_SHAMAN'
    | 'VOLT_HOUND'
    | 'FROST_SENTINEL'
    | 'INFERNO_GOLEM'
    | 'STORM_CALLER'
    | 'GLACIAL_KNIGHT'
    | 'CLOCKWORK_SCARAB'
    | 'DREAD_LEGION'
    | 'DOOM_GUARD'
    | 'ASH_FIEND'
    | 'HELLFIRE_MAGUS'
    | 'TESLA_COIL'
    | 'STORM_STALKER'
    | 'VOID_SPIRIT'
    | 'GLACIAL_MONOLITH';
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  element: Element;
  weakness: Element | null;
  speed: number;
  awake: boolean;
  status: StatusEffect;
  statusTurns: number;

  defuseTurnsLeft?: number;
  defuseOriginalDef?: number;
  slowTurnsLeft?: number;
  slowOriginalSpeed?: number;
  grappleMarked?: boolean;
  // Weakness Exploit: turns left before a Mini-Boss/Final Boss can refund Stamina again.
  weaknessRefundCooldown?: number;

  affix?: string;
  shieldedHitsLeft?: number;
  auraColor?: string;
  // Cursed Rift's Paradox Mirror event: a mirror of the player's own stats, with its own guaranteed drop on kill.
  isShadowWarden?: boolean;
}

export interface Item {
  id: string;
  kind: 'WEAPON' | 'ACCESSORY' | 'POTION' | 'CONSUMABLE' | 'ANCHOR' | 'TIME_SHARD' | 'RELIC';
  name: string;
  value: number;
  count?: number;
  effect?: string;
}

export interface Weapon extends Item {
  kind: 'WEAPON';
  atk: number;
  element: Element;
  passive: string;
}

export interface Accessory extends Item {
  kind: 'ACCESSORY';
  passive: string;
}

export interface Consumable extends Item {
  kind: 'CONSUMABLE';
  effect: string;
}

export interface WorldItem {
  item: Item;
  x: number;
  y: number;
  chestLoot?: boolean;
}
