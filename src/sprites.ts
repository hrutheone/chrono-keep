// Sprite Registry (GDD Section 4): every drawable maps to one {col, row} cell
// of assets/new-spritesheet.png (a Kenney-style RPG/UI icon pack — 16x16
// tiles, tightly packed, 49 columns x 22 rows). Source rect: sx = col * 16,
// sy = row * 16, 16x16. Re-pointing an entity's art is a data edit here,
// never a code edit.
//
// New-spritesheet migration: the project switched from the old 8x8
// Micro-Roguelike sheet (128x80, 16x10) to this bigger 16x16 icon pack
// (784x352, 49x22) — assets.ts's SPRITE_PX and this file's SHEET_COLS/
// SHEET_ROWS were updated to match, and every {col, row} below was re-picked
// from scratch (the old coordinates point at completely different art on
// this sheet). This pack skews toward UI icons, terrain, and a handful of
// humanoid "bust" portraits + 3-color critter sprites rather than the old
// sheet's one-distinct-silhouette-per-monster cast, so several entries below
// are a loose thematic fit (documented per entry) rather than a literal
// match to the name/kind — swap freely, same as the old sheet invited.

import type { Element } from './types';

export interface SpriteRef {
  col: number;
  row: number;
}

export const SHEET_COLS = 49;
export const SHEET_ROWS = 22;

export const SPRITES = {
  // --- Player ---
  PLAYER: { col: 28, row: 0 }, // wide-brim-hat adventurer bust

  // --- Enemies (kinds in types.ts) ---
  // The sheet has no per-monster silhouettes (skeleton/bat/ghost/etc.) — it
  // has one column (24) of robed/hooded "caster" busts, one column (25-31)
  // of plain humanoid busts, a handful of animals, and a 3-color (blue/
  // yellow/green) critter repeated across a few columns. Enemies below pull
  // from whichever reads closest to their GDD flavor.
  BONE_GRUNT: { col: 27, row: 6 }, // slender bust, arms visible — reads skeletal
  EMBER_BAT: { col: 18, row: 8 }, // small yellow critter (closest warm color to "red")
  VOLT_TURRET: { col: 18, row: 7 }, // same critter in blue — reads electric/squat
  FROST_WRAITH: { col: 24, row: 8 }, // hollow/outline humanoid — genuinely ghostly
  TIME_WEAVER: { col: 24, row: 0 }, // robed, hooded, arms down
  CHRONO_LICH: { col: 38, row: 11 }, // clean front-facing skull icon
  // Phase 11 roster (GDD Section 6C).
  BONE_KNIGHT: { col: 30, row: 6 }, // blocky bust with mechanical arms — armored
  CINDER_SHAMAN: { col: 24, row: 1 }, // robed bust, arms raised mid-cast
  VOLT_HOUND: { col: 28, row: 7 }, // horse — the sheet's only four-legged beast
  FROST_SENTINEL: { col: 24, row: 7 }, // plain solid grey bust — pale, statue-like
  INFERNO_GOLEM: { col: 30, row: 5 }, // broad round-domed bust — bulky "hulk" shape
  STORM_CALLER: { col: 24, row: 2 }, // robed bust, distinct floatier silhouette
  GLACIAL_KNIGHT: { col: 31, row: 6 }, // bust with a slotted armor-plate torso

  // --- Terrain (TILE values in mapgen.ts) ---
  FLOOR: { col: 0, row: 0 }, // dark ground
  WALL: { col: 8, row: 0 }, // dark brick wall block
  DOOR: { col: 11, row: 3 }, // door arch
  STAIRS: { col: 2, row: 6 }, // stairs
  SHORTCUT_GATE: { col: 1, row: 9 }, // blue gate
  BOSS_GATE: { col: 0, row: 9 }, // blue padlock
  FIRE_HAZARD: { col: 14, row: 10 }, // orange flame
  FROST_HAZARD: { col: 14, row: 18 }, // blue water droplet
  SHOP_TERMINAL: { col: 0, row: 20 }, // tree brach
  CURSED_RIFT: { col: 13, row: 17 }, // dark red brick pattern — ominous texture

  // --- World-item pickups (Item.kind in types.ts) ---
  CHEST: { col: 8, row: 6 }, // brown chest with a latch
  WEAPON: { col: 32, row: 2 }, // diagonal sword
  ACCESSORY: { col: 45, row: 6 }, // gold ring
  POTION: { col: 41, row: 11 }, // blue potion bottle
  CONSUMABLE: { col: 39, row: 8 }, // wand/rod shape
  TIME_SHARD: { col: 39, row: 12 }, // hourglass
  ANCHOR: { col: 32, row: 11 }, // golden key ("pins" the Biome)
  // Generic fallback only — every Relic actually drops/renders with its own
  // per-effect icon (RELIC_SPRITE_BY_EFFECT below), used by render.ts's
  // WorldItem loop and hud.ts's Relic Tray alike. Same cell as
  // executioners_coin below, matching the old sheet's own precedent.
  RELIC: { col: 41, row: 3 }, // gold coin
} as const satisfies Record<string, SpriteRef>;

