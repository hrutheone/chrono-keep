// Game content tables transcribed from the GDD: the Elemental Wheel (Section 5)
// and the bestiary, weapons, and accessories (Section 6).

import type { Accessory, Consumable, Element, Enemy, Item, Weapon } from './types';

export type EnemyKind = Enemy['kind'];
type Rng = () => number;

// Elemental Wheel: Fire > Frost > Volt > Physical > Fire. Chrono sits outside it.
// A monster's weakness is the element that beats its own — never hand-assigned.
const BEATEN_BY: Record<Element, Element | null> = {
  FROST: 'FIRE',
  VOLT: 'FROST',
  PHYSICAL: 'VOLT',
  FIRE: 'PHYSICAL',
  CHRONO: null,
};

export function weaknessOf(element: Element): Element | null {
  return BEATEN_BY[element];
}

// Bestiary (Section 6C).
interface EnemyTemplate {
  hp: number;
  attack: number;
  defense: number;
  speed: number;
  element: Element;
}

export const BESTIARY: Record<EnemyKind, EnemyTemplate> = {
  BONE_GRUNT: { hp: 12, attack: 4, defense: 1, speed: 1, element: 'PHYSICAL' },
  EMBER_BAT: { hp: 8, attack: 5, defense: 0, speed: 2, element: 'FIRE' },
  // DEF 1, not the original 3: Physical (the Rusty Sword starter weapon, by
  // far the most common early pickup) is resisted 0.5x against Volt per the
  // Elemental Wheel, so the original DEF 3 meant a Rusty-Sword-only player
  // dealt max(1, floor((5-3)*0.5))=1 dmg/hit — 25 hits to clear one turret.
  // Phase 7 simulation data flagged this as a common early-loop stall point.
  VOLT_TURRET: { hp: 25, attack: 6, defense: 1, speed: 0, element: 'VOLT' },
  FROST_WRAITH: { hp: 18, attack: 5, defense: 2, speed: 1, element: 'FROST' },
  TIME_WEAVER: { hp: 40, attack: 8, defense: 4, speed: 1, element: 'CHRONO' },
  // Section 7 Turn Budget promises the boss is "winnable in 15-20 turns" for
  // a well-armed Phase 0-6 loadout (Phase 8's item roster doesn't exist yet
  // at Phase 7's tuning point). At the original DEF 5 / HP 150, even a
  // Chrono-Blade (the best available weapon, total ATK 9) only deals
  // max(1, 9-5)=4 dmg/hit — 38 hits. The Phase 7 simulation harness
  // (scripts/simulate.ts) found 0/20 seeds won at any loop count up to 15,
  // confirming this was mathematically outside budget for most loadouts.
  // DEF 0 / HP 100 puts an Ember Blade (total ATK 7, the common mid-run
  // pickup) at ~15 hits and a Rusty Sword (total 5) at ~20 — both inside the
  // documented window; ATK trimmed 12->10 so the fight's own damage race
  // doesn't kill the player faster than they can clear that HP pool.
  CHRONO_LICH: { hp: 100, attack: 10, defense: 0, speed: 1, element: 'CHRONO' },

  // Deep-Biome Regulars (Section 6C, Phase 14): first appear Biome 3+
  // (Floors 21+), mixed into every deeper Biome after that. Stats verbatim
  // from the GDD table — DEF/Speed are fixed like every other regular
  // (scaleEnemyForDepth only scales hp/attack).
  BONE_KNIGHT: { hp: 22, attack: 5, defense: 6, speed: 1, element: 'PHYSICAL' },
  CINDER_SHAMAN: { hp: 14, attack: 6, defense: 1, speed: 1, element: 'FIRE' },
  VOLT_HOUND: { hp: 10, attack: 6, defense: 0, speed: 2, element: 'VOLT' },
  FROST_SENTINEL: { hp: 20, attack: 5, defense: 5, speed: 0, element: 'FROST' },
};

