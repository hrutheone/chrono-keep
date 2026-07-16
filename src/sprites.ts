// Programmatic 8x8 sprite matrices (GDD Section 4).
// 0 = transparent, 1 = light (#ffb300), 2 = midtone (#996600).

export type Sprite = number[][];

// Facing DOWN (front view): 2-pixel eye marker at row 1.
export const PLAYER_SPRITE: Sprite = [
  [0,0,1,1,1,1,0,0],
  [0,1,2,1,1,2,1,0],
  [0,1,1,1,1,1,1,0],
  [0,0,1,2,2,1,0,0],
  [0,1,1,1,1,1,1,0],
  [0,1,0,1,1,0,1,0],
  [0,0,1,1,1,1,0,0],
  [0,1,0,0,0,0,1,0],
];

// Facing UP (back view): same silhouette, no eye marker on the back of the head.
export const PLAYER_SPRITE_UP: Sprite = [
  [0,0,1,1,1,1,0,0],
  [0,1,1,1,1,1,1,0],
  [0,1,1,1,1,1,1,0],
  [0,0,1,2,2,1,0,0],
  [0,1,1,1,1,1,1,0],
  [0,1,0,1,1,0,1,0],
  [0,0,1,1,1,1,0,0],
  [0,1,0,0,0,0,1,0],
];

// Facing RIGHT (profile view, single eye toward the front); flipped
// horizontally at draw time for LEFT.
export const PLAYER_SPRITE_SIDE: Sprite = [
  [0,0,1,1,1,1,0,0],
  [0,1,1,1,1,2,1,0],
  [0,1,1,1,1,1,1,0],
  [0,0,1,1,2,1,0,0],
  [0,1,1,1,1,1,1,0],
  [0,1,0,1,1,0,1,0],
  [0,0,1,1,1,1,0,0],
  [0,1,0,0,0,0,1,0],
];

// --- Monsters ---

// Skull head with hollow eyes over a narrow ribcage.
export const BONE_GRUNT_SPRITE: Sprite = [
  [0,0,1,1,1,1,0,0],
  [0,1,1,1,1,1,1,0],
  [0,1,0,1,1,0,1,0],
  [0,1,1,2,2,1,1,0],
  [0,0,1,1,1,1,0,0],
  [0,0,2,1,1,2,0,0],
  [0,0,1,2,2,1,0,0],
  [0,0,2,0,0,2,0,0],
];

// Wide wings around a small fanged body.
export const EMBER_BAT_SPRITE: Sprite = [
  [0,0,0,0,0,0,0,0],
  [1,0,0,0,0,0,0,1],
  [1,1,0,1,1,0,1,1],
  [1,1,1,1,1,1,1,1],
  [0,1,1,2,2,1,1,0],
  [0,0,1,1,1,1,0,0],
  [0,0,0,1,1,0,0,0],
  [0,0,0,0,0,0,0,0],
];

// Boxy chassis on a base, glowing bolt core.
export const VOLT_TURRET_SPRITE: Sprite = [
  [0,2,2,2,2,2,2,0],
  [0,2,1,1,1,1,2,0],
  [0,2,1,0,1,1,2,0],
  [0,2,1,1,0,1,2,0],
  [0,2,1,0,1,1,2,0],
  [0,2,1,1,1,1,2,0],
  [0,2,2,2,2,2,2,0],
  [2,2,2,2,2,2,2,2],
];

// Hooded ghost with dark eyes and a ragged, trailing hem.
export const FROST_WRAITH_SPRITE: Sprite = [
  [0,0,1,1,1,1,0,0],
  [0,1,1,1,1,1,1,0],
  [0,1,0,1,1,0,1,0],
  [0,1,1,1,1,1,1,0],
  [0,2,1,1,1,1,2,0],
  [0,2,1,1,1,1,2,0],
  [0,1,2,1,1,2,1,0],
  [0,1,0,2,0,2,1,0],
];