export type SpriteName = keyof typeof SPRITES;

// Menu redesign (Skill tab grid): the sheet has no per-skill art, so every
// Skill shares one icon with its Element instead — reusing cells the
// codebase already assigns that flavor to elsewhere, rather than picking new
// unverified cells: FIRE_HAZARD/FROST_HAZARD's hazard-tile flame/droplet,
// VOLT_TURRET's critter ("reads electric" per its own comment above),
// TIME_SHARD's hourglass for CHRONO, and WEAPON's sword for PHYSICAL.
export const SKILL_SPRITE_BY_ELEMENT: Record<Element, SpriteRef> = {
  PHYSICAL: SPRITES.WEAPON,
  FIRE: SPRITES.FIRE_HAZARD,
  VOLT: SPRITES.VOLT_TURRET,
  FROST: SPRITES.FROST_HAZARD,
  CHRONO: SPRITES.TIME_SHARD,
};

// Phase 19 Relic Tray + world-drop icons: one distinct cell per Chronofact,
// keyed by the same `effect` string content.ts's RELICS registry and
// `run.relics` both use — picked for a loose thematic fit (a coin for
// Executioner's Coin, hearts for the HP-themed relics, a gear for Static
// Generator, a glove for Duelist's Glove, ...) rather than anything
// definitive; swap freely, this is exactly the kind of "adjust to taste"
// pick the header comment above describes.
export const RELIC_SPRITE_BY_EFFECT: Record<string, SpriteRef> = {
  gunpowder_flask: { col: 15, row: 10 }, // orange flame (2nd variant)
  executioners_coin: { col: 41, row: 3 }, // gold coin
  static_generator: { col: 15, row: 11 }, // grey stacked gears
  giants_anvil: { col: 48, row: 4 }, // solid brown block/banner
  duelists_glove: { col: 41, row: 1 }, // brown open-hand glove
  vampires_cape: { col: 39, row: 10 }, // red heart (solid)
  troll_blood: { col: 40, row: 10 }, // red heart (outline variant)
  mirror_shield: { col: 37, row: 2 }, // brown ornate circular shield
  phoenix_feather: { col: 42, row: 10 }, // red heart (double-line variant)
  hourglass_shard: { col: 43, row: 12 }, // glowing gold orb
  golden_scarab: { col: 47, row: 4 }, // brown backpack (treasure container)
  echo_magnet: { col: 44, row: 7 }, // grey rounded gem/orb outline
  cartographers_lens: { col: 47, row: 0 }, // circular dial with a center dot
  alchemists_satchel: { col: 43, row: 10 }, // blue cross/plus
  time_eaters_jaw: { col: 39, row: 12 }, // hourglass (Time Shard's own cell)
};

// Per-item icons (keyed by the item's own `name` field, exactly as written in
// content.ts's WEAPONS/ACCESSORIES/POTIONS/CONSUMABLES registries) — one
// sprite per individual item, not just per Item.kind. menus.ts's inventory
// grid/detail panel looks a name up here first, falling back to SPRITES'
// kind-level generic (WEAPON/ACCESSORY/POTION/CONSUMABLE above) only if a
// name is ever missing (shouldn't happen — every catalog entry has an entry
// below, kept in the same order as its content.ts registry so the two stay
// easy to diff against each other).
//
// The sheet has 26 grey sword/dagger-shaped cells, which happens to be
// exactly enough for the 23 sword-flavored + 2 dagger weapons below (one
// cell spare) — every WEAPON entry is a genuinely distinct cell, no reuse.
// Same for POTION/CONSUMABLE. ACCESSORY reuses a couple of ring/pendant/gem
// cells across two entries apiece (19 items, ~12 distinct jewelry-shaped
// cells) — documented inline where it happens.
export const WEAPON_SPRITE_BY_NAME: Record<string, SpriteRef> = {
  // --- Early game (F1-F20) ---
  'Rusty Sword': { col: 32, row: 2 },
  'Bone Dagger': { col: 34, row: 6 },
  'Mythril Hammer': { col: 35, row: 2 },
  'Mage Masher': { col: 32, row: 6 },
  'Flametongue': { col: 33, row: 7 },
  'Ice Lance': { col: 35, row: 3 },
  'Partisan': { col: 36, row: 3 },
  'Glass Sword': { col: 33, row: 2 },
  'Broadsword': { col: 34, row: 2 },
  'Ash Wand': { col: 32, row: 4 },
  'Bone Club': { col: 36, row: 2 },
  'Defender': { col: 33, row: 6 },

  // --- Mid game (F21-F50) ---
  'Thunder Rod': { col: 33, row: 4 },
  "Ifrit's Blade": { col: 34, row: 7 },
  'Elven Bow': { col: 37, row: 5 },
  'Blood Sword': { col: 32, row: 3 },
  'Coral Sword': { col: 33, row: 3 },
  "Dark Knight's Blade": { col: 34, row: 3 },
  "Assassin's Dagger": { col: 35, row: 6 },
  'Flamberge': { col: 32, row: 7 },
  'Trident': { col: 40, row: 7 }, // the sheet's actual trident icon
  'Bio-Blade': { col: 35, row: 7 },
  'Murasame': { col: 36, row: 7 },
  'Gale Bow': { col: 38, row: 5 },
  'Kotetsu': { col: 32, row: 8 },
  'Diamond Mace': { col: 37, row: 7 },

  // --- Late game (F51-F99) ---
  'Firaga Edge': { col: 33, row: 8 },
  'Ice Brand': { col: 34, row: 8 },
  'Blitz Whip': { col: 34, row: 4 },
  'Rune Axe': { col: 41, row: 7 }, // the sheet's actual (double-headed) axe icon
  'Excalibur': { col: 35, row: 8 },
  'Holy Lance': { col: 35, row: 5 },
  'Ultima Weapon': { col: 32, row: 9 },
  'Ragnarok': { col: 33, row: 9 },
  'Gungnir': { col: 42, row: 7 },
  'Save the Queen': { col: 36, row: 8 },
  'Blood Lance': { col: 39, row: 7 },
  'Deathbringer': { col: 36, row: 9 },
  'Apocalypse': { col: 35, row: 9 },
  'Masamune': { col: 34, row: 9 },
};

