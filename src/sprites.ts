// Spritesheet mapping.

import type { SkillId } from './content';
import type { StatTrack } from './shop';

export interface SpriteRef {
  col: number;
  row: number;
}

export const SHEET_COLS = 49;
export const SHEET_ROWS = 22;

export const SPRITES = {
  // --- Player ---
  PLAYER: { col: 28, row: 0 }, // worrior with sword and shield, facing forward

  // --- Hub NPC ---
  SILAS: { col: 24, row: 1 }, // hooded elderly man
  SILAS_FACE: { col: 26, row: 10 }, // portrait face, for the dialogue box

  // --- Enemies ---
  BONE_GRUNT: { col: 29, row: 6 }, // slender bust, arms visible — reads skeletal
  EMBER_BAT: { col: 26, row: 8 }, // small yellow critter (closest warm color to "red")
  VOLT_TURRET: { col: 31, row: 5 }, // small critter — reads electric/squat
  FROST_WRAITH: { col: 24, row: 8 }, // hollow/outline humanoid — genuinely ghostly
  TIME_WEAVER: { col: 24, row: 0 }, // robed, hooded, arms down
  CHRONO_LICH: { col: 29, row: 2 }, // clean front-facing skull icon
  BONE_KNIGHT: { col: 30, row: 6 }, // blocky bust with mechanical arms — armored
  CINDER_SHAMAN: { col: 24, row: 1 }, // robed bust, arms raised mid-cast
  VOLT_HOUND: { col: 28, row: 7 }, // horse — the sheet's only four-legged beast
  FROST_SENTINEL: { col: 24, row: 7 }, // plain solid grey bust — pale, statue-like
  INFERNO_GOLEM: { col: 28, row: 6 }, // broad round-domed bust — bulky "hulk" shape
  STORM_CALLER: { col: 27, row: 3 }, // robed bust, distinct floatier silhouette
  GLACIAL_KNIGHT: { col: 31, row: 6 }, // bust with a slotted armor-plate torso

  // --- Tier 3 (Floor 41+ upgrades) — same silhouette as base kind, tinted via auraColor ---
  CLOCKWORK_SCARAB: { col: 26, row: 5 }, // small insect
  DREAD_LEGION: { col: 29, row: 6 }, // same as Bone-Grunt
  DOOM_GUARD: { col: 30, row: 6 }, // same as Bone-Knight
  ASH_FIEND: { col: 26, row: 8 }, // same as Ember-Bat
  HELLFIRE_MAGUS: { col: 24, row: 1 }, // same as Cinder-Shaman
  TESLA_COIL: { col: 31, row: 5 }, // same as Volt-Turret
  STORM_STALKER: { col: 28, row: 7 }, // same as Volt-Hound
  VOID_SPIRIT: { col: 24, row: 8 }, // same as Frost-Wraith
  GLACIAL_MONOLITH: { col: 24, row: 7 }, // same as Frost-Sentinel

  // --- Terrain ---
  FLOOR: { col: 0, row: 0 }, // dark ground
  WALL: { col: 8, row: 0 }, // straight wall segment, drawn vertical (N-S)
  WALL_CORNER: { col: 9, row: 0 }, // wall corner, drawn connecting East+South
  WALL_T: { col: 10, row: 0 }, // 3-way wall junction, drawn connecting North+East+South
  WALL_CROSS: { col: 11, row: 0 }, // 4-way wall junction (symmetric)
  WALL_END: { col: 12, row: 0 }, // wall dead-end, drawn connecting South only
  DOOR: { col: 11, row: 3 }, // arched doorway
  STAIRS: { col: 2, row: 6 }, // stairs
  SHORTCUT_GATE: { col: 1, row: 9 }, // blue gate
  BOSS_GATE: { col: 0, row: 9 }, // blue padlock
  FIRE_HAZARD: { col: 15, row: 10 }, // orange flame
  FROST_HAZARD: { col: 14, row: 18 }, // blue water droplet
  SHOP_TERMINAL: { col: 0, row: 20 }, // tree brach
  CURSED_RIFT: { col: 13, row: 17 }, // dark red brick pattern — ominous texture
  ECHO_WELL: { col: 14, row: 5 }, // solid glowing-blue pool tile
  CHRONO_ANVIL: { col: 9, row: 8 }, // same solid brown block used for the Giant's Anvil relic
  SMUGGLER: { col: 26, row: 1 }, // hooded bust, distinct silhouette from every other NPC/enemy

  // --- World-item pickups ---
  CHEST: { col: 8, row: 6 }, // brown chest with a latch
  WEAPON: { col: 32, row: 2 }, // diagonal sword
  ACCESSORY: { col: 45, row: 6 }, // gold ring
  POTION: { col: 41, row: 11 }, // blue potion bottle
  CONSUMABLE: { col: 39, row: 8 }, // wand/rod shape
  TIME_SHARD: { col: 39, row: 12 }, // hourglass
  ANCHOR: { col: 32, row: 11 }, // golden key ("pins" the Biome)
  // Fallback icon.
  RELIC: { col: 41, row: 3 }, // gold coin
} as const satisfies Record<string, SpriteRef>;

export type SpriteName = keyof typeof SPRITES;