export const ENEMY_NAME: Record<EnemyKind, string> = {
  BONE_GRUNT: 'Bone-Grunt',
  EMBER_BAT: 'Ember-Bat',
  VOLT_TURRET: 'Volt-Turret',
  FROST_WRAITH: 'Frost-Wraith',
  TIME_WEAVER: 'Time-Weaver',
  CHRONO_LICH: 'Chrono-Lich',
  BONE_KNIGHT: 'Bone-Knight',
  CINDER_SHAMAN: 'Cinder-Shaman',
  VOLT_HOUND: 'Volt-Hound',
  FROST_SENTINEL: 'Frost-Sentinel',
};

// Bestiary lore (Section 6C's "Lore / Origin" column) — shown in the Bestiary
// tab of the Skill Menu (Fun & Feel #1). Never displayed anywhere before this.
export const MONSTER_LORE: Record<EnemyKind, string> = {
  BONE_GRUNT:
    'Once your comrades-in-arms, now trapped in a cycle of endless decay and resurrection. They attack blindly, trying to enforce a quarantine that failed lifetimes ago.',
  EMBER_BAT:
    'Scavengers mutated by the friction of fractured time. They feed on the ambient heat of collapsing realities, moving with jarring, erratic bursts.',
  VOLT_TURRET:
    "The citadel's automated defense grid. Unaware that the kingdom has already fallen, they patiently charge their capacitors to vaporize intruders.",
  FROST_WRAITH:
    "The frozen souls of Oakhaven's nobility, trapped at the exact moment the Hourglass shattered. Their touch induces the chilling lethargy of stopped time.",
  TIME_WEAVER:
    "The Lich's corrupted apprentices. They desperately stitch the tears in the loop together. Striking them causes them to slip backwards through the timeline, appearing elsewhere.",
  CHRONO_LICH:
    'The architect of this purgatory. He sits at the bottom of the temporal well, hoarding the Anchors in a mad bid to ascend. He no longer remembers why he wanted to live forever.',
  BONE_KNIGHT:
    'The honor guard never abandoned their posts. Centuries of resets have fused their plate to their bones.',
  CINDER_SHAMAN:
    'It still performs the rain-summoning rite of old Oakhaven. What falls now is not water.',
  VOLT_HOUND:
    "The kennels of the citadel guard, warped into living capacitors. They hunt in pairs, herding prey into each other's arcs.",
  FROST_SENTINEL:
    'Statues of the old kings, animated by the cold between seconds. Their gaze sweeps the halls in four directions at once.',
};

export function createEnemy(kind: EnemyKind, id: string, x: number, y: number): Enemy {
  const t = BESTIARY[kind];
  return {
    id,
    kind,
    x,
    y,
    hp: t.hp,
    maxHp: t.hp,
    attack: t.attack,
    defense: t.defense,
    element: t.element,
    weakness: weaknessOf(t.element),
    speed: t.speed,
    awake: false,
    status: 'NONE',
    statusTurns: 0,
  };
}

// --- 99-Floor Descent structure (GDD Sections 6C & 7) ---

/** Which 10-floor Biome a floor belongs to (1-10). Floor 99 caps Biome 10. */
export function biomeOf(floorNumber: number): number {
  return Math.min(10, Math.floor((floorNumber - 1) / 10) + 1);
}

/** Depth Multiplier (Section 6C): +15% compounding every 5 floors, applied to
 * enemy HP and ATK at spawn time. DEF and Speed never scale (armor/mobility
 * stay a readable, fixed property of each kind). */
export function depthMultiplier(floorNumber: number): number {
  return Math.pow(1.15, Math.floor((floorNumber - 1) / 5));
}

/** Applies the Depth Multiplier for the floor an enemy spawns on. Regular
 * enemies and Elites only — Mini-Bosses and the Chrono-Lich use hand-tuned
 * stats and are exempt (their floors are fixed, so scaling is baked in).
 * NG+ scaling (scaleEnemyForNgPlus) multiplies ON TOP of this. */
export function scaleEnemyForDepth(enemy: Enemy, floorNumber: number): void {
  const mult = depthMultiplier(floorNumber);
  if (mult <= 1) return;
  enemy.hp = Math.round(enemy.hp * mult);
  enemy.maxHp = enemy.hp;
  enemy.attack = Math.round(enemy.attack * mult);
}

