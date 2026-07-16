// Sprite Registry (GDD Section 4): every drawable maps to one {col, row} cell
// of assets/spritesheet.png (Kenney Micro Roguelike — 8x8 tiles, tightly
// packed, 16 columns x 10 rows). Source rect: sx = col * 8, sy = row * 8,
// 8x8. Re-pointing an entity's art is a data edit here, never a code edit.
//
// NOTE: coordinates below were assigned by eyeballing the sheet at 10x zoom —
// they land on sensible cells (hero, ghost, door, portal, potion, ...) but are
// still first-pass picks. Adjust any {col, row} to taste; nothing else needs
// to change.

export interface SpriteRef {
  col: number;
  row: number;
}

export const SHEET_COLS = 16;
export const SHEET_ROWS = 10;

export const SPRITES = {
  // --- Player ---
  PLAYER: { col: 5, row: 0 }, // orange-haired hero

  // --- Enemies (kinds in types.ts) ---
  BONE_GRUNT: { col: 10, row: 0 }, // grey skeletal figure
  EMBER_BAT: { col: 11, row: 1 }, // small red critter
  VOLT_TURRET: { col: 10, row: 2 }, // squat grey automaton
  FROST_WRAITH: { col: 9, row: 1 }, // white ghost
  TIME_WEAVER: { col: 8, row: 0 }, // hooded figure
  CHRONO_LICH: { col: 13, row: 0 }, // dark, yellow-eyed horror
  // Phase 11 roster (GDD Section 6C) — reserved now so the art pass is a
  // data edit when the kinds land in code.
  BONE_KNIGHT: { col: 5, row: 0 }, // armored figure
  CINDER_SHAMAN: { col: 9, row: 0 }, // round-hatted caster
  VOLT_HOUND: { col: 5, row: 1 }, // four-legged beast
  FROST_SENTINEL: { col: 13, row: 1 }, // pale statue
  INFERNO_GOLEM: { col: 12, row: 0 }, // broad red hulk
  STORM_CALLER: { col: 7, row: 0 }, // green-garbed caster
  GLACIAL_KNIGHT: { col: 6, row: 0 }, // plated warrior

  // --- Terrain (TILE values in mapgen.ts) ---
  FLOOR: { col: 4, row: 4 }, // dark speckled ground
  WALL: { col: 1, row: 0 }, // grey brick face
  DOOR: { col: 4, row: 2 }, // brown door in frame
  STAIRS: { col: 5, row: 3 }, // stairs down
  SHORTCUT_GATE: { col: 1, row: 8 }, // green swirl portal
  BOSS_GATE: { col: 7, row: 2 }, // golden padlock
  FIRE_HAZARD: { col: 8, row: 8 }, // burning flame
  SHOP_TERMINAL: { col: 3, row: 8 }, // Hub-only Upgrade Shop terminal (Phase 13)

  // --- World-item pickups (Item.kind in types.ts) ---
  CHEST: { col: 8, row: 2 }, // urn-shaped container
  WEAPON: { col: 6, row: 4 }, // diagonal sword
  ACCESSORY: { col: 10, row: 5 }, // gold ring
  POTION: { col: 7, row: 8 }, // red-liquid bottle
  CONSUMABLE: { col: 5, row: 8 }, // banded rod/scroll
  TIME_SHARD: { col: 4, row: 8 }, // yellow sparkles
  ANCHOR: { col: 11, row: 5 }, // golden key ("pins" the Biome)
} as const satisfies Record<string, SpriteRef>;

export type SpriteName = keyof typeof SPRITES;