// Robed elite holding an hourglass at its core.
export const TIME_WEAVER_SPRITE: Sprite = [
  [0,0,0,1,1,0,0,0],
  [0,0,1,2,2,1,0,0],
  [0,1,1,1,1,1,1,0],
  [1,1,1,2,2,1,1,1],
  [1,0,1,0,0,1,0,1],
  [0,0,1,2,2,1,0,0],
  [0,1,1,1,1,1,1,0],
  [0,2,2,2,2,2,2,0],
];

// Crowned skull boss with burning eye sockets and a broad robe.
export const CHRONO_LICH_SPRITE: Sprite = [
  [1,0,1,0,0,1,0,1],
  [1,1,1,1,1,1,1,1],
  [1,2,0,1,1,0,2,1],
  [1,1,1,2,2,1,1,1],
  [0,1,2,1,1,2,1,0],
  [0,1,1,1,1,1,1,0],
  [1,1,2,1,1,2,1,1],
  [1,2,2,1,1,2,2,1],
];

// --- Tiles ---

// Solid brick courses with midtone mortar lines.
export const WALL_SPRITE: Sprite = [
  [1,1,1,2,1,1,1,2],
  [1,1,1,2,1,1,1,2],
  [2,2,2,2,2,2,2,2],
  [1,2,1,1,1,2,1,1],
  [1,2,1,1,1,2,1,1],
  [2,2,2,2,2,2,2,2],
  [1,1,1,2,1,1,1,2],
  [1,1,1,2,1,1,1,2],
];

// Arched door with planked midtone face and a handle.
export const DOOR_SPRITE: Sprite = [
  [0,1,1,1,1,1,1,0],
  [1,2,2,1,1,2,2,1],
  [1,2,2,1,1,2,2,1],
  [1,2,2,1,1,2,2,1],
  [1,2,2,1,1,2,2,1],
  [1,2,2,1,1,1,2,1],
  [1,2,2,1,1,1,2,1],
  [1,2,2,1,1,2,2,1],
];

// Steps descending into darkness (top-left to bottom-right).
export const STAIRS_SPRITE: Sprite = [
  [1,1,1,1,1,1,1,1],
  [1,0,0,0,0,0,0,1],
  [1,2,0,0,0,0,0,1],
  [1,2,2,0,0,0,0,1],
  [1,2,2,2,0,0,0,1],
  [1,2,2,2,2,0,0,1],
  [1,2,2,2,2,2,0,1],
  [1,1,1,1,1,1,1,1],
];

// Temporal Anchor: an hourglass with sand mid-fall.
export const ANCHOR_SPRITE: Sprite = [
  [0,1,1,1,1,1,1,0],
  [0,0,1,2,2,1,0,0],
  [0,0,1,2,2,1,0,0],
  [0,0,0,1,1,0,0,0],
  [0,0,0,1,1,0,0,0],
  [0,0,1,0,0,1,0,0],
  [0,0,1,2,2,1,0,0],
  [0,1,1,1,1,1,1,0],
];

// Shortcut Gate: light portcullis bars with a lever notch.
export const SHORTCUT_GATE_SPRITE: Sprite = [
  [1,1,1,1,1,1,1,1],
  [1,0,2,0,0,2,0,1],
  [1,0,2,0,0,2,0,1],
  [1,2,2,2,2,2,2,1],
  [1,0,2,0,0,2,0,1],
  [1,0,2,0,0,2,0,1],
  [1,0,2,0,0,2,0,1],
  [1,1,1,1,1,1,1,1],
];

// Boss Gate: heavy slab bearing a skull sigil.
export const BOSS_GATE_SPRITE: Sprite = [
  [1,1,1,1,1,1,1,1],
  [1,2,2,2,2,2,2,1],
  [1,2,1,1,1,1,2,1],
  [1,2,1,0,0,1,2,1],
  [1,2,1,1,1,1,2,1],
  [1,2,0,1,1,0,2,1],
  [1,2,2,2,2,2,2,1],
  [1,1,1,1,1,1,1,1],
];