/** Fun & Feel #8: New Game+ escalation — +10% HP per NG+ cycle, applied as a
 * post-generation pass (mapgen.ts/bossArena.ts, and enemyAI.ts's Grunt
 * summons) rather than inside `createEnemy` itself, so the seeded generator
 * stays a pure function of (rngSeed, floorNumber) — determinism never
 * depends on meta-progression. A no-op at ngPlusLevel 0 (every first
 * playthrough). */
export function scaleEnemyForNgPlus(enemy: Enemy, ngPlusLevel: number): void {
  if (ngPlusLevel <= 0) return;
  const scaled = Math.round(enemy.hp * (1 + 0.1 * ngPlusLevel));
  enemy.hp = scaled;
  enemy.maxHp = scaled;
}

/** Procedural-floor enemy pool for Phase 12's 99-floor descent. Phase 14 adds
 * the deep-biome regulars' AI, so Biome 3+ uses the full roster the GDD
 * specifies (Bone-Knight/Cinder-Shaman/Volt-Hound/Frost-Sentinel alongside
 * the Biome 1-2 kinds and Time-Weaver pressure), with elemental
 * over-representation by Biome theme. */
export function enemyPoolForFloor(floorNumber: number): EnemyKind[] {
  const biome = biomeOf(floorNumber);
  if (biome === 1) return ['BONE_GRUNT', 'EMBER_BAT'];
  if (biome === 2) return ['BONE_GRUNT', 'EMBER_BAT', 'VOLT_TURRET', 'FROST_WRAITH'];

  const full: EnemyKind[] = [
    'BONE_GRUNT',
    'EMBER_BAT',
    'VOLT_TURRET',
    'FROST_WRAITH',
    'TIME_WEAVER',
    'BONE_KNIGHT',
    'CINDER_SHAMAN',
    'VOLT_HOUND',
    'FROST_SENTINEL',
  ];
  if (biome === 10) return [...full, 'TIME_WEAVER', 'TIME_WEAVER'];

  const theme = (biome - 4) % 3;
  if (theme === 0) return [...full, 'EMBER_BAT', 'EMBER_BAT'];
  if (theme === 1) return [...full, 'VOLT_TURRET', 'VOLT_TURRET'];
  return [...full, 'FROST_WRAITH', 'FROST_WRAITH'];
}

export function enemyCountRangeForFloor(floorNumber: number): { min: number; max: number } {
  const biome = biomeOf(floorNumber);
  if (biome <= 2) return { min: 3, max: 5 };
  if (biome <= 5) return { min: 4, max: 6 };
  return { min: 5, max: 6 };
}

