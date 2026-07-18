// Game content tables: the Elemental Wheel, bestiary, weapons, and accessories.

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
  // DEF kept low: Physical (the common early Rusty Sword) is resisted 0.5x
  // against Volt per the Elemental Wheel — higher DEF here stalled a
  // Rusty-Sword-only player to 1 dmg/hit against this enemy.
  VOLT_TURRET: { hp: 25, attack: 6, defense: 1, speed: 0, element: 'VOLT' },
  FROST_WRAITH: { hp: 18, attack: 5, defense: 2, speed: 1, element: 'FROST' },
  TIME_WEAVER: { hp: 40, attack: 8, defense: 4, speed: 1, element: 'CHRONO' },
  CHRONO_LICH: { hp: 400, attack: 16, defense: 8, speed: 1, element: 'CHRONO' },

  // Deep-Biome Regulars: first appear Biome 3+ (Floors 21+), mixed into every
  // deeper Biome after. DEF/Speed are fixed like every regular
  // (scaleEnemyForDepth only scales hp/attack).
  BONE_KNIGHT: { hp: 22, attack: 5, defense: 6, speed: 1, element: 'PHYSICAL' },
  CINDER_SHAMAN: { hp: 14, attack: 6, defense: 1, speed: 1, element: 'FIRE' },
  VOLT_HOUND: { hp: 10, attack: 6, defense: 0, speed: 2, element: 'VOLT' },
  FROST_SENTINEL: { hp: 20, attack: 5, defense: 5, speed: 0, element: 'FROST' },

  // Mini-Bosses: fixed Arena floors 10/20/30, exempt from Depth Scaling
  // (hand-tuned stats) same as the Chrono-Lich. F40-90's empowered repeats
  // reuse these base stats, scaled at spawn by arenas.ts's
  // miniBossRepeatMultiplier — never baked in here.
  INFERNO_GOLEM: { hp: 120, attack: 9, defense: 2, speed: 1, element: 'FIRE' },
  STORM_CALLER: { hp: 100, attack: 11, defense: 3, speed: 1, element: 'VOLT' },
  GLACIAL_KNIGHT: { hp: 140, attack: 10, defense: 7, speed: 1, element: 'FROST' },
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
  INFERNO_GOLEM: 'Inferno-Golem',
  STORM_CALLER: 'Storm-Caller',
  GLACIAL_KNIGHT: 'Glacial-Knight',
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
    'The architect of this purgatory. He sits at the bottom of the temporal well, ninety-nine floors deep, hoarding what remains of the Hourglass in a mad bid to ascend. He no longer remembers why he wanted to live forever.',
  BONE_KNIGHT:
    'The honor guard never abandoned their posts. Centuries of resets have fused their plate to their bones.',
  CINDER_SHAMAN:
    'It still performs the rain-summoning rite of old Oakhaven. What falls now is not water.',
  VOLT_HOUND:
    "The kennels of the citadel guard, warped into living capacitors. They hunt in pairs, herding prey into each other's arcs.",
  FROST_SENTINEL:
    'Statues of the old kings, animated by the cold between seconds. Their gaze sweeps the halls in four directions at once.',
  // Mini-Bosses (Phase 15): the GDD's Section 6C table has no Lore/Origin
  // column for these three (unlike every regular/Elite entry above) —
  // authored here to match the established voice, not transcribed from spec.
  INFERNO_GOLEM:
    "Forged from the citadel's own furnace core, given a will only by the shattering of the Hourglass. It remembers being nothing but fire and purpose — grind forward, grind forward, grind forward.",
  STORM_CALLER:
    "Once the Keep's chief meteomancer, still mid-ritual when the loop caught her. She keeps casting the storm she can no longer stop, and the Volt-Hounds keep answering a summons centuries stale.",
  GLACIAL_KNIGHT:
    'The last duelist of Oakhaven\'s winter court, sworn to hold this passage until relieved. No one is coming. He holds it anyway.',
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

/** Echo Magnet (Phase 19 Relic): "+50% Echoes earned, but all enemies gain
 * +20% Max HP" — the trade-off half, applied the same post-generation-pass
 * way as scaleEnemyForNgPlus above and for the identical reason (relics are
 * gameplay-time `run` state; the seeded generator must stay a pure function
 * of (rngSeed, floorNumber) for determinism). Regular procedural-floor
 * enemies only — Mini-Bosses/the Chrono-Lich are hand-tuned and already
 * exempt from Depth/NG+ scaling for the same reason, so this follows suit. */