export const ACCESSORY_SPRITE_BY_NAME: Record<string, SpriteRef> = {
  'Iron Ring': { col: 43, row: 6 }, // brown pendant
  'Ring of Vigor': { col: 44, row: 6 }, // grey pendant
  'Boots of Haste': { col: 39, row: 1 },
  'Echo Charm': { col: 43, row: 8 }, // brown pendant (2nd design)
  'Ember Pendant': { col: 45, row: 8 }, // yellow pendant
  'Winged Anklet': { col: 40, row: 1 }, // 2nd boots pose
  'Grounding Band': { col: 46, row: 6 }, // blue pendant
  "Berserker's Cuff": { col: 41, row: 1 }, // brown glove
  "Paladin's Mantle": { col: 37, row: 1 }, // brown robe/sleeves
  'Battery Cell': { col: 44, row: 4 }, // grey battery/canister
  'Kindling Pouch': { col: 45, row: 3 }, // brown pouch
  'Capacitor Ring': { col: 45, row: 6 }, // yellow pendant (shared design w/ Ember Pendant, different color already used above so this is its own cell)
  'Permafrost Vial': { col: 42, row: 11 }, // blue potion outline
  'Vampire Tooth': { col: 32, row: 12 }, // grey bone
  'Shattered Hourglass': { col: 41, row: 12 }, // grey hourglass outline
  'Spiked Pauldrons': { col: 47, row: 7 }, // brown vest/armor piece
  "Gambler's Dice": { col: 43, row: 13 }, // grey 4-leaf clover (luck)
  'Adrenaline Gland': { col: 41, row: 10 }, // red cracked/half heart
  "Alchemist's Belt": { col: 45, row: 4 }, // brown jar/vial pouch
};

export const POTION_SPRITE_BY_NAME: Record<string, SpriteRef> = {
  'Potion': { col: 39, row: 10 }, // plain grey potion jug
  'Max Potion': { col: 42, row: 10 }, // brown potion jug
  'Minor Potion': { col: 40, row: 10 }, // blue potion (outline style)
  'Hi-Potion': { col: 41, row: 10 }, // blue potion (solid)
  'Megalixir': { col: 43, row: 11 }, // red health-cross (cures Status too)
  'Soma Drop': { col: 43, row: 12 }, // glowing gold orb — a rewrite, not a heal
};

export const CONSUMABLE_SPRITE_BY_NAME: Record<string, SpriteRef> = {
  'Liquid Fire Flask': { col: 45, row: 5 }, // brown fuel canister
  'Shock Grenade': { col: 45, row: 9 }, // grey bomb
  'Ice-Barricade Scroll': { col: 46, row: 5 }, // brown scroll/map
  'Stamina Draught': { col: 44, row: 10 }, // blue cross/plus
  'Quicksilver Flask': { col: 40, row: 11 }, // blue potion outline
  'Recall Rune': { col: 42, row: 12 }, // grey hourglass outline (winds time back)
  'Echo Geode': { col: 43, row: 7 }, // brown gem
  'Whetstone': { col: 5, row: 2 }, // grey rocks — literally a stone
};