// Weapons (Section 6A). The first 6 are the original Phase 0-6 roster; the
// remaining 10 are Phase 8's expansion. `lore` is Section 6A's "Lore /
// Flavor Text" column — see loreForItem() below for how it reaches the UI.
const WEAPONS = {
  RUSTY_SWORD: {
    name: 'Rusty Sword',
    atk: 3,
    element: 'PHYSICAL',
    passive: 'none',
    lore: 'Your service weapon from a timeline long forgotten. It remembers the taste of blood, but its edge has dulled across a thousand failed resets.',
  },
  BONE_DAGGER: {
    name: 'Bone Dagger',
    atk: 2,
    element: 'PHYSICAL',
    passive: 'free_swap',
    lore: 'Carved from the femur of a fallen Watchwarden. It demands so little weight to wield, you can draw it between the ticks of a clock.',
  },
  EMBER_BLADE: {
    name: 'Ember Blade',
    atk: 5,
    element: 'FIRE',
    passive: 'burn_25',
    lore: "Forged in the Keep's thermal underbelly. The blade is perpetually melting and reforming, burning with the heat of Oakhaven's final day.",
  },
  VOLT_SPEAR: {
    name: 'Volt Spear',
    atk: 4,
    element: 'VOLT',
    passive: 'pierce_1',
    lore: "Standard issue for the citadel's riot vanguard. It hums with an erratic, restless energy, desperate to arc through flesh and armor alike.",
  },
  FROST_WAND: {
    name: 'Frost Wand',
    atk: 3,
    element: 'FROST',
    passive: 'ranged_3',
    lore: 'Wielded by the court diviners to read the stars. Now, it channels the absolute zero of the void between seconds.',
  },
  CHRONO_BLADE: {
    name: 'Chrono-Blade',
    atk: 7,
    element: 'CHRONO',
    passive: 'kill_refund_turn',
    lore: "A paradox wrought into steel. It does not cut flesh; it severs the victim's future, allowing you to steal their remaining moments.",
  },
  ASHWOOD_BOW: {
    name: 'Ashwood Bow',
    atk: 3,
    element: 'PHYSICAL',
    passive: 'ranged_no_adjacent_3',
    lore: "Carved from the dying trees of the upper courtyard. Best used from a coward's distance.",
  },
  CINDER_AXE: {
    name: 'Cinder Axe',
    atk: 6,
    element: 'FIRE',
    passive: 'heavy_stamina',
    lore: 'It burns hot and swings slow. Make every execution count.',
  },
  STATIC_WHIP: {
    name: 'Static Whip',
    atk: 4,
    element: 'VOLT',
    passive: 'exact_range_2',
    lore: "A live wire stripped from the citadel's walls. Keep your enemies at arm's length.",
  },
  GLACIAL_MACE: {
    name: 'Glacial Mace',
    atk: 4,
    element: 'FROST',
    passive: 'knockback_1',
    lore: "A chunk of permafrost on a steel rod. It doesn't just freeze; it shatters momentum.",
  },
  TESLA_GAUNTLETS: {
    name: 'Tesla Gauntlets',
    atk: 3,
    element: 'VOLT',
    passive: 'pull_1',
    lore: 'Magnetic lodestones hum within the palms. Bring them into the killing zone.',
  },
  OBSIDIAN_GREATSWORD: {
    name: 'Obsidian Greatsword',
    atk: 8,
    element: 'PHYSICAL',
    passive: 'blood_magic',
    lore: 'A blade that demands a sacrifice for its devastating edge.',
  },
  FROSTBITE_DAGGER: {
    name: 'Frostbite Dagger',
    atk: 2,
    element: 'FROST',
    passive: 'chill_50_free_swap',
    lore: 'A sliver of ice. Easily concealed, quickly drawn, bitterly cold.',
  },
  CLOCKWORK_RAPIER: {
    name: 'Clockwork Rapier',
    atk: 3,
    element: 'PHYSICAL',
    passive: 'stun_synergy_2x',
    lore: "A duelist's weapon that strikes precisely between the ticks of a stopped clock.",
  },
  TORCH_OF_THE_WATCH: {
    name: 'Torch of the Watch',
    atk: 3,
    element: 'FIRE',
    passive: 'cure_chill_on_attack',
    lore: 'Standard issue for night patrols. Good for bashing skulls and staying warm.',
  },
  PARADOX_STAFF: {
    name: 'Paradox Staff',
    atk: 4,
    element: 'CHRONO',
    passive: 'knockback_2_randomize_element',
    lore: "It bends reality upon impact. You never quite know what you'll leave behind.",
  },
} as const satisfies Record<string, { name: string; atk: number; element: Element; passive: string; lore: string }>;

export type WeaponKey = keyof typeof WEAPONS;

export function createWeapon(key: WeaponKey, id: string): Weapon {
  const w = WEAPONS[key];
  return { id, kind: 'WEAPON', name: w.name, value: 0, atk: w.atk, element: w.element, passive: w.passive };
}

// Weapon passives that grant a min/max attack range without moving (Section
// 6A/8): the inverse pair — Frost Wand/Volt Spear can reach past adjacency,
// Ashwood Bow/Static Whip *require* distance. min=max=1 (the default for any
// weapon not listed) means "adjacent bump-attack only."
export interface WeaponRangeProfile {
  min: number;
  max: number;
}
export const WEAPON_RANGE: Partial<Record<string, WeaponRangeProfile>> = {
  ranged_3: { min: 1, max: 3 },
  ranged_no_adjacent_3: { min: 2, max: 3 },
  exact_range_2: { min: 2, max: 2 },
};

// Weapon passives that let the Bone Dagger-style free-swap rule apply.
export const FREE_SWAP_PASSIVES = new Set(['free_swap', 'chill_50_free_swap']);