export function scaleEnemyForEchoMagnet(enemy: Enemy, active: boolean): void {
  if (!active) return;
  const scaled = Math.round(enemy.hp * 1.2);
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
// Phase 18 Content Expansion: the original 17-weapon roster (sized for the
// pre-99-floor game) replaced wholesale with a 40-weapon, 3-tier roster —
// Early (F1-20), Mid (F21-50), Late (F51-99) — per Chrono-Keep-Next-Task.md's
// Phase 18 spec. A handful of mechanics described there don't map onto an
// existing game system (enemies have no Stamina stat, e.g.) and were
// reinterpreted to the closest implementable equivalent; see the passive's
// comment where that happened.
const WEAPONS = {
  // --- Early game (F1-F20) ---
  RUSTY_SWORD: { name: 'Rusty Sword', atk: 3, element: 'PHYSICAL', passive: 'none', lore: 'Your service weapon from a timeline long forgotten. It remembers the taste of blood, but its edge has dulled across a thousand failed resets.' },
  BONE_DAGGER: { name: 'Bone Dagger', atk: 2, element: 'PHYSICAL', passive: 'free_swap', lore: 'Carved from the femur of a fallen Watchwarden. It demands so little weight to wield, you can draw it between the ticks of a clock.' },
  MYTHRIL_HAMMER: { name: 'Mythril Hammer', atk: 5, element: 'PHYSICAL', passive: 'heavy_stamina', lore: 'Too heavy for a living arm to swing twice. Yours is not quite living anymore.' },
  // "10% chance to drain 1 Stamina from the enemy" — enemies have no Stamina
  // stat in this game, so reinterpreted as the player recovering it instead.
  MAGE_MASHER: { name: 'Mage Masher', atk: 3, element: 'VOLT', passive: 'stamina_leech_10', lore: "A duelist's parrying blade, repurposed. It hums faintly, siphoning static off every failed guard." },
  FLAMETONGUE: { name: 'Flametongue', atk: 3, element: 'FIRE', passive: 'cure_chill_on_attack', lore: 'A campfire given an edge. It never quite stops smoldering.' },
  ICE_LANCE: { name: 'Ice Lance', atk: 4, element: 'FROST', passive: 'pierce_ranged_2', lore: 'A shard of the Undercroft, sharpened. It skewers straight through whatever stands in its way.' },
  PARTISAN: { name: 'Partisan', atk: 4, element: 'PHYSICAL', passive: 'knockback_1', lore: "The citadel guard's parade weapon, still fit for shoving intruders back where they came from." },
  GLASS_SWORD: { name: 'Glass Sword', atk: 7, element: 'PHYSICAL', passive: 'glass_cannon', lore: 'Impossibly sharp, impossibly fragile — one hard shock and it shatters in your hand.' },
  BROADSWORD: { name: 'Broadsword', atk: 4, element: 'PHYSICAL', passive: 'none', lore: 'Reliable, unremarkable steel. No tricks, no curses — just a blade that cuts.' },
  ASH_WAND: { name: 'Ash Wand', atk: 3, element: 'FIRE', passive: 'ranged_no_adjacent_3', lore: 'Charred at the tip from one use too many. Best kept at a comfortable distance.' },
  BONE_CLUB: { name: 'Bone Club', atk: 6, element: 'PHYSICAL', passive: 'def_minus_1_equipped', lore: 'All offense, no guard. Swinging it wide enough to matter leaves you wide open.' },
  DEFENDER: { name: 'Defender', atk: 3, element: 'PHYSICAL', passive: 'def_plus_1_equipped', lore: "A watchman's sidearm, balanced for blocking as much as striking." },

  // --- Mid game (F21-F50) ---
  THUNDER_ROD: { name: 'Thunder Rod', atk: 4, element: 'VOLT', passive: 'arc_3', lore: 'A lightning rod bent into a weapon. The charge always finds more than one target.' },
  IFRITS_BLADE: { name: "Ifrit's Blade", atk: 6, element: 'FIRE', passive: 'cleave_3_front', lore: "A shard of the Undercroft's opposite — a sliver of something that never stopped burning." },
  ELVEN_BOW: { name: 'Elven Bow', atk: 5, element: 'FROST', passive: 'ranged_no_adjacent_4', lore: 'Older than the citadel itself. The string still remembers a forest that no longer exists.' },
  BLOOD_SWORD: { name: 'Blood Sword', atk: 4, element: 'PHYSICAL', passive: 'lifesteal_2_on_hit', lore: 'It drinks a little with every cut, and gives a little back.' },
  CORAL_SWORD: { name: 'Coral Sword', atk: 5, element: 'VOLT', passive: 'pull_1_stun_25', lore: 'Grown, not forged, in a flooded sub-level that used to be a power station.' },
  DARK_KNIGHTS_BLADE: { name: "Dark Knight's Blade", atk: 8, element: 'PHYSICAL', passive: 'blood_magic_2', lore: 'It cuts deeper than any living wrist could bear to swing it.' },
  ASSASSINS_DAGGER: { name: "Assassin's Dagger", atk: 5, element: 'CHRONO', passive: 'knockback_2_randomize_element', lore: 'It bends reality upon impact. You never quite know what you\'ll leave behind.' },
  FLAMBERGE: { name: 'Flamberge', atk: 6, element: 'FIRE', passive: 'ignite_behind', lore: 'Wave-bladed and cursed. The fire it leaves behind burns longer than the cut itself.' },
  TRIDENT: { name: 'Trident', atk: 5, element: 'VOLT', passive: 'wall_slam_bonus', lore: "Fished from the drowned reactor level. It's happiest when it has something to pin down." },
  BIO_BLADE: { name: 'Bio-Blade', atk: 5, element: 'PHYSICAL', passive: 'stun_50_vs_chilled', lore: 'Serrated to find the nerve under numbed flesh.' },
  MURASAME: { name: 'Murasame', atk: 6, element: 'PHYSICAL', passive: 'kill_refund_turn', lore: 'A blade with a taste for finality. It never lingers on a kill.' },
  GALE_BOW: { name: 'Gale Bow', atk: 4, element: 'VOLT', passive: 'ranged_push_3', lore: 'Strung with live wire. Every loosed bolt arrives on a gust that shoves back.' },
  KOTETSU: { name: 'Kotetsu', atk: 4, element: 'PHYSICAL', passive: 'combo_stack', lore: 'A dueling blade that rewards patience — it finds its rhythm the longer a fight runs.' },
  DIAMOND_MACE: { name: 'Diamond Mace', atk: 5, element: 'FROST', passive: 'bonus_vs_chilled_2x', lore: 'Faceted ice that never melts. It shatters what the cold has already made brittle.' },

  // --- Late game (F51-F99) ---
  FIRAGA_EDGE: { name: 'Firaga Edge', atk: 7, element: 'FIRE', passive: 'bonus_vs_burning_2x', lore: "Forged in a furnace that never actually existed, except in this loop's version of the past." },
  ICE_BRAND: { name: 'Ice Brand', atk: 6, element: 'FROST', passive: 'chill_spread_on_kill', lore: 'A killing blow with this blade leaves the cold looking for somewhere else to go.' },
  BLITZ_WHIP: { name: 'Blitz Whip', atk: 6, element: 'VOLT', passive: 'chain_lightning_1', lore: "Live current, coiled. It never stops looking for a second target." },
  RUNE_AXE: { name: 'Rune Axe', atk: 10, element: 'PHYSICAL', passive: 'execute_20_heavy', lore: 'Too heavy to swing carelessly. It ends fights that are already nearly over.' },
  EXCALIBUR: { name: 'Excalibur', atk: 8, element: 'PHYSICAL', passive: 'ignore_def_50', lore: "A relic from a story that didn't happen here — armor simply forgets to matter around it." },
  HOLY_LANCE: { name: 'Holy Lance', atk: 8, element: 'FIRE', passive: 'pierce_ranged_3_fire_hazard', lore: 'Consecrated steel, or close enough. What it pierces, it also leaves burning.' },
  ULTIMA_WEAPON: { name: 'Ultima Weapon', atk: 8, element: 'PHYSICAL', passive: 'heal_missing_10_on_kill', lore: 'The last thing a lot of things ever see. It gives a little of your own future back.' },
  RAGNAROK: { name: 'Ragnarok', atk: 9, element: 'PHYSICAL', passive: 'permanent_def_reduction_1', lore: 'Every strike leaves the armor a little less than it was — and it never grows back.' },
  GUNGNIR: { name: 'Gungnir', atk: 8, element: 'VOLT', passive: 'pierce_ranged_2_dash', lore: 'A spear that never really stops moving, even after it lands.' },
  SAVE_THE_QUEEN: { name: 'Save the Queen', atk: 6, element: 'FROST', passive: 'negate_first_hit_per_floor', lore: "A ceremonial blade, repurposed for a war it wasn't built for. It still remembers how to shield someone." },
  BLOOD_LANCE: { name: 'Blood Lance', atk: 7, element: 'FIRE', passive: 'pierce_ranged_2_lifesteal_3', lore: 'It burns going in and gives something back coming out.' },
  DEATHBRINGER: { name: 'Deathbringer', atk: 8, element: 'CHRONO', passive: 'execute_chance_5', lore: "It doesn't always kill outright. It doesn't need to, often enough." },
  APOCALYPSE: { name: 'Apocalypse', atk: 14, element: 'CHRONO', passive: 'max_hp_minus_10_equipped', lore: 'Devastating in the hand, and it costs you something just to hold it.' },
  MASAMUNE: { name: 'Masamune', atk: 10, element: 'CHRONO', passive: 'kill_refund_turns_3', lore: 'A legendary blade, somehow, in a timeline that has no business having legends. Mythic-tier — it steals back a real handful of moments with every kill.' },
} as const satisfies Record<string, { name: string; atk: number; element: Element; passive: string; lore: string }>;

export type WeaponKey = keyof typeof WEAPONS;
export const WEAPON_KEYS = Object.keys(WEAPONS) as WeaponKey[];

export function createWeapon(key: WeaponKey, id: string): Weapon {
  const w = WEAPONS[key];
  return { id, kind: 'WEAPON', name: w.name, value: 0, atk: w.atk, element: w.element, passive: w.passive };
}

// Weapon passives that grant a min/max attack range without moving (Section
// 6A/8): the inverse pair — some weapons can reach past adjacency, others
// *require* distance. min=max=1 (the default for any weapon not listed)
// means "adjacent bump-attack only."
export interface WeaponRangeProfile {
  min: number;
  max: number;
}
export const WEAPON_RANGE: Partial<Record<string, WeaponRangeProfile>> = {
  ranged_no_adjacent_3: { min: 2, max: 3 }, // Ash Wand
  ranged_no_adjacent_4: { min: 2, max: 4 }, // Elven Bow
  pierce_ranged_2: { min: 1, max: 2 }, // Ice Lance
  ranged_push_3: { min: 1, max: 3 }, // Gale Bow
  pierce_ranged_3_fire_hazard: { min: 1, max: 3 }, // Holy Lance
  pierce_ranged_2_dash: { min: 1, max: 2 }, // Gungnir
  pierce_ranged_2_lifesteal_3: { min: 1, max: 2 }, // Blood Lance
};

// Weapon passives that let the Bone Dagger-style free-swap rule apply.
export const FREE_SWAP_PASSIVES = new Set(['free_swap']);

// Accessories (Section 6D). The first 7 are the original roster; the
// remaining 12 are Phase 8's expansion. `lore` is Section 6D's "Lore /
// Flavor Text" column.
const ACCESSORIES = {
  IRON_RING: {
    name: 'Iron Ring',
    passive: 'def_plus_2',
    lore: 'A crude signet of the lower guard. It bears the dents of countless skirmishes that never technically happened.',
    melt: 15,
  },
  RING_OF_VIGOR: {
    name: 'Ring of Vigor',
    passive: 'max_hp_plus_10',
    lore: 'Pulses with a steady heartbeat. Holding it reminds your body that it is still alive, anchoring your physical form.',
    melt: 15,
  },
  BOOTS_OF_HASTE: {
    name: 'Boots of Haste',
    passive: 'dash_discount',
    lore: "The leather is pristine, untouched by the sands of time. Slipping them on makes the world around you feel like it's moving through syrup.",
    melt: 15,
  },
  ECHO_CHARM: {
    name: 'Echo Charm',
    passive: 'echo_bonus_20',
    lore: 'A jagged piece of crystallized memory. It whispers the mistakes of your past lives into your ear, ensuring you do not waste the blood you spill.',
    melt: 15,
  },
  EMBER_PENDANT: {
    name: 'Ember Pendant',
    passive: 'burn_immune',
    lore: "A piece of the citadel's original hearthstone. It recognizes you as a son of Oakhaven, granting safe passage through the flames.",
    melt: 15,
  },
  WINGED_ANKLET: {
    name: 'Winged Anklet',
    passive: 'chill_immune',
    lore: 'Woven with feathers from the mythical Sun-Bird. It rejects the stagnation of the void, keeping your blood rushing when the cold closes in.',
    melt: 15,
  },
  GROUNDING_BAND: {
    name: 'Grounding Band',
    passive: 'stun_immune',
    lore: 'A heavy, copper torc. It grounds not just electricity, but your very consciousness, preventing sudden shocks from interrupting your flow.',
    melt: 15,
  },
  BERSERKERS_CUFF: {
    name: "Berserker's Cuff",
    passive: 'berserker',
    lore: 'Restricts blood flow just enough to induce a permanent state of rage.',
    melt: 18,
  },
  PALADINS_MANTLE: {
    name: "Paladin's Mantle",
    passive: 'paladin',
    lore: 'Heavy leaden weave. It absorbs blows perfectly but exhausts the wearer.',
    melt: 18,
  },
  BATTERY_CELL: {
    name: 'Battery Cell',
    passive: 'max_stam_plus_3',
    lore: 'A glowing hum of ancient energy that hooks directly into your nervous system.',
    melt: 18,
  },
  KINDLING_POUCH: {
    name: 'Kindling Pouch',
    passive: 'fire_synergy',
    lore: "Contains the ever-burning embers of the citadel's first hearth.",
    melt: 18,
  },
  CAPACITOR_RING: {
    name: 'Capacitor Ring',
    passive: 'volt_synergy',
    lore: 'It sparks constantly, desperate to ground itself into an unlucky target.',
    melt: 18,
  },
  PERMAFROST_VIAL: {
    name: 'Permafrost Vial',
    passive: 'frost_synergy',
    lore: 'A liquid so cold it freezes the air around your fingertips.',
    melt: 18,
  },
  VAMPIRE_TOOTH: {
    name: 'Vampire Tooth',
    passive: 'lifesteal_1',
    lore: 'A morbid keepsake. It pulses warmly when blood is spilled.',
    melt: 15,
  },
  SHATTERED_HOURGLASS: {
    name: 'Shattered Hourglass',
    passive: 'safety_net_15',
    lore: 'A broken promise of more time. Use it to finish what you started.',
    melt: 22,
  },
  SPIKED_PAULDRONS: {
    name: 'Spiked Pauldrons',
    passive: 'retaliation_2',
    lore: 'The best defense is a jagged piece of rusted metal aimed at their throat.',
    melt: 22,
  },
  GAMBLERS_DICE: {
    name: "Gambler's Dice",
    passive: 'gamblers_dice',
    lore: 'Fate is fluid in the time loop. Roll the bones and steal back some seconds.',
    melt: 20,
  },
  ADRENALINE_GLAND: {
    name: 'Adrenaline Gland',
    passive: 'adrenaline',
    lore: 'Panic is just a resource waiting to be harnessed.',
    melt: 22,
  },
  ALCHEMISTS_BELT: {
    name: "Alchemist's Belt",
    passive: 'alchemist_belt',
    lore: 'A perfectly organized bandolier. Your hand finds what it needs instantly.',
    melt: 25,
  },
} as const satisfies Record<string, { name: string; passive: string; lore: string; melt: number }>;

export type AccessoryKey = keyof typeof ACCESSORIES;

export function createAccessory(key: AccessoryKey, id: string): Accessory {
  const a = ACCESSORIES[key];
  return { id, kind: 'ACCESSORY', name: a.name, value: 0, passive: a.passive };
}

// Potions (Phase 18 Content Expansion: 4 new scaling tiers alongside the
// original 2). `effect` picks the heal shape usePotion (inventory.ts)
// applies: heal_flat (a flat HP amount), heal_percent_max (a % of Max HP),
// heal_percent_max_cleanse (a % of Max HP + clears any Status), or
// permanent_max_hp (a permanent +Max HP, not a heal at all — Soma Drop).
// `value` is that effect's one parameter, same convention Consumables use.
// `melt` is this Potion's Melt-for-Echoes value (inventory.ts's meltItem) —
// kept distinct from `value` (that's the heal amount/effect parameter) since
// the two numbers mean completely different things and scale independently.
const POTIONS = {
  POTION: { name: 'Potion', effect: 'heal_flat', value: 10, lore: 'A murky, lukewarm brew. It tastes like failure, but it works.', melt: 5 },
  MAX_POTION: {
    name: 'Max Potion',
    effect: 'heal_flat',
    value: 999, // Deliberately absurd — usePotion clamps to maxHp, so this always fully heals.
    lore: "Distilled from a Watchwarden's final, desperate moment. It remembers what it means to be whole.",
    melt: 20,
  },
  MINOR_POTION: { name: 'Minor Potion', effect: 'heal_flat', value: 20, lore: 'A cleaner brew than the Watch usually manages. Small comforts.', melt: 8 },
  HI_POTION: { name: 'Hi-Potion', effect: 'heal_percent_max', value: 40, lore: 'Bottled by someone who actually knew what they were doing, once.', melt: 15 },
  MEGALIXIR: {
    name: 'Megalixir',
    effect: 'heal_percent_max_cleanse',
    value: 100,
    lore: 'The last good thing the old alchemists ever made. It burns every ailment out along with the pain.',
    melt: 30,
  },
  SOMA_DROP: {
    name: 'Soma Drop',
    effect: 'permanent_max_hp',
    value: 5,
    lore: 'Not a heal — a rewrite. It takes its time settling into your bones.',
    melt: 35,
  },
} as const satisfies Record<string, { name: string; effect: string; value: number; lore: string; melt: number }>;

export type PotionKey = keyof typeof POTIONS;

// Soma Drop's permanent stat change is deliberately slower than every other
// Potion's context-sensitive 0/1-Turn rule (Section 7) — a flat 3 Turns
// regardless of context, closer to a Tactical Consumable's cost shape.
// Alchemist's Belt (Section 6D) still overrides it to free, same as anything
// else Potion/Consumable it touches.
export const POTION_FIXED_TURN_COST: Partial<Record<string, number>> = {
  'Soma Drop': 3,
};

export function createPotion(key: PotionKey, id: string): Item {
  const p = POTIONS[key];
  return { id, kind: 'POTION', name: p.name, value: p.value, effect: p.effect };
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
// Same `melt`-vs-`value` split as POTIONS above — `value` is the effect's own
// parameter (range/turns/charges/Echoes), `melt` is what Melting the item
// instead of using it pays out. Echo Geode is the one item where those two
// numbers are deliberately equal: melting it gives exactly what using it would.
const CONSUMABLES = {
  LIQUID_FIRE_FLASK: {
    name: 'Liquid Fire Flask',
    effect: 'throw_fire_hazard',
    value: 3, // range
    lore: 'Ignites upon exposure to the air. Excellent for blocking corridors.',
    melt: 10,
  },
  SHOCK_GRENADE: {
    name: 'Shock Grenade',
    effect: 'throw_shock_grenade',
    value: 3, // range
    lore: 'Overloads the nervous system of anything caught in the flash.',
    melt: 10,
  },
  ICE_BARRICADE_SCROLL: {
    name: 'Ice-Barricade Scroll',
    effect: 'ice_barricade',
    value: 5, // turns
    lore: 'Draw the rune, summon the frost, and buy yourself a moment to breathe.',
    melt: 8,
  },
  STAMINA_DRAUGHT: {
    name: 'Stamina Draught',
    effect: 'restore_stamina',
    value: 0,
    lore: 'Tastes like copper and ozone. Your muscles twitch violently.',
    melt: 5,
  },
  QUICKSILVER_FLASK: {
    name: 'Quicksilver Flask',
    effect: 'quicksilver',
    value: 3, // charges
    lore: 'Time stretches. You move between the raindrops.',
    melt: 15,
  },
  RECALL_RUNE: {
    name: 'Recall Rune',
    effect: 'recall',
    value: 0,
    lore: 'A coward\'s exit, or a tactician\'s reset. Depends on who is asking.',
    melt: 10,
  },
  ECHO_GEODE: {
    name: 'Echo Geode',
    effect: 'echo_geode',
    value: 50, // Echoes
    lore: 'A massive cluster of memories. Cash it in before you forget.',
    melt: 50,
  },
  WHETSTONE: {
    name: 'Whetstone',
    effect: 'whetstone',
    value: 0,
    lore: 'A few quick strikes along the blade ensures the next cut will be deep.',
    melt: 8,
  },
} as const satisfies Record<string, { name: string; effect: string; value: number; lore: string; melt: number }>;

export type ConsumableKey = keyof typeof CONSUMABLES;

export function createConsumable(key: ConsumableKey, id: string): Consumable {
  const c = CONSUMABLES[key];
  return { id, kind: 'CONSUMABLE', name: c.name, value: c.value, effect: c.effect };
}

const CONSUMABLE_KEYS = Object.keys(CONSUMABLES) as ConsumableKey[];

/** Mug (Phase 18 skill): a uniform-random Consumable, standing in for a
 * pickpocketed item off an enemy that otherwise has no drop table entry. */
export function rollRandomConsumable(id: string): Consumable {
  const key = CONSUMABLE_KEYS[Math.floor(Math.random() * CONSUMABLE_KEYS.length)];
  return createConsumable(key, id);
}

// Chronofacts / Relics (Phase 19: infinite-stacking run passives — never
// equipped, picked up from drops/Elite kills/Cursed Rifts and added straight
// to `run.relics`). Each has both a registry key (`createRelicItem`'s
// argument, same convention as every other create* function here) and an
// `effect` snake_case ID stored on the Item and pushed into `run.relics` —
// kept as two separate strings, even though it's a 1:1 mapping for every
// entry, to match the weapon/accessory/potion convention of dispatching on
// a snake_case `passive`/`effect` string rather than the upper-snake
// registry key itself. Implementation hooks live in combat.ts, inventory.ts,
// echoes.ts, turnController.ts, skills.ts, and enemyAI.ts — see each site's
// own comment for exactly which relic it implements.
export const RELICS = {
  GUNPOWDER_FLASK: {
    name: 'Gunpowder Flask',
    effect: 'gunpowder_flask',
    lore: 'A cracked powder horn that never quite empties. Burning things, it turns out, are flammable.',
  },
  EXECUTIONERS_COIN: {
    name: "Executioner's Coin",
    effect: 'executioners_coin',
    lore: 'Flip it before the killing blow. It always lands in your favor.',
  },
  STATIC_GENERATOR: {
    name: 'Static Generator',
    effect: 'static_generator',
    lore: 'Every footstep on the old citadel floor builds a little more charge than the last.',
  },
  GIANTS_ANVIL: {
    name: "Giant's Anvil",
    effect: 'giants_anvil',
    lore: 'Strapped to your back, it makes every swing heavier — and every step slower to recover from.',
  },
  DUELISTS_GLOVE: {
    name: "Duelist's Glove",
    effect: 'duelists_glove',
    lore: 'Old etiquette from a citadel that valued a fair fight. It has no opinion on unfair ones.',
  },
  VAMPIRES_CAPE: {
    name: "Vampire's Cape",
    effect: 'vampires_cape',
    lore: 'Lined with something that was never quite silk. It drinks a little, every time you do the killing.',
  },
  TROLL_BLOOD: {
    name: 'Troll Blood',
    effect: 'troll_blood',
    lore: 'A single vial, and it never runs dry. Your wounds have started closing a little too fast to be entirely yours.',
  },
  MIRROR_SHIELD: {
    name: 'Mirror Shield',
    effect: 'mirror_shield',
    lore: "Polished to a wrongness — it doesn't show your reflection. It shows theirs, right before it happens to them instead.",
  },
  PHOENIX_FEATHER: {
    name: 'Phoenix Feather',
    effect: 'phoenix_feather',
    lore: 'Warm to the touch, even now. It only gets to matter once.',
  },
  HOURGLASS_SHARD: {
    name: 'Hourglass Shard',
    effect: 'hourglass_shard',
    lore: 'A splinter of the original Hourglass. Every so often, it lets a moment happen twice for the price of one.',
  },
  GOLDEN_SCARAB: {
    name: 'Golden Scarab',
    effect: 'golden_scarab',
    lore: 'Every chest it touches feels a little guilty about only offering one prize.',
  },
  ECHO_MAGNET: {
    name: 'Echo Magnet',
    effect: 'echo_magnet',
    lore: 'It pulls harder at the loop\'s currency than is strictly safe — and the loop pulls back.',
  },
  CARTOGRAPHERS_LENS: {
    name: "Cartographer's Lens",
    effect: 'cartographers_lens',
    lore: "A dead surveyor's monocle. The halls haven't changed enough to fool it twice.",
  },
  ALCHEMISTS_SATCHEL: {
    name: "Alchemist's Satchel",
    effect: 'alchemists_satchel',
    lore: 'Every dose inside is stronger than it should be — which is, perhaps, why there are fewer of them lying around.',
  },
  TIME_EATERS_JAW: {
    name: "Time-Eater's Jaw",
    effect: 'time_eaters_jaw',
    lore: 'A fossil tooth that hungers for spent seconds. Feed it a Time Shard and it gives back more than it took.',
  },
} as const satisfies Record<string, { name: string; effect: string; lore: string }>;

export type RelicKey = keyof typeof RELICS;
export const RELIC_KEYS = Object.keys(RELICS) as RelicKey[];

export function createRelicItem(key: RelicKey, id: string): Item {
  const r = RELICS[key];
  return { id, kind: 'RELIC', name: r.name, value: 0, effect: r.effect };
}

/** Looks up a relic's display name/lore by its `effect` ID (what `run.relics`
 * stores) — the Relic Tray tooltip and Cursed Rift/kill-reward log lines
 * need this the same way loreForItem needs a display name below. */
const RELIC_BY_EFFECT: Record<string, { name: string; lore: string }> = {};
for (const r of Object.values(RELICS)) RELIC_BY_EFFECT[r.effect] = { name: r.name, lore: r.lore };
export function relicName(effect: string): string {
  return RELIC_BY_EFFECT[effect]?.name ?? effect;
}
export function relicLore(effect: string): string {
  return RELIC_BY_EFFECT[effect]?.lore ?? '';
}

const RELIC_EFFECT_KEYS = Object.values(RELICS).map((r) => r.effect);

/** Cursed Rift accept / a killed [Wealthy] Elite: a random relic not already
 * held, or null if every relic is already in `run.relics` (caller falls back
 * to an Echo consolation prize). */
export function pickRandomUnheldRelic(held: readonly string[]): string | null {
  const available = RELIC_EFFECT_KEYS.filter((e) => !held.includes(e));
  if (available.length === 0) return null;
  return available[Math.floor(Math.random() * available.length)];
}

/** Builds a RELIC-kind Item straight from an `effect` ID (as returned by
 * pickRandomUnheldRelic) rather than a registry key — the drop-table/reward
 * call sites only ever have the effect string on hand. */
export function createRelicItemByEffect(effect: string, id: string): Item {
  return { id, kind: 'RELIC', name: relicName(effect), value: 0, effect };
}

// Chronofacts Detail Screen (Next-Task.md QoL): the Section 8 Stat Block's
// "Effect: ..." line, for relics specifically — a short mechanical summary
// (what the relic actually does, per its combat.ts/skills.ts/etc. hook),
// distinct from relicLore's pure flavor text above it in the detail panel.
const RELIC_EFFECT_TEXT: Record<string, string> = {
  gunpowder_flask: 'Effect: A Burning kill explodes, hitting nearby enemies for your ATK.',
  executioners_coin: 'Effect: +50% DMG vs. a target below 30% HP.',
  static_generator: 'Effect: Every 3 steps taken, your next attack auto-Stuns.',
  giants_anvil: 'ATK: +5 flat | Effect: Dash permanently disabled.',
  duelists_glove: 'Effect: +50% DMG in a real 1-on-1 fight.',
  vampires_cape: 'Effect: +1 HP on a bump kill.',
  troll_blood: 'Effect: +1 HP every 10 turns.',
  mirror_shield: 'Effect: While Braced, reflects an incoming status back onto the attacker.',
  phoenix_feather: 'Effect: Revive once at 50% HP on fatal damage (then consumed).',
  hourglass_shard: 'Effect: 15% chance a skill cast costs 0 Stamina and 0 Turns.',
  golden_scarab: 'Effect: Chests drop a second item.',
  echo_magnet: 'Effect: +50% Echoes earned.',
  cartographers_lens: 'Effect: Callouts Stairs/chest distance on floor entry.',
  alchemists_satchel: "Effect: Potions heal 2x; 50% chance to reroll a chest's Potion result.",
  time_eaters_jaw: 'Effect: Time Shards grant +8 Turns instead of +5.',
};
export function relicEffectText(effect: string): string {
  return RELIC_EFFECT_TEXT[effect] ?? '';
}

// Elite Affixes (Phase 19): mapgen.ts's spawnEnemy rolls a 10% chance for any
// regular enemy to spawn as an Elite with one of these — a randomized prefix
// that changes behavior/stats and guarantees a Relic-or-Tier-3-Weapon drop.
// `color` drives the pulsing aura render.ts draws under the sprite
// (ctx.shadowBlur/shadowColor); [Blinking]/[Colossal]/[Shielded] skip the
// aura for their own bespoke treatment (translucency/scale/ring — see
// render.ts) so `color` is unused for those three but still present for a
// consistent registry shape.
export const ELITE_AFFIXES = {
  vampiric: { name: 'Vampiric', color: '#ff3b3b' },
  swift: { name: 'Swift', color: '#3ba7ff' },
  armored: { name: 'Armored', color: '#b0b0b0' },
  volatile: { name: 'Volatile', color: '#ff8c1a' },
  toxic: { name: 'Toxic', color: '#5fd35f' },
  blinking: { name: 'Blinking', color: '#c9a6ff' },
  colossal: { name: 'Colossal', color: '#d4af37' },
  shielded: { name: 'Shielded', color: '#4aa3ff' },
  cursed: { name: 'Cursed', color: '#6a3b9e' },
  wealthy: { name: 'Wealthy', color: '#ffd700' },
} as const satisfies Record<string, { name: string; color: string }>;

export type EliteAffixKey = keyof typeof ELITE_AFFIXES;
export const ELITE_AFFIX_KEYS = Object.keys(ELITE_AFFIXES) as EliteAffixKey[];
export const ELITE_SPAWN_CHANCE = 0.1;

export function eliteAffixName(affix: string): string {
  return (ELITE_AFFIXES as Record<string, { name: string; color: string }>)[affix]?.name ?? affix;
}
export function eliteAffixColor(affix: string): string {
  return (ELITE_AFFIXES as Record<string, { name: string; color: string }>)[affix]?.color ?? '#ffffff';
}

/** Applies an Elite's stat modifiers at spawn time (mapgen.ts, after the
 * normal Depth Multiplier). Only 3 of the 10 affixes touch base stats —
 * [Swift] (+1 Speed), [Armored] (+5 DEF), [Colossal] (+300% Max HP, 2x ATK —
 * its Speed penalty is a per-turn AI gate in enemyAI.ts instead, no fixed
 * stat for "moves every 2 turns" to set here) and [Wealthy] (halved HP/ATK,
 * a deliberately weak combatant since its whole threat is escaping, not
 * fighting). [Shielded] additionally needs its own hit-counter initialized. */
export function applyEliteAffixStats(enemy: Enemy, affix: EliteAffixKey): void {
  if (affix === 'swift') {
    enemy.speed += 1;
  } else if (affix === 'armored') {
    enemy.defense += 5;
  } else if (affix === 'colossal') {
    enemy.hp = Math.round(enemy.hp * 4);
    enemy.maxHp = enemy.hp;
    enemy.attack = Math.round(enemy.attack * 2);
  } else if (affix === 'wealthy') {
    enemy.hp = Math.max(1, Math.round(enemy.hp * 0.5));
    enemy.maxHp = enemy.hp;
    enemy.attack = Math.max(1, Math.round(enemy.attack * 0.5));
  } else if (affix === 'shielded') {
    enemy.shieldedHitsLeft = 3;
  }
}

// Fun & Feel #1: lore is kept out of the runtime Item objects (so it doesn't
// bloat every save file with static, per-kind text) and looked up by display
// name instead — names are already unique identifiers throughout this file.
const LORE_BY_NAME: Record<string, string> = {};
for (const w of Object.values(WEAPONS)) LORE_BY_NAME[w.name] = w.lore;
for (const a of Object.values(ACCESSORIES)) LORE_BY_NAME[a.name] = a.lore;
for (const c of Object.values(CONSUMABLES)) LORE_BY_NAME[c.name] = c.lore;
for (const p of Object.values(POTIONS)) LORE_BY_NAME[p.name] = p.lore;

/** Flavor text for the Inventory overlay (Section 6's "Lore / Flavor Text"
 * columns) — undefined for items that never had any (Temporal Anchor, Time
 * Shard). */
export function loreForItem(name: string): string | undefined {
  return LORE_BY_NAME[name];
}

// Melt-for-Echoes value lookup, same by-display-name pattern as LORE_BY_NAME
// above — Accessories/Potions/Consumables carry a hand-tuned `melt` field
// (their `value` field already means something else per-kind). Weapons have
// no such field: their melt value scales off `atk`, the one number that
// already tracks a weapon's power/tier, in itemMeltValue below instead.
const MELT_VALUE_BY_NAME: Record<string, number> = {};
for (const a of Object.values(ACCESSORIES)) MELT_VALUE_BY_NAME[a.name] = a.melt;
for (const c of Object.values(CONSUMABLES)) MELT_VALUE_BY_NAME[c.name] = c.melt;
for (const p of Object.values(POTIONS)) MELT_VALUE_BY_NAME[p.name] = p.melt;

/** Echoes awarded for Melting this inventory item (inventory.ts's meltItem,
 * replacing the old no-payout Drop action). Weapons: 5 base + 2 per ATK, so
 * value tracks the same atk stat that already scales with game progression
 * (Bone Dagger's 2 ATK -> 9 Echoes, Apocalypse's 14 ATK -> 33 Echoes).
 * Accessories/Potions/Consumables: hand-tuned `melt` field on each entry
 * above, looked up by display name. */
export function itemMeltValue(item: Item): number {
  if (item.kind === 'WEAPON') return 5 + (item as Weapon).atk * 2;
  return MELT_VALUE_BY_NAME[item.name] ?? 5;
}

// Inventory Stat Block (GDD Section 8, Phase 16): human-readable text for
// each weapon/accessory passive ID, keyed the same way WEAPON_RANGE/
// FREE_SWAP_PASSIVES are — the machine-readable counterpart to loreForItem's
// flavor text. Passives with a purely numeric effect (def_plus_2,
// max_hp_plus_10, max_stam_plus_3, berserker, paladin) have no entry here —
// menus.ts renders those as their own stat fields (DEF/Max HP/ATK/Max
// Stamina) via inventory.ts's accessory*Bonus functions instead.
// Phase 18: rewritten alongside the 40-weapon roster — every ID here is
// live (referenced by at least one current WEAPONS entry); the pre-Phase-18
// ones no longer in use (burn_25, pierce_1, ranged_3, exact_range_2, pull_1,
// blood_magic, chill_50_free_swap, stun_synergy_2x) were dropped along with
// the weapons that used them.
export const WEAPON_EFFECT_LABEL: Partial<Record<string, string>> = {
  free_swap: 'Free Weapon Swap',
  heavy_stamina: '-1 Stamina per Hit',
  stamina_leech_10: '10% Chance: +1 Stamina on Hit',
  cure_chill_on_attack: 'Cures Your Chilled on Attack',
  pierce_ranged_2: 'Range 1-2, Pierces',
  knockback_1: 'Knockback 1',
  glass_cannon: 'Breaks if You Are Stunned',
  ranged_no_adjacent_3: 'Range 2-3, No Adjacent',
  def_minus_1_equipped: '-1 DEF while Equipped',
  def_plus_1_equipped: '+1 DEF while Equipped',
  arc_3: 'Also Hits Flanking Tiles',
  cleave_3_front: 'Hits 3 Tiles Ahead (+1 Stamina)',
  ranged_no_adjacent_4: 'Range 2-4, No Adjacent',
  lifesteal_2_on_hit: '+2 HP per Hit',
  pull_1_stun_25: 'Pulls Target 1, 25% Stun',
  blood_magic_2: '-2 HP per Hit',
  knockback_2_randomize_element: 'Knockback 2, Randomizes Element',
  ignite_behind: 'Ignites Tile Behind Target',
  wall_slam_bonus: 'Bonus Damage Slamming into Walls',
  stun_50_vs_chilled: '50% Stun vs Chilled',
  kill_refund_turn: 'Kill Refunds 1 Turn',
  ranged_push_3: 'Range 1-3, Knockback 1',
  combo_stack: '+1 ATK per Consecutive Hit',
  bonus_vs_chilled_2x: '2x Damage vs Chilled',
  bonus_vs_burning_2x: '2x Damage vs Burning',
  chill_spread_on_kill: 'Kill Spreads Chill to Adjacent',
  chain_lightning_1: 'Chains to 1 Nearby Enemy',
  execute_20_heavy: 'Executes Below 20% HP (-1 Stamina/Hit)',
  ignore_def_50: 'Ignores 50% of Enemy DEF',
  pierce_ranged_3_fire_hazard: 'Range 1-3, Pierces, Ignites',
  heal_missing_10_on_kill: 'Kill Heals 10% of Missing HP',
  permanent_def_reduction_1: 'Each Hit: -1 Enemy DEF (Permanent)',
  pierce_ranged_2_dash: 'Range 1-2, Pierces, Dashes You Forward',
  negate_first_hit_per_floor: 'Negates First Hit Each Floor',
  pierce_ranged_2_lifesteal_3: 'Range 1-2, Pierces, +3 HP per Hit',
  execute_chance_5: '5% Execute Chance',
  max_hp_minus_10_equipped: '-10 Max HP while Equipped',
  kill_refund_turns_3: 'Kill Refunds 3 Turns',
};

export const ACCESSORY_EFFECT_LABEL: Partial<Record<string, string>> = {
  dash_discount: 'Dash Costs 1 Stamina',
  echo_bonus_20: '+20% Echoes Earned',
  burn_immune: 'Immune to Burn',
  chill_immune: 'Immune to Chilled',
  stun_immune: 'Immune to Stun',
  fire_synergy: '+2 Fire Damage',
  volt_synergy: '+2 Volt Damage',
  frost_synergy: '+2 Frost Damage',
  lifesteal_1: '+1 HP per Kill',
  safety_net_15: 'Survives a Timeout Once (+15 Turns)',
  retaliation_2: 'Retaliates for 2 Damage on Hit',
  gamblers_dice: '2x Time Shard Drop Chance',
  adrenaline: 'Free Skills Below 10 HP',
  alchemist_belt: 'Consumables Cost 0 Turns',
};

// Consumable effect text (Section 6E): a function of the item's `value` since
// that's the one field each effect ID parameterizes (range, duration,
// charges, Echo amount — see the CONSUMABLES table's per-entry comments).
export const CONSUMABLE_EFFECT_TEXT: Partial<Record<string, (value: number) => string>> = {
  throw_fire_hazard: (v) => `Range: ${v} | Effect: Fire Hazard, 4 Turns`,
  throw_shock_grenade: (v) => `Range: ${v} | AOE: 3x3 Stun`,
  ice_barricade: (v) => `Duration: ${v} Turns | Effect: Wall Ahead`,
  restore_stamina: () => 'Effect: Fully Restores Stamina',
  quicksilver: (v) => `Effect: Next ${v} Actions Free`,
  recall: () => 'Effect: Return to Floor Entrance',
  echo_geode: (v) => `Echoes: +${v}`,
  whetstone: () => 'Effect: Next Hit Deals 2x Damage',
};

// Chest loot pools by Biome (Section 6D drop-source tiers: "Chests",
// "Chests (Biome 2+)", "Chests (Biome 3+)"). Tiering up with depth is what
// lets a warp-in player re-gear appropriately for the local Depth Scaling
// (Section 7, Dynamic Chest Loot). Positions are seeded; contents are
// rerolled from gameplay RNG at pickup time (inventory.ts).
type ChestRoll = (id: string) => Item;

// Phase 18: chest pools carry the 40-weapon roster's Early/Mid/Late tiers,
// mirroring the same F1-20/F21-50/F51-99 grouping the roster itself uses —
// every weapon is reachable from either a chest tier, a specific enemy's
// drop table, or a Mini-Boss's guaranteed drop (see ENEMY_DROPS/
// MINI_BOSS_WEAPON below/in combat.ts); none are chest-exclusive-excluded,
// Masamune's "Mythic" framing included, since excluding it entirely would
// make it unobtainable.
const CHEST_POOL_B1: ChestRoll[] = [
  (id) => createPotion('POTION', id),
  (id) => createPotion('MINOR_POTION', id),
  (id) => createWeapon('BONE_DAGGER', id),
  (id) => createWeapon('MYTHRIL_HAMMER', id),
  (id) => createWeapon('PARTISAN', id),
  (id) => createWeapon('GLASS_SWORD', id),
  (id) => createWeapon('BROADSWORD', id),
  (id) => createWeapon('ASH_WAND', id),
  (id) => createWeapon('BONE_CLUB', id),
  (id) => createWeapon('DEFENDER', id),
  (id) => createAccessory('IRON_RING', id),
  (id) => createAccessory('RING_OF_VIGOR', id),
  (id) => createConsumable('STAMINA_DRAUGHT', id),
];
const CHEST_POOL_B2: ChestRoll[] = [
  ...CHEST_POOL_B1,
  (id) => createPotion('HI_POTION', id),
  (id) => createAccessory('BOOTS_OF_HASTE', id),
  (id) => createAccessory('ECHO_CHARM', id),
  (id) => createAccessory('EMBER_PENDANT', id),
  (id) => createAccessory('WINGED_ANKLET', id),
  (id) => createWeapon('THUNDER_ROD', id),
  (id) => createWeapon('ELVEN_BOW', id),
  (id) => createWeapon('BLOOD_SWORD', id),
  (id) => createWeapon('TRIDENT', id),
  (id) => createWeapon('BIO_BLADE', id),
  (id) => createWeapon('MURASAME', id),
  (id) => createWeapon('GALE_BOW', id),
  (id) => createWeapon('KOTETSU', id),
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
  (id) => createPotion('MEGALIXIR', id),
  (id) => createPotion('SOMA_DROP', id),
  (id) => createAccessory('GROUNDING_BAND', id),
  (id) => createWeapon('FIRAGA_EDGE', id),
  (id) => createWeapon('RUNE_AXE', id),
  (id) => createWeapon('EXCALIBUR', id),
  (id) => createWeapon('HOLY_LANCE', id),
  (id) => createWeapon('ULTIMA_WEAPON', id),
  (id) => createWeapon('RAGNAROK', id),
  (id) => createWeapon('GUNGNIR', id),
  (id) => createWeapon('BLOOD_LANCE', id),
  (id) => createWeapon('DEATHBRINGER', id),
  (id) => createWeapon('APOCALYPSE', id),
  (id) => createWeapon('MASAMUNE', id),
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
  // Phase 19: a rare chest-loot source for Chronofacts, alongside guaranteed
  // Elite kills and Cursed Rifts — one slot in Biome 3+'s ~35-entry pool
  // keeps it meaningfully rarer than any single weapon/accessory. Picked
  // fully at random here (this static table has no access to `state.run.
  // relics` to prefer an unheld one) — inventory.ts's pickupItemsAt is what
  // converts an already-held roll into an Echo consolation at pickup time,
  // the same place every other Relic source's duplicate gets caught too.
  (id) => createRelicItemByEffect(RELIC_EFFECT_KEYS[Math.floor(Math.random() * RELIC_EFFECT_KEYS.length)], id),
];

export function rollChestItem(rng: () => number, floorNumber: number, id: string): Item {
  const biome = biomeOf(floorNumber);
  const pool = biome >= 3 ? CHEST_POOL_B3 : biome === 2 ? CHEST_POOL_B2 : CHEST_POOL_B1;
  return pool[Math.floor(rng() * pool.length)](id);
}

// Skills (Section 6B). Levels/upgrades are purchased with Echoes in Phase 5's
// Upgrade Shop; only stamina cost and identity matter for the Phase 3 menu.
// Phase 18 Content Expansion adds 20 more alongside the original 5 (additive,
// not a replacement — none of the 20 share a name/id with the originals, and
// Dash in particular is too load-bearing for traversal to drop).
export const SKILLS: Record<string, { name: string; element: Element; stamina: number }> = {
  dash: { name: 'Dash', element: 'PHYSICAL', stamina: 2 },
  cleave: { name: 'Cleave', element: 'PHYSICAL', stamina: 3 },
  flame_arc: { name: 'Flame Arc', element: 'FIRE', stamina: 4 },
  static_shift: { name: 'Static Shift', element: 'VOLT', stamina: 3 },
  ice_aegis: { name: 'Ice Aegis', element: 'FROST', stamina: 4 },
  bash: { name: 'Bash', element: 'PHYSICAL', stamina: 2 },
  dragoon_jump: { name: 'Dragoon Jump', element: 'VOLT', stamina: 3 },
  blizzard_wave: { name: 'Blizzard Wave', element: 'FROST', stamina: 4 },
  meteor: { name: 'Meteor', element: 'FIRE', stamina: 5 },
  chakra: { name: 'Chakra', element: 'PHYSICAL', stamina: 3 },
  recall: { name: 'Recall', element: 'CHRONO', stamina: 4 },
  dark_wave: { name: 'Dark Wave', element: 'PHYSICAL', stamina: 4 },
  reflect_barrier: { name: 'Reflect Barrier', element: 'VOLT', stamina: 3 },
  vanish: { name: 'Vanish', element: 'CHRONO', stamina: 2 },
  omnislash: { name: 'Omnislash', element: 'PHYSICAL', stamina: 3 },
  mug: { name: 'Mug', element: 'PHYSICAL', stamina: 2 },
  haste: { name: 'Haste', element: 'CHRONO', stamina: 4 },
  provoke: { name: 'Provoke', element: 'FIRE', stamina: 2 },
  scourge: { name: 'Scourge', element: 'FROST', stamina: 3 },
  lancet: { name: 'Lancet', element: 'VOLT', stamina: 2 },
  holy: { name: 'Holy', element: 'FIRE', stamina: 5 },
  defuse: { name: 'Defuse', element: 'VOLT', stamina: 2 },
  slow: { name: 'Slow', element: 'FROST', stamina: 3 },
  aura: { name: 'Aura', element: 'PHYSICAL', stamina: 3 },
  ultima: { name: 'Ultima', element: 'CHRONO', stamina: 0 }, // "ALL Stamina" — see skills.ts's skillStaminaCost
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
  bash: ['1x ATK + Knockback 2.', '1.5x ATK + Knockback 2.', 'Stuns instead if it hits a wall.'],
  dragoon_jump: ['Teleport 3 tiles, leaves a Stun trap.', 'Range becomes 4 tiles.', 'Costs 2 Stamina instead of 3.'],
  blizzard_wave: ['3x3 AOE Frost damage + Chilled.', '1.3x damage.', 'Also Knocks back 1 tile.'],
  meteor: ['4-range, 1-turn-delay 3x3 explosion.', '1.3x damage.', 'Leaves a Fire Hazard at the center.'],
  chakra: ['0 Turns; restores 20% Max HP.', 'Restores 30% Max HP.', '+2 ATK for 3 turns.'],
  recall: ['Mark a tile, recast to teleport back.', 'Recast restores 1 Stamina.', 'Recast costs 0 Turns.'],
  dark_wave: ['Hits all 8 adjacent tiles for 1.2x ATK.', '1.5x ATK.', 'Heals 1 HP per enemy hit.'],
  reflect_barrier: ['Blocks 1 hit, returns 3x ATK.', 'Blocks the next 2 hits.', 'The reflected hit also Stuns.'],
  vanish: ['Next move ignores collision.', 'Next 2 moves ignore collision.', 'Grants +1 Turn.'],
  omnislash: ['1.5x ATK (3x vs. Stunned/Chilled).', '2x ATK (4x vs. Stunned/Chilled).', 'Resets Stamina on a kill.'],
  mug: ['Low damage, 25% chance to steal a Consumable.', '35% chance.', '50% chance.'],
  haste: ['Next 2 actions cost 0 Turns.', 'Also restores 1 Stamina.', 'Next 3 actions instead of 2.'],
  provoke: ['+5 DEF for 1 turn, pulls enemies within 5 tiles closer.', '+7 DEF for 1 turn.', 'Also Burns adjacent enemies.'],
  scourge: ['Leaves a 3x3 DEF-piercing Frost hazard, 3 turns.', 'Hazard lasts 4 turns.', 'Hazard lasts 5 turns.'],
  lancet: ['Range 3 Volt damage, +1 Stamina restored.', 'More damage.', 'Also Stuns the target.'],
  holy: ['Massive single-target Fire damage, costs 2 Turns.', 'Even more damage.', 'Heals 20% Max HP if it kills.'],
  defuse: ["Strips a target's DEF to 0 for 1 turn.", 'Lasts 2 turns.', 'Lasts 3 turns.'],
  slow: ["Cripples a target's Speed for a few turns.", 'Lasts longer.', 'Affects a 3x3 area instead of one target.'],
  aura: ['Cleanses Status, grants immunity for 3 turns.', 'Immunity lasts 4 turns.', 'Also heals 20 HP.'],
  ultima: ['Consumes all Stamina; 5x5 AOE for Stamina x2 damage.', 'Stamina x2.5 damage.', 'Stamina x3 damage.'],
};

// Enemy death drops (Section 6A/6C). Phase 3 only wires the data + roll
// function; nothing calls this until Phase 4 implements enemy death.
type DropRoll = (id: string) => Item;

const ENEMY_DROPS: Partial<Record<EnemyKind, DropRoll[]>> = {
  BONE_GRUNT: [(id) => createWeapon('RUSTY_SWORD', id), (id) => createPotion('POTION', id)],
  EMBER_BAT: [(id) => createWeapon('FLAMETONGUE', id)],
  VOLT_TURRET: [(id) => createWeapon('MAGE_MASHER', id)],
  FROST_WRAITH: [(id) => createWeapon('ICE_LANCE', id)],
  TIME_WEAVER: [(id) => createWeapon('ASSASSINS_DAGGER', id), (id) => createPotion('MAX_POTION', id)],
  BONE_KNIGHT: [(id) => createWeapon('DARK_KNIGHTS_BLADE', id), (id) => createPotion('POTION', id)],
  CINDER_SHAMAN: [(id) => createConsumable('LIQUID_FIRE_FLASK', id), (id) => createWeapon('FLAMBERGE', id)],
  VOLT_HOUND: [(id) => createWeapon('CORAL_SWORD', id), (id) => createConsumable('STAMINA_DRAUGHT', id)],
  FROST_SENTINEL: [(id) => createWeapon('DIAMOND_MACE', id), (id) => createWeapon('SAVE_THE_QUEEN', id)],
};

/** Rolls one item from this enemy kind's drop table (null if it has none, e.g. the Boss). */
export function rollEnemyDrop(rng: Rng, kind: EnemyKind, id: string): Item | null {
  const table = ENEMY_DROPS[kind];
  if (!table || table.length === 0) return null;
  return table[Math.floor(rng() * table.length)](id);
}

// Phase 19 Elite Affixes: "guarantees a Relic or Tier-3 Weapon drop on
// death" — Tier-3 meaning the Late-game (F51-99) roster from the 40-weapon
// table above, listed directly here since WEAPONS itself has no queryable
// tier field.
const LATE_TIER_WEAPON_KEYS: WeaponKey[] = [
  'FIRAGA_EDGE', 'ICE_BRAND', 'BLITZ_WHIP', 'RUNE_AXE', 'EXCALIBUR', 'HOLY_LANCE',
  'ULTIMA_WEAPON', 'RAGNAROK', 'GUNGNIR', 'SAVE_THE_QUEEN', 'BLOOD_LANCE',
  'DEATHBRINGER', 'APOCALYPSE', 'MASAMUNE',
];

/** Killing a regular Elite (combat.ts's killEnemy, replacing that kind's
 * normal ENEMY_DROPS roll): 50/50 a random unheld Relic or a random
 * Tier-3 Weapon, falling to the weapon side once every Relic is already
 * held. [Wealthy] is handled separately in killEnemy — its spec is a
 * guaranteed Relic specifically, not this 50/50. */
export function rollEliteDrop(id: string, heldRelics: readonly string[]): Item {
  if (Math.random() < 0.5) {
    const relic = pickRandomUnheldRelic(heldRelics);
    if (relic) return createRelicItemByEffect(relic, id);
  }
  const key = LATE_TIER_WEAPON_KEYS[Math.floor(Math.random() * LATE_TIER_WEAPON_KEYS.length)];
  return createWeapon(key, id);
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
