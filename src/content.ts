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
};

export const ENEMY_NAME: Record<EnemyKind, string> = {
  BONE_GRUNT: 'Bone-Grunt',
  EMBER_BAT: 'Ember-Bat',
  VOLT_TURRET: 'Volt-Turret',
  FROST_WRAITH: 'Frost-Wraith',
  TIME_WEAVER: 'Time-Weaver',
  CHRONO_LICH: 'Chrono-Lich',
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

// Weapons (Section 6A). The first 6 are the original Phase 0-6 roster; the
// remaining 10 are Phase 8's expansion.
const WEAPONS = {
  RUSTY_SWORD: { name: 'Rusty Sword', atk: 3, element: 'PHYSICAL', passive: 'none' },
  BONE_DAGGER: { name: 'Bone Dagger', atk: 2, element: 'PHYSICAL', passive: 'free_swap' },
  EMBER_BLADE: { name: 'Ember Blade', atk: 5, element: 'FIRE', passive: 'burn_25' },
  VOLT_SPEAR: { name: 'Volt Spear', atk: 4, element: 'VOLT', passive: 'pierce_1' },
  FROST_WAND: { name: 'Frost Wand', atk: 3, element: 'FROST', passive: 'ranged_3' },
  CHRONO_BLADE: { name: 'Chrono-Blade', atk: 7, element: 'CHRONO', passive: 'kill_refund_turn' },
  ASHWOOD_BOW: { name: 'Ashwood Bow', atk: 3, element: 'PHYSICAL', passive: 'ranged_no_adjacent_3' },
  CINDER_AXE: { name: 'Cinder Axe', atk: 6, element: 'FIRE', passive: 'heavy_stamina' },
  STATIC_WHIP: { name: 'Static Whip', atk: 4, element: 'VOLT', passive: 'exact_range_2' },
  GLACIAL_MACE: { name: 'Glacial Mace', atk: 4, element: 'FROST', passive: 'knockback_1' },
  TESLA_GAUNTLETS: { name: 'Tesla Gauntlets', atk: 3, element: 'VOLT', passive: 'pull_1' },
  OBSIDIAN_GREATSWORD: { name: 'Obsidian Greatsword', atk: 8, element: 'PHYSICAL', passive: 'blood_magic' },
  FROSTBITE_DAGGER: { name: 'Frostbite Dagger', atk: 2, element: 'FROST', passive: 'chill_50_free_swap' },
  CLOCKWORK_RAPIER: { name: 'Clockwork Rapier', atk: 3, element: 'PHYSICAL', passive: 'stun_synergy_2x' },
  TORCH_OF_THE_WATCH: { name: 'Torch of the Watch', atk: 3, element: 'FIRE', passive: 'cure_chill_on_attack' },
  PARADOX_STAFF: { name: 'Paradox Staff', atk: 4, element: 'CHRONO', passive: 'knockback_2_randomize_element' },
} as const satisfies Record<string, { name: string; atk: number; element: Element; passive: string }>;

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
// remaining 12 are Phase 8's expansion.
const ACCESSORIES = {
  IRON_RING: { name: 'Iron Ring', passive: 'def_plus_2' },
  RING_OF_VIGOR: { name: 'Ring of Vigor', passive: 'max_hp_plus_10' },
  BOOTS_OF_HASTE: { name: 'Boots of Haste', passive: 'dash_discount' },
  ECHO_CHARM: { name: 'Echo Charm', passive: 'echo_bonus_20' },
  EMBER_PENDANT: { name: 'Ember Pendant', passive: 'burn_immune' },
  WINGED_ANKLET: { name: 'Winged Anklet', passive: 'chill_immune' },
  GROUNDING_BAND: { name: 'Grounding Band', passive: 'stun_immune' },
  BERSERKERS_CUFF: { name: "Berserker's Cuff", passive: 'berserker' },
  PALADINS_MANTLE: { name: "Paladin's Mantle", passive: 'paladin' },
  BATTERY_CELL: { name: 'Battery Cell', passive: 'max_stam_plus_3' },
  KINDLING_POUCH: { name: 'Kindling Pouch', passive: 'fire_synergy' },
  CAPACITOR_RING: { name: 'Capacitor Ring', passive: 'volt_synergy' },
  PERMAFROST_VIAL: { name: 'Permafrost Vial', passive: 'frost_synergy' },
  VAMPIRE_TOOTH: { name: 'Vampire Tooth', passive: 'lifesteal_1' },
  SHATTERED_HOURGLASS: { name: 'Shattered Hourglass', passive: 'safety_net_15' },
  SPIKED_PAULDRONS: { name: 'Spiked Pauldrons', passive: 'retaliation_2' },
  GAMBLERS_DICE: { name: "Gambler's Dice", passive: 'gamblers_dice' },
  ADRENALINE_GLAND: { name: 'Adrenaline Gland', passive: 'adrenaline' },
  ALCHEMISTS_BELT: { name: "Alchemist's Belt", passive: 'alchemist_belt' },
} as const;

export type AccessoryKey = keyof typeof ACCESSORIES;

export function createAccessory(key: AccessoryKey, id: string): Accessory {
  const a = ACCESSORIES[key];
  return { id, kind: 'ACCESSORY', name: a.name, value: 0, passive: a.passive };
}

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
// the implementing code by `effect` ID, same as a Weapon's `passive`.
const CONSUMABLES = {
  LIQUID_FIRE_FLASK: { name: 'Liquid Fire Flask', effect: 'throw_fire_hazard', value: 3 }, // range
  SHOCK_GRENADE: { name: 'Shock Grenade', effect: 'throw_shock_grenade', value: 3 }, // range
  ICE_BARRICADE_SCROLL: { name: 'Ice-Barricade Scroll', effect: 'ice_barricade', value: 5 }, // turns
  STAMINA_DRAUGHT: { name: 'Stamina Draught', effect: 'restore_stamina', value: 0 },
  QUICKSILVER_FLASK: { name: 'Quicksilver Flask', effect: 'quicksilver', value: 3 }, // charges
  RECALL_RUNE: { name: 'Recall Rune', effect: 'recall', value: 0 },
  ECHO_GEODE: { name: 'Echo Geode', effect: 'echo_geode', value: 50 }, // Echoes
  WHETSTONE: { name: 'Whetstone', effect: 'whetstone', value: 0 },
} as const satisfies Record<string, { name: string; effect: string; value: number }>;

export type ConsumableKey = keyof typeof CONSUMABLES;

export function createConsumable(key: ConsumableKey, id: string): Consumable {
  const c = CONSUMABLES[key];
  return { id, kind: 'CONSUMABLE', name: c.name, value: c.value, effect: c.effect };
}

// Chest loot pools per floor (Section 6D tiers: Floor 2+ and Floor 3 accessories
// unlock deeper). Contents are rolled from the floor's deterministic RNG stream,
// so they are identical every loop of a save.
type ChestRoll = (id: string) => Item;

const CHEST_POOL_F1: ChestRoll[] = [
  createPotion,
  (id) => createWeapon('EMBER_BLADE', id),
  (id) => createAccessory('IRON_RING', id),
  (id) => createAccessory('RING_OF_VIGOR', id),
  // Phase 8: simple, low-power items are reachable from Floor 1 too.
  (id) => createWeapon('FROSTBITE_DAGGER', id),
  (id) => createWeapon('TORCH_OF_THE_WATCH', id),
  (id) => createConsumable('STAMINA_DRAUGHT', id),
];
const CHEST_POOL_F2: ChestRoll[] = [
  ...CHEST_POOL_F1,
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
const CHEST_POOL_F3: ChestRoll[] = [
  ...CHEST_POOL_F2,
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
  const pool = floorNumber >= 3 ? CHEST_POOL_F3 : floorNumber === 2 ? CHEST_POOL_F2 : CHEST_POOL_F1;
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

// Enemy death drops (Section 6A/6C). Phase 3 only wires the data + roll
// function; nothing calls this until Phase 4 implements enemy death.
type DropRoll = (id: string) => Item;

const ENEMY_DROPS: Partial<Record<EnemyKind, DropRoll[]>> = {
  BONE_GRUNT: [(id) => createWeapon('RUSTY_SWORD', id), createPotion],
  EMBER_BAT: [(id) => createWeapon('EMBER_BLADE', id)],
  VOLT_TURRET: [(id) => createWeapon('VOLT_SPEAR', id)],
  FROST_WRAITH: [(id) => createWeapon('FROST_WAND', id)],
  TIME_WEAVER: [(id) => createWeapon('CHRONO_BLADE', id), (id) => ({ ...createPotion(id), name: 'Max Potion', value: 999 })],
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
  return { id, kind: 'TIME_SHARD', name: 'Time Shard', value: 2 };
}