// Accessories (Section 6D). The first 7 are the original roster; the
// remaining 12 are Phase 8's expansion. `lore` is Section 6D's "Lore /
// Flavor Text" column.
const ACCESSORIES = {
  IRON_RING: {
    name: 'Iron Ring',
    passive: 'def_plus_2',
    lore: 'A crude signet of the lower guard. It bears the dents of countless skirmishes that never technically happened.',
  },
  RING_OF_VIGOR: {
    name: 'Ring of Vigor',
    passive: 'max_hp_plus_10',
    lore: 'Pulses with a steady heartbeat. Holding it reminds your body that it is still alive, anchoring your physical form.',
  },
  BOOTS_OF_HASTE: {
    name: 'Boots of Haste',
    passive: 'dash_discount',
    lore: "The leather is pristine, untouched by the sands of time. Slipping them on makes the world around you feel like it's moving through syrup.",
  },
  ECHO_CHARM: {
    name: 'Echo Charm',
    passive: 'echo_bonus_20',
    lore: 'A jagged piece of crystallized memory. It whispers the mistakes of your past lives into your ear, ensuring you do not waste the blood you spill.',
  },
  EMBER_PENDANT: {
    name: 'Ember Pendant',
    passive: 'burn_immune',
    lore: "A piece of the citadel's original hearthstone. It recognizes you as a son of Oakhaven, granting safe passage through the flames.",
  },
  WINGED_ANKLET: {
    name: 'Winged Anklet',
    passive: 'chill_immune',
    lore: 'Woven with feathers from the mythical Sun-Bird. It rejects the stagnation of the void, keeping your blood rushing when the cold closes in.',
  },
  GROUNDING_BAND: {
    name: 'Grounding Band',
    passive: 'stun_immune',
    lore: 'A heavy, copper torc. It grounds not just electricity, but your very consciousness, preventing sudden shocks from interrupting your flow.',
  },
  BERSERKERS_CUFF: {
    name: "Berserker's Cuff",
    passive: 'berserker',
    lore: 'Restricts blood flow just enough to induce a permanent state of rage.',
  },
  PALADINS_MANTLE: {
    name: "Paladin's Mantle",
    passive: 'paladin',
    lore: 'Heavy leaden weave. It absorbs blows perfectly but exhausts the wearer.',
  },
  BATTERY_CELL: {
    name: 'Battery Cell',
    passive: 'max_stam_plus_3',
    lore: 'A glowing hum of ancient energy that hooks directly into your nervous system.',
  },
  KINDLING_POUCH: {
    name: 'Kindling Pouch',
    passive: 'fire_synergy',
    lore: "Contains the ever-burning embers of the citadel's first hearth.",
  },
  CAPACITOR_RING: {
    name: 'Capacitor Ring',
    passive: 'volt_synergy',
    lore: 'It sparks constantly, desperate to ground itself into an unlucky target.',
  },
  PERMAFROST_VIAL: {
    name: 'Permafrost Vial',
    passive: 'frost_synergy',
    lore: 'A liquid so cold it freezes the air around your fingertips.',
  },
  VAMPIRE_TOOTH: {
    name: 'Vampire Tooth',
    passive: 'lifesteal_1',
    lore: 'A morbid keepsake. It pulses warmly when blood is spilled.',
  },
  SHATTERED_HOURGLASS: {
    name: 'Shattered Hourglass',
    passive: 'safety_net_15',
    lore: 'A broken promise of more time. Use it to finish what you started.',
  },
  SPIKED_PAULDRONS: {
    name: 'Spiked Pauldrons',
    passive: 'retaliation_2',
    lore: 'The best defense is a jagged piece of rusted metal aimed at their throat.',
  },
  GAMBLERS_DICE: {
    name: "Gambler's Dice",
    passive: 'gamblers_dice',
    lore: 'Fate is fluid in the time loop. Roll the bones and steal back some seconds.',
  },
  ADRENALINE_GLAND: {
    name: 'Adrenaline Gland',
    passive: 'adrenaline',
    lore: 'Panic is just a resource waiting to be harnessed.',
  },
  ALCHEMISTS_BELT: {
    name: "Alchemist's Belt",
    passive: 'alchemist_belt',
    lore: 'A perfectly organized bandolier. Your hand finds what it needs instantly.',
  },
} as const satisfies Record<string, { name: string; passive: string; lore: string }>;