// Faint floor decor, scattered procedurally — never gameplay-relevant.
export const DECOR_DIRT: SpriteRef[] = [
  { col: 19, row: 1 },
  { col: 18, row: 3 },
  { col: 19, row: 3 },
  { col: 18, row: 4 },
];
export const DECOR_GRASS: SpriteRef[] = [
  { col: 5, row: 0 },
  { col: 6, row: 0 },
  { col: 7, row: 0 },
];

// Eternity Tree growth stages (0-3), indexed by eternityTreeStage() in content.ts.
export const TREE_STAGE_SPRITES: readonly SpriteRef[] = [
  { col: 0, row: 2 }, // frail seedling — sparse sprouts
  { col: 1, row: 2 }, // growing — fuller sprout
  { col: 5, row: 1 }, // strong temporal tree — solid pine
  { col: 4, row: 2 }, // blooming — full canopy with visible trunk
];

// Skill icons.
export const SKILL_SPRITE_BY_ID: Record<SkillId, SpriteRef> = {
  dash: { col: 24, row: 12 }, // arrow — forward burst
  cleave: { col: 24, row: 11 }, // slash
  flame_arc: SPRITES.FIRE_HAZARD,
  static_shift: { col: 27, row: 13 }, // teleport
  ice_aegis: { col: 33, row: 10 },
  bash: { col: 35, row: 2 }, // hammer (Mythril Hammer's cell)
  grapple: { col: 40, row: 7 }, // trident — hooks and pulls
  blizzard_wave: { col: 27, row: 12 }, // snowflake bloom
  meteor: { col: 15, row: 10 }, // flame (gunpowder_flask's 2nd flame cell)
  chakra: { col: 25, row: 12 }, // plus — restore HP
  recall: SPRITES.TIME_SHARD,
  fortify: { col: 37, row: 2 }, // ornate circular shield (mirror_shield's cell)
  reflect_barrier: { col: 37, row: 4 }, //
  vanish: { col: 29, row: 11 }, // eye slash
  omnislash: { col: 26, row: 11 }, // double slash — multi-hit
  mug: SPRITES.RELIC, // gold coin — steal
  haste: { col: 34, row: 21 }, // rocket (2nd pose)
  provoke: { col: 27, row: 11 }, // starburst — shout
  chain_lightning: { col: 34, row: 4 }, // Blitz Whip's cell — coiled live current
  time_stop: { col: 41, row: 12 }, // grey hourglass outline (Shattered Hourglass's cell)
  paradox: { col: 47, row: 0 }, // circular dial — a swapped fate
  defuse: { col: 30, row: 11 }, // X — negate
  slow: { col: 30, row: 12 }, // sparse snowflake
  aura: { col: 35, row: 11 }, // concentric circles
  ultima: { col: 34, row: 12 }, // skull
};

export const STAT_TRACK_SPRITE: Record<StatTrack, SpriteRef> = {
  maxHpUpgrade: { col: 39, row: 10 }, // red heart
  maxStamUpgrade: { col: 44, row: 10 }, // blue plus (Stamina Draught's cell)
  turnBonusUpgrade: SPRITES.TIME_SHARD,
  baseAtkUpgrade: SPRITES.WEAPON,
};

// Relic icons.
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

// Item icons.
export const WEAPON_SPRITE_BY_NAME: Record<string, SpriteRef> = {
  // --- Early game (F1-F20) ---
  'Rusty Sword': { col: 36, row: 7 },
  'Bone Dagger': { col: 34, row: 6 },
  'Mythril Hammer': { col: 35, row: 2 },
  'Mage Masher': { col: 32, row: 4 },
  'Flametongue': { col: 36, row: 6 },
  'Ice Lance': { col: 35, row: 3 },
  'Partisan': { col: 36, row: 3 },
  'Glass Sword': { col: 32, row: 6 },
  'Broadsword': { col: 34, row: 2 },
  'Ash Wand': { col: 32, row: 4 },
  'Bone Club': { col: 33, row: 2 },
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
  'Murasame': { col: 33, row: 7 },
  'Gale Bow': { col: 40, row: 6 },
  'Kotetsu': { col: 32, row: 8 },
  'Diamond Mace': { col: 36, row: 4 },

  // --- Late game (F51-F99) ---
  'Firaga Edge': { col: 33, row: 8 },
  'Ice Brand': { col: 34, row: 8 },
  'Blitz Whip': { col: 41, row: 5 },
  'Rune Axe': { col: 41, row: 7 }, // the sheet's actual (double-headed) axe icon
  'Excalibur': { col: 35, row: 8 },
  'Holy Lance': { col: 35, row: 5 },
  'Ultima Weapon': { col: 38, row: 8 },
  'Ragnarok': { col: 33, row: 9 },
  'Gungnir': { col: 42, row: 7 },
  'Save the Queen': { col: 36, row: 8 },
  'Blood Lance': { col: 36, row: 3 },
  'Deathbringer': { col: 36, row: 2 },
  'Apocalypse': { col: 35, row: 9 },
  'Masamune': { col: 34, row: 9 },

  // --- Ultimate Elemental (F80-99 chase weapons) ---
  'Laevateinn': { col: 33, row: 9 }, // tinted blade, fire sword
  'Vajra': { col: 38, row: 7 }, // tinted blade, thunder spear
  'Niflheim': { col: 39, row: 8 }, // axe
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
  'Capacitor Ring': { col: 45, row: 6 }, // yellow pendant, same design as Ember Pendant
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
