// Game content tables transcribed from the GDD: the Elemental Wheel (Section 5)
// and the bestiary, weapons, and accessories (Section 6).

import type { Accessory, Element, Enemy, Item, Weapon } from './types';

export type EnemyKind = Enemy['kind'];

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
  VOLT_TURRET: { hp: 25, attack: 6, defense: 3, speed: 0, element: 'VOLT' },
  FROST_WRAITH: { hp: 18, attack: 5, defense: 2, speed: 1, element: 'FROST' },
  TIME_WEAVER: { hp: 40, attack: 8, defense: 4, speed: 1, element: 'CHRONO' },
  CHRONO_LICH: { hp: 150, attack: 12, defense: 5, speed: 1, element: 'CHRONO' },
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

// Weapons (Section 6A).
const WEAPONS = {
  RUSTY_SWORD: { name: 'Rusty Sword', atk: 3, element: 'PHYSICAL', passive: 'none' },
  BONE_DAGGER: { name: 'Bone Dagger', atk: 2, element: 'PHYSICAL', passive: 'free_swap' },
  EMBER_BLADE: { name: 'Ember Blade', atk: 5, element: 'FIRE', passive: 'burn_25' },
  VOLT_SPEAR: { name: 'Volt Spear', atk: 4, element: 'VOLT', passive: 'pierce_1' },
  FROST_WAND: { name: 'Frost Wand', atk: 3, element: 'FROST', passive: 'ranged_3' },
  CHRONO_BLADE: { name: 'Chrono-Blade', atk: 7, element: 'CHRONO', passive: 'kill_refund_turn' },
} as const satisfies Record<string, { name: string; atk: number; element: Element; passive: string }>;

export type WeaponKey = keyof typeof WEAPONS;

export function createWeapon(key: WeaponKey, id: string): Weapon {
  const w = WEAPONS[key];
  return { id, kind: 'WEAPON', name: w.name, value: 0, atk: w.atk, element: w.element, passive: w.passive };
}

// Accessories (Section 6D).
const ACCESSORIES = {
  IRON_RING: { name: 'Iron Ring', passive: 'def_plus_2' },
  RING_OF_VIGOR: { name: 'Ring of Vigor', passive: 'max_hp_plus_10' },
  BOOTS_OF_HASTE: { name: 'Boots of Haste', passive: 'dash_discount' },
  ECHO_CHARM: { name: 'Echo Charm', passive: 'echo_bonus_20' },
  EMBER_PENDANT: { name: 'Ember Pendant', passive: 'burn_immune' },
  WINGED_ANKLET: { name: 'Winged Anklet', passive: 'chill_immune' },
  GROUNDING_BAND: { name: 'Grounding Band', passive: 'stun_immune' },
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

// Chest loot pools per floor (Section 6D tiers: Floor 2+ and Floor 3 accessories
// unlock deeper). Contents are rolled from the floor's deterministic RNG stream,
// so they are identical every loop of a save.
type ChestRoll = (id: string) => Item;

const CHEST_POOL_F1: ChestRoll[] = [
  createPotion,
  (id) => createWeapon('EMBER_BLADE', id),
  (id) => createAccessory('IRON_RING', id),
  (id) => createAccessory('RING_OF_VIGOR', id),
];
const CHEST_POOL_F2: ChestRoll[] = [
  ...CHEST_POOL_F1,
  (id) => createAccessory('BOOTS_OF_HASTE', id),
  (id) => createAccessory('ECHO_CHARM', id),
  (id) => createAccessory('EMBER_PENDANT', id),
  (id) => createAccessory('WINGED_ANKLET', id),
];
const CHEST_POOL_F3: ChestRoll[] = [...CHEST_POOL_F2, (id) => createAccessory('GROUNDING_BAND', id)];

export function rollChestItem(rng: () => number, floorNumber: number, id: string): Item {
  const pool = floorNumber >= 3 ? CHEST_POOL_F3 : floorNumber === 2 ? CHEST_POOL_F2 : CHEST_POOL_F1;
  return pool[Math.floor(rng() * pool.length)](id);
}