export type AccessoryKey = keyof typeof ACCESSORIES;

export function createAccessory(key: AccessoryKey, id: string): Accessory {
  const a = ACCESSORIES[key];
  return { id, kind: 'ACCESSORY', name: a.name, value: 0, passive: a.passive };
}

const POTION_LORE = 'A murky, lukewarm brew. It tastes like failure, but it works.';
const MAX_POTION_LORE = "Distilled from a Watchwarden's final, desperate moment. It remembers what it means to be whole.";

export function createPotion(id: string): Item {
  return { id, kind: 'POTION', name: 'Potion', value: 10 };
}

export function createAnchorItem(id: string): Item {
  return { id, kind: 'ANCHOR', name: 'Temporal Anchor', value: 0 };
}

// Tactical Consumables (Section 6E, Phase 8): always 1 turn to use, in or out
// of combat (Alchemist's Belt overrides this to 0). `value` carries the one
// numeric parameter each effect needs, the same convention Potion/Time Shard
// already use; secondary parameters (range, AOE, duration) are baked into
// the implementing code by `effect` ID, same as a Weapon's `passive`. `lore`
// is Section 6E's "Lore / Flavor Text" column.
const CONSUMABLES = {
  LIQUID_FIRE_FLASK: {
    name: 'Liquid Fire Flask',
    effect: 'throw_fire_hazard',
    value: 3, // range
    lore: 'Ignites upon exposure to the air. Excellent for blocking corridors.',
  },
  SHOCK_GRENADE: {
    name: 'Shock Grenade',
    effect: 'throw_shock_grenade',
    value: 3, // range
    lore: 'Overloads the nervous system of anything caught in the flash.',
  },
  ICE_BARRICADE_SCROLL: {
    name: 'Ice-Barricade Scroll',
    effect: 'ice_barricade',
    value: 5, // turns
    lore: 'Draw the rune, summon the frost, and buy yourself a moment to breathe.',
  },
  STAMINA_DRAUGHT: {
    name: 'Stamina Draught',
    effect: 'restore_stamina',
    value: 0,
    lore: 'Tastes like copper and ozone. Your muscles twitch violently.',
  },
  QUICKSILVER_FLASK: {
    name: 'Quicksilver Flask',
    effect: 'quicksilver',
    value: 3, // charges
    lore: 'Time stretches. You move between the raindrops.',
  },
  RECALL_RUNE: {
    name: 'Recall Rune',
    effect: 'recall',
    value: 0,
    lore: 'A coward\'s exit, or a tactician\'s reset. Depends on who is asking.',
  },
  ECHO_GEODE: {
    name: 'Echo Geode',
    effect: 'echo_geode',
    value: 50, // Echoes
    lore: 'A massive cluster of memories. Cash it in before you forget.',
  },
  WHETSTONE: {
    name: 'Whetstone',
    effect: 'whetstone',
    value: 0,
    lore: 'A few quick strikes along the blade ensures the next cut will be deep.',
  },
} as const satisfies Record<string, { name: string; effect: string; value: number; lore: string }>;

export type ConsumableKey = keyof typeof CONSUMABLES;

export function createConsumable(key: ConsumableKey, id: string): Consumable {
  const c = CONSUMABLES[key];
  return { id, kind: 'CONSUMABLE', name: c.name, value: c.value, effect: c.effect };
}

// Fun & Feel #1: lore is kept out of the runtime Item objects (so it doesn't
// bloat every save file with static, per-kind text) and looked up by display
// name instead — names are already unique identifiers throughout this file.
const LORE_BY_NAME: Record<string, string> = { Potion: POTION_LORE, 'Max Potion': MAX_POTION_LORE };
for (const w of Object.values(WEAPONS)) LORE_BY_NAME[w.name] = w.lore;
for (const a of Object.values(ACCESSORIES)) LORE_BY_NAME[a.name] = a.lore;
for (const c of Object.values(CONSUMABLES)) LORE_BY_NAME[c.name] = c.lore;