// --- Pickups & hazards ---

// Chest: lid seam across the middle, midtone latch.
export const CHEST_SPRITE: Sprite = [
  [0,0,0,0,0,0,0,0],
  [0,1,1,1,1,1,1,0],
  [1,2,2,2,2,2,2,1],
  [1,1,1,1,1,1,1,1],
  [1,2,2,1,1,2,2,1],
  [1,2,2,2,2,2,2,1],
  [1,1,1,1,1,1,1,1],
  [0,0,0,0,0,0,0,0],
];

// Weapon pickup: diagonal sword with midtone crossguard.
export const WEAPON_PICKUP_SPRITE: Sprite = [
  [0,0,0,0,0,0,1,0],
  [0,0,0,0,0,1,1,0],
  [0,0,0,0,1,1,0,0],
  [0,0,0,1,1,0,0,0],
  [0,2,1,1,0,0,0,0],
  [0,0,2,2,0,0,0,0],
  [0,2,2,0,2,0,0,0],
  [2,2,0,0,0,0,0,0],
];

// Potion: corked flask with liquid fill.
export const POTION_SPRITE: Sprite = [
  [0,0,0,2,2,0,0,0],
  [0,0,0,1,1,0,0,0],
  [0,0,0,1,1,0,0,0],
  [0,0,1,0,0,1,0,0],
  [0,1,0,2,2,0,1,0],
  [0,1,2,2,2,2,1,0],
  [0,1,2,2,2,2,1,0],
  [0,0,1,1,1,1,0,0],
];

// Accessory pickup: a ring, so it reads distinctly from a chest at a glance.
export const ACCESSORY_PICKUP_SPRITE: Sprite = [
  [0,0,1,1,1,1,0,0],
  [0,1,2,2,2,2,1,0],
  [1,2,0,0,0,0,2,1],
  [1,2,0,0,0,0,2,1],
  [1,2,0,0,0,0,2,1],
  [1,2,0,0,0,0,2,1],
  [0,1,2,2,2,2,1,0],
  [0,0,1,1,1,1,0,0],
];

// Tactical Consumable pickup: a rolled, banded scroll (distinct from the
// corked-flask Potion silhouette).
export const CONSUMABLE_PICKUP_SPRITE: Sprite = [
  [1,1,0,0,0,0,1,1],
  [1,2,1,1,1,1,2,1],
  [0,1,1,1,1,1,1,0],
  [0,1,2,2,2,2,1,0],
  [0,1,2,2,2,2,1,0],
  [0,1,1,1,1,1,1,0],
  [1,2,1,1,1,1,2,1],
  [1,1,0,0,0,0,1,1],
];

// Time Shard: a small faceted shard, distinct from the Anchor hourglass.
export const TIME_SHARD_SPRITE: Sprite = [
  [0,0,0,1,0,0,0,0],
  [0,0,1,1,1,0,0,0],
  [0,1,1,2,1,1,0,0],
  [1,1,2,2,2,1,1,0],
  [0,1,1,2,1,1,0,0],
  [0,0,1,1,1,0,0,0],
  [0,0,0,1,0,0,0,0],
  [0,0,0,0,0,0,0,0],
];

// Fire hazard: flame licks over a midtone ember bed.
export const FIRE_HAZARD_SPRITE: Sprite = [
  [0,0,0,1,0,0,0,0],
  [0,1,0,1,0,0,1,0],
  [0,1,0,1,1,0,1,0],
  [1,1,1,0,1,1,1,0],
  [1,0,1,1,1,0,1,1],
  [1,1,2,1,2,1,1,1],
  [2,1,2,2,2,2,1,2],
  [2,2,2,2,2,2,2,2],
];