/** Flavor text for the Inventory overlay (Section 6's "Lore / Flavor Text"
 * columns) — undefined for items that never had any (Temporal Anchor, Time
 * Shard). */
export function loreForItem(name: string): string | undefined {
  return LORE_BY_NAME[name];
}

// Chest loot pools by Biome (Section 6D drop-source tiers: "Chests",
// "Chests (Biome 2+)", "Chests (Biome 3+)"). Tiering up with depth is what
// lets a warp-in player re-gear appropriately for the local Depth Scaling
// (Section 7, Dynamic Chest Loot). Positions are seeded; contents are
// rerolled from gameplay RNG at pickup time (inventory.ts).
type ChestRoll = (id: string) => Item;

const CHEST_POOL_B1: ChestRoll[] = [
  createPotion,
  (id) => createWeapon('EMBER_BLADE', id),
  (id) => createAccessory('IRON_RING', id),
  (id) => createAccessory('RING_OF_VIGOR', id),
  // Phase 8: simple, low-power items are reachable from Floor 1 too.
  (id) => createWeapon('FROSTBITE_DAGGER', id),
  (id) => createWeapon('TORCH_OF_THE_WATCH', id),
  (id) => createConsumable('STAMINA_DRAUGHT', id),
];
const CHEST_POOL_B2: ChestRoll[] = [
  ...CHEST_POOL_B1,
  (id) => createAccessory('BOOTS_OF_HASTE', id),
  (id) => createAccessory('ECHO_CHARM', id),
  (id) => createAccessory('EMBER_PENDANT', id),
  (id) => createAccessory('WINGED_ANKLET', id),
  // Phase 8: mid-tier weapons/accessories/consumables.
  (id) => createWeapon('GLACIAL_MACE', id),
  (id) => createWeapon('TESLA_GAUNTLETS', id),
  (id) => createWeapon('STATIC_WHIP', id),
  (id) => createAccessory('BATTERY_CELL', id),
  (id) => createAccessory('KINDLING_POUCH', id),
  (id) => createAccessory('CAPACITOR_RING', id),
  (id) => createAccessory('PERMAFROST_VIAL', id),
  (id) => createAccessory('VAMPIRE_TOOTH', id),
  (id) => createAccessory('GAMBLERS_DICE', id),
  (id) => createConsumable('WHETSTONE', id),
  (id) => createConsumable('QUICKSILVER_FLASK', id),
];
const CHEST_POOL_B3: ChestRoll[] = [
  ...CHEST_POOL_B2,
  (id) => createAccessory('GROUNDING_BAND', id),
  // Phase 8: the highest-power weapons/accessories/consumables.
  (id) => createWeapon('OBSIDIAN_GREATSWORD', id),
  (id) => createWeapon('CLOCKWORK_RAPIER', id),
  (id) => createWeapon('PARADOX_STAFF', id),
  (id) => createWeapon('CINDER_AXE', id),
  (id) => createWeapon('ASHWOOD_BOW', id),
  (id) => createAccessory('BERSERKERS_CUFF', id),
  (id) => createAccessory('PALADINS_MANTLE', id),
  (id) => createAccessory('SHATTERED_HOURGLASS', id),
  (id) => createAccessory('SPIKED_PAULDRONS', id),
  (id) => createAccessory('ADRENALINE_GLAND', id),
  (id) => createAccessory('ALCHEMISTS_BELT', id),
  (id) => createConsumable('LIQUID_FIRE_FLASK', id),
  (id) => createConsumable('SHOCK_GRENADE', id),
  (id) => createConsumable('ICE_BARRICADE_SCROLL', id),
  (id) => createConsumable('RECALL_RUNE', id),
  (id) => createConsumable('ECHO_GEODE', id),
];

export function rollChestItem(rng: () => number, floorNumber: number, id: string): Item {
  const biome = biomeOf(floorNumber);
  const pool = biome >= 3 ? CHEST_POOL_B3 : biome === 2 ? CHEST_POOL_B2 : CHEST_POOL_B1;
  return pool[Math.floor(rng() * pool.length)](id);
}

// Skills (Section 6B). Levels/upgrades are purchased with Echoes in Phase 5's
// Upgrade Shop; only stamina cost and identity matter for the Phase 3 menu.
export const SKILLS: Record<string, { name: string; element: Element; stamina: number }> = {
  dash: { name: 'Dash', element: 'PHYSICAL', stamina: 2 },
  cleave: { name: 'Cleave', element: 'PHYSICAL', stamina: 3 },
  flame_arc: { name: 'Flame Arc', element: 'FIRE', stamina: 4 },
  static_shift: { name: 'Static Shift', element: 'VOLT', stamina: 3 },
  ice_aegis: { name: 'Ice Aegis', element: 'FROST', stamina: 4 },
};

export type SkillId = keyof typeof SKILLS;

// Fun & Feel #5: Section 6B's Lvl1/Lvl2/Lvl3 columns, verbatim — shown next to
// the Buy button in the Skill Menu/Upgrade Shop so a purchase is never blind.
export const SKILL_LEVEL_EFFECTS: Record<SkillId, readonly [string, string, string]> = {
  dash: ['Move 2 tiles in one turn.', 'Move 3 tiles.', '+1 Turn refunded on use.'],
  cleave: ['Deal 1.2x ATK to 3 front tiles.', 'Deal 1.5x ATK.', 'Inflicts Knockback.'],
  flame_arc: ['Deal 5 Fire DMG to adjacent enemies.', 'Chance to Burn.', 'Leaves fire hazard on floor.'],
  static_shift: ['Teleport 3 tiles, Stun adjacent.', 'Range becomes 4 tiles.', 'Costs 2 Stamina instead of 3.'],
  ice_aegis: ['Block next attack.', 'Block next 2 attacks.', 'Attackers are Chilled.'],
};

// Enemy death drops (Section 6A/6C). Phase 3 only wires the data + roll
// function; nothing calls this until Phase 4 implements enemy death.
type DropRoll = (id: string) => Item;

const ENEMY_DROPS: Partial<Record<EnemyKind, DropRoll[]>> = {
  BONE_GRUNT: [(id) => createWeapon('RUSTY_SWORD', id), createPotion],
  EMBER_BAT: [(id) => createWeapon('EMBER_BLADE', id)],
  VOLT_TURRET: [(id) => createWeapon('VOLT_SPEAR', id)],
  FROST_WRAITH: [(id) => createWeapon('FROST_WAND', id)],
  TIME_WEAVER: [(id) => createWeapon('CHRONO_BLADE', id), (id) => ({ ...createPotion(id), name: 'Max Potion', value: 999 })],
  BONE_KNIGHT: [(id) => createWeapon('OBSIDIAN_GREATSWORD', id), createPotion],
  CINDER_SHAMAN: [(id) => createConsumable('LIQUID_FIRE_FLASK', id), (id) => createWeapon('CINDER_AXE', id)],
  VOLT_HOUND: [(id) => createWeapon('STATIC_WHIP', id), (id) => createConsumable('STAMINA_DRAUGHT', id)],
  FROST_SENTINEL: [(id) => createWeapon('GLACIAL_MACE', id), (id) => createWeapon('FROSTBITE_DAGGER', id)],
};

/** Rolls one item from this enemy kind's drop table (null if it has none, e.g. the Boss). */
export function rollEnemyDrop(rng: Rng, kind: EnemyKind, id: string): Item | null {
  const table = ENEMY_DROPS[kind];
  if (!table || table.length === 0) return null;
  return table[Math.floor(rng() * table.length)](id);
}

// Time Shards (Section 6C): 25% drop chance from normal (non-Elite/Boss)
// enemies, rolled with gameplay RNG (Math.random()), not the seeded generator
// stream — intentionally non-deterministic across loops.
export const TIME_SHARD_DROP_CHANCE = 0.25;

export function createTimeShard(id: string): Item {
  // +5 turns (Section 6C, 99-Floor Descent): worth a real detour against a
  // per-floor 100-turn counter, where the old +2 was tuned for a shared one.
  return { id, kind: 'TIME_SHARD', name: 'Time Shard', value: 5 };
}
