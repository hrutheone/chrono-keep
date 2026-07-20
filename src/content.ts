import type { Accessory, Consumable, CursedRiftEventKind, Element, Enemy, GameState, Item, Weapon } from './types';

export type EnemyKind = Enemy['kind'];
type Rng = () => number;

// Elemental Wheel: Fire > Frost > Volt > Physical > Fire. Chrono sits outside it.
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
  VOLT_TURRET: { hp: 25, attack: 6, defense: 1, speed: 0, element: 'VOLT' },
  FROST_WRAITH: { hp: 18, attack: 5, defense: 2, speed: 1, element: 'FROST' },
  TIME_WEAVER: { hp: 40, attack: 8, defense: 4, speed: 1, element: 'CHRONO' },
  CHRONO_LICH: { hp: 600, attack: 22, defense: 8, speed: 1, element: 'CHRONO' },

  BONE_KNIGHT: { hp: 22, attack: 5, defense: 6, speed: 1, element: 'PHYSICAL' },
  CINDER_SHAMAN: { hp: 14, attack: 6, defense: 1, speed: 1, element: 'FIRE' },
  VOLT_HOUND: { hp: 10, attack: 6, defense: 0, speed: 2, element: 'VOLT' },
  FROST_SENTINEL: { hp: 20, attack: 5, defense: 5, speed: 0, element: 'FROST' },

  INFERNO_GOLEM: { hp: 120, attack: 9, defense: 2, speed: 1, element: 'FIRE' },
  STORM_CALLER: { hp: 100, attack: 11, defense: 3, speed: 1, element: 'VOLT' },
  GLACIAL_KNIGHT: { hp: 140, attack: 10, defense: 5, speed: 1, element: 'FROST' },

  CLOCKWORK_SCARAB: { hp: 6, attack: 1, defense: 9, speed: 1, element: 'CHRONO' },

  DREAD_LEGION: { hp: 16, attack: 6, defense: 2, speed: 1, element: 'PHYSICAL' },
  DOOM_GUARD: { hp: 28, attack: 7, defense: 5, speed: 1, element: 'PHYSICAL' },
  ASH_FIEND: { hp: 12, attack: 7, defense: 0, speed: 2, element: 'FIRE' },
  HELLFIRE_MAGUS: { hp: 18, attack: 8, defense: 1, speed: 1, element: 'FIRE' },
  TESLA_COIL: { hp: 35, attack: 8, defense: 4, speed: 0, element: 'VOLT' },
  STORM_STALKER: { hp: 15, attack: 8, defense: 0, speed: 2, element: 'VOLT' },
  VOID_SPIRIT: { hp: 24, attack: 7, defense: 3, speed: 1, element: 'FROST' },
  GLACIAL_MONOLITH: { hp: 28, attack: 7, defense: 4, speed: 0, element: 'FROST' },
};

/** Aura glow color for Floor-41+ Tier-3 enemy variants. */
export const AURA_COLOR: Partial<Record<EnemyKind, string>> = {
  DREAD_LEGION: '#8b0000', // Blood Red
  DOOM_GUARD: '#4b0082', // Deep Purple
  ASH_FIEND: '#9e9e8f', // Ash Grey
  HELLFIRE_MAGUS: '#fff200', // Blinding Yellow
  TESLA_COIL: '#22e5ff', // Bright Cyan
  STORM_STALKER: '#1a1a6e', // Dark Blue
  VOID_SPIRIT: '#0d0d0d', // Pitch Black
  GLACIAL_MONOLITH: '#ffffff', // Pure White
};

/** Floors 41+: swaps a base enemy kind for its Tier-3 upgraded variant. */
const TIER3_UPGRADE: Partial<Record<EnemyKind, EnemyKind>> = {
  BONE_GRUNT: 'DREAD_LEGION',
  BONE_KNIGHT: 'DOOM_GUARD',
  EMBER_BAT: 'ASH_FIEND',
  CINDER_SHAMAN: 'HELLFIRE_MAGUS',
  VOLT_TURRET: 'TESLA_COIL',
  VOLT_HOUND: 'STORM_STALKER',
  FROST_WRAITH: 'VOID_SPIRIT',
  FROST_SENTINEL: 'GLACIAL_MONOLITH',
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
  CLOCKWORK_SCARAB: 'Clockwork Scarab',
  DREAD_LEGION: 'Dread-Legion',
  DOOM_GUARD: 'Doom-Guard',
  ASH_FIEND: 'Ash-Fiend',
  HELLFIRE_MAGUS: 'Hellfire-Magus',
  TESLA_COIL: 'Tesla-Coil',
  STORM_STALKER: 'Storm-Stalker',
  VOID_SPIRIT: 'Void-Spirit',
  GLACIAL_MONOLITH: 'Glacial-Monolith',
};

/** Marks an enemy kind as seen for the Bestiary tab. */
export function discoverEnemy(state: GameState, kind: EnemyKind): void {
  if (!state.persistent.bestiaryKnown.includes(kind)) state.persistent.bestiaryKnown.push(kind);
}

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
  INFERNO_GOLEM:
    "Forged from the citadel's own furnace core, given a will only by the shattering of the Hourglass. It remembers being nothing but fire and purpose — grind forward, grind forward, grind forward.",
  STORM_CALLER:
    "Once the Keep's chief meteomancer, still mid-ritual when the loop caught her. She keeps casting the storm she can no longer stop, and the Volt-Hounds keep answering a summons centuries stale.",
  GLACIAL_KNIGHT:
    'The last duelist of Oakhaven\'s winter court, sworn to hold this passage until relieved. No one is coming. He holds it anyway.',
  CLOCKWORK_SCARAB:
    'A gnawing little paradox, small enough to slip through the cracks in the loop. It does not bite for blood — it bites for time.',
  DREAD_LEGION:
    'What the Bone-Grunts become when the loop stops being gentle with them. They no longer feel the shove that used to buy you a breath.',
  DOOM_GUARD:
    'A Bone-Knight past caring about its wounds. Half its plate has fallen away, and the rest moves faster for the lightness.',
  ASH_FIEND:
    'An Ember-Bat burned down to embers and spite. It dies the way it lived — leaving the ground on fire behind it.',
  HELLFIRE_MAGUS:
    "A Cinder-Shaman that stopped waiting for the ritual's proper rhythm. It casts on the offbeat now, and the beat keeps quickening.",
  TESLA_COIL:
    'A Volt-Turret rewired for a longer patrol corridor. Its arc no longer forgives distance.',
  STORM_STALKER:
    'A Volt-Hound whose bite outlasts the shock. It still hunts in pairs — now it just wins more of those fights.',
  VOID_SPIRIT:
    "A Frost-Wraith that gave up on walls entirely. It drifts through stone the way the cold drifts through a held breath, and it takes a little of yours with it.",
  GLACIAL_MONOLITH:
    'A Frost-Sentinel that stopped watching corridors and started claiming rooms. Whatever stands near it, stands in the blizzard.',
};

export function createEnemy(kind: EnemyKind, id: string, x: number, y: number): Enemy {
  const t = BESTIARY[kind];
  const auraColor = AURA_COLOR[kind];
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
    ...(auraColor ? { auraColor } : {}),
  };
}

/** Which 10-floor Biome a floor belongs to (1-10). Floor 99 caps Biome 10. */
export function biomeOf(floorNumber: number): number {
  return Math.min(10, Math.floor((floorNumber - 1) / 10) + 1);
}

/** Depth Multiplier: +8% compounding every 5 floors. */
export function depthMultiplier(floorNumber: number): number {
  return Math.pow(1.08, Math.floor((floorNumber - 1) / 5));
}

// Base Echo bounty for a normal-enemy kill (before Depth Multiplier scaling).
const ENEMY_KILL_BASE_BOUNTY = 1;

/** Normal-enemy kill Echo reward, tied to the Depth Multiplier so it grows far slower than escalating Upgrade Shop costs. */
export function enemyKillBounty(floorNumber: number): number {
  return Math.max(ENEMY_KILL_BASE_BOUNTY, Math.round(ENEMY_KILL_BASE_BOUNTY * depthMultiplier(floorNumber)));
}

// Base Flawless Floor reward (before Depth Multiplier scaling); ~7 on early floors, ~30 by Floor 99.
const FLAWLESS_FLOOR_BASE_BONUS = 7;

/** Flawless Floor bonus, scaled by the Depth Multiplier. */
export function flawlessFloorBonus(floorNumber: number): number {
  return Math.round(FLAWLESS_FLOOR_BASE_BONUS * depthMultiplier(floorNumber));
}

/** Applies Depth Multiplier to spawned enemies. */
export function scaleEnemyForDepth(enemy: Enemy, floorNumber: number): void {
  const mult = depthMultiplier(floorNumber);
  if (mult <= 1) return;
  enemy.hp = Math.round(enemy.hp * mult);
  enemy.maxHp = enemy.hp;
  enemy.attack = Math.round(enemy.attack * mult);
}

/** Applies NG+ HP scaling. */
export function scaleEnemyForNgPlus(enemy: Enemy, ngPlusLevel: number): void {
  if (ngPlusLevel <= 0) return;
  const scaled = Math.round(enemy.hp * (1 + 0.1 * ngPlusLevel));
  enemy.hp = scaled;
  enemy.maxHp = scaled;
}

/** Applies Echo Magnet HP scaling. */
export function scaleEnemyForEchoMagnet(enemy: Enemy, active: boolean): void {
  if (!active) return;
  const scaled = Math.round(enemy.hp * 1.2);
  enemy.hp = scaled;
  enemy.maxHp = scaled;
}

/** Procedural-floor enemy pool. */
export function enemyPoolForFloor(floorNumber: number): EnemyKind[] {
  const biome = biomeOf(floorNumber);
  let pool: EnemyKind[];
  if (biome === 1) {
    pool = ['BONE_GRUNT', 'EMBER_BAT'];
  } else if (biome === 2) {
    pool = ['BONE_GRUNT', 'EMBER_BAT', 'VOLT_TURRET', 'FROST_WRAITH'];
  } else {
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
    if (biome === 10) {
      pool = [...full, 'TIME_WEAVER', 'TIME_WEAVER'];
    } else {
      const theme = (biome - 4) % 3;
      if (theme === 0) pool = [...full, 'EMBER_BAT', 'EMBER_BAT'];
      else if (theme === 1) pool = [...full, 'VOLT_TURRET', 'VOLT_TURRET'];
      else pool = [...full, 'FROST_WRAITH', 'FROST_WRAITH'];
    }
  }

  if (floorNumber >= 31) pool = [...pool, 'CLOCKWORK_SCARAB'];
  if (floorNumber >= 41) pool = pool.map((k) => TIER3_UPGRADE[k] ?? k);
  return pool;
}

export function enemyCountRangeForFloor(floorNumber: number): { min: number; max: number } {
  const biome = biomeOf(floorNumber);
  if (biome <= 2) return { min: 3, max: 5 };
  if (biome <= 5) return { min: 4, max: 6 };
  return { min: 5, max: 6 };
}

const WEAPONS = {
  // --- Early game (F1-F20) ---
  RUSTY_SWORD: { name: 'Rusty Sword', atk: 3, element: 'PHYSICAL', passive: 'none', lore: 'Your service weapon from a timeline long forgotten. It remembers the taste of blood, but its edge has dulled across a thousand failed resets.' },
  BONE_DAGGER: { name: 'Bone Dagger', atk: 2, element: 'PHYSICAL', passive: 'free_swap', lore: 'Carved from the femur of a fallen Watchwarden. It demands so little weight to wield, you can draw it between the ticks of a clock.' },
  MYTHRIL_HAMMER: { name: 'Mythril Hammer', atk: 5, element: 'PHYSICAL', passive: 'heavy_stamina', lore: 'Too heavy for a living arm to swing twice. Yours is not quite living anymore.' },
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

  // --- Ultimate Elemental (F80-99 chase weapons) ---
  LAEVATEINN: { name: 'Laevateinn', atk: 9, element: 'FIRE', passive: 'cremate', lore: 'The legendary fire sword that reduces everything to ash. It burns hottest when the fuel is already lit.' },
  VAJRA: { name: 'Vajra', atk: 9, element: 'VOLT', passive: 'gungnir_pierce', lore: 'A spear of mythic thunder. It never misses, and its strike freezes the nervous system.' },
  NIFLHEIM: { name: 'Niflheim', atk: 9, element: 'FROST', passive: 'shatter_execute', lore: 'A blade colder than the void. It does not cut; it simply shatters what is already frozen.' },
} as const satisfies Record<string, { name: string; atk: number; element: Element; passive: string; lore: string }>;

export type WeaponKey = keyof typeof WEAPONS;
export const WEAPON_KEYS = Object.keys(WEAPONS) as WeaponKey[];

export function createWeapon(key: WeaponKey, id: string): Weapon {
  const w = WEAPONS[key];
  return { id, kind: 'WEAPON', name: w.name, value: 0, atk: w.atk, element: w.element, passive: w.passive };
}

// Weapon attack ranges.
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
  gungnir_pierce: { min: 1, max: 2 }, // Vajra
};

export const FREE_SWAP_PASSIVES = new Set(['free_swap']);

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
    melt: 40,
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
    melt: 45,
  },
} as const satisfies Record<string, { name: string; passive: string; lore: string; melt: number }>;

export type AccessoryKey = keyof typeof ACCESSORIES;

export function createAccessory(key: AccessoryKey, id: string): Accessory {
  const a = ACCESSORIES[key];
  return { id, kind: 'ACCESSORY', name: a.name, value: 0, passive: a.passive };
}

const POTIONS = {
  POTION: { name: 'Potion', effect: 'heal_flat', value: 10, lore: 'A murky, lukewarm brew. It tastes like failure, but it works.', melt: 5 },
  MAX_POTION: {
    name: 'Max Potion',
    effect: 'heal_flat',
    value: 999,
    lore: "Distilled from a Watchwarden's final, desperate moment. It remembers what it means to be whole.",
    melt: 30,
  },
  MINOR_POTION: { name: 'Minor Potion', effect: 'heal_flat', value: 20, lore: 'A cleaner brew than the Watch usually manages. Small comforts.', melt: 8 },
  HI_POTION: { name: 'Hi-Potion', effect: 'heal_percent_max', value: 40, lore: 'Bottled by someone who actually knew what they were doing, once.', melt: 15 },
  MEGALIXIR: {
    name: 'Megalixir',
    effect: 'heal_percent_max_cleanse',
    value: 100,
    lore: 'The last good thing the old alchemists ever made. It burns every ailment out along with the pain.',
    melt: 50,
  },
  SOMA_DROP: {
    name: 'Soma Drop',
    effect: 'permanent_max_hp',
    value: 5,
    lore: 'Not a heal — a rewrite. It takes its time settling into your bones.',
    melt: 60,
  },
} as const satisfies Record<string, { name: string; effect: string; value: number; lore: string; melt: number }>;

export type PotionKey = keyof typeof POTIONS;

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

export function rollRandomConsumable(id: string): Consumable {
  const key = CONSUMABLE_KEYS[Math.floor(Math.random() * CONSUMABLE_KEYS.length)];
  return createConsumable(key, id);
}

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

/** Looks up a relic's display name/lore by its `effect` ID. */
const RELIC_BY_EFFECT: Record<string, { name: string; lore: string }> = {};
for (const r of Object.values(RELICS)) RELIC_BY_EFFECT[r.effect] = { name: r.name, lore: r.lore };
export function relicName(effect: string): string {
  return RELIC_BY_EFFECT[effect]?.name ?? effect;
}
export function relicLore(effect: string): string {
  return RELIC_BY_EFFECT[effect]?.lore ?? '';
}

const RELIC_EFFECT_KEYS = Object.values(RELICS).map((r) => r.effect);

/** Returns a random unheld relic effect ID, or null if all are held. */
export function pickRandomUnheldRelic(held: readonly string[]): string | null {
  const available = RELIC_EFFECT_KEYS.filter((e) => !held.includes(e));
  if (available.length === 0) return null;
  return available[Math.floor(Math.random() * available.length)];
}

/** Up to `count` distinct random unheld relic effect IDs — fewer if not enough remain unheld. */
export function pickRandomUnheldRelics(held: readonly string[], count: number): string[] {
  const picked: string[] = [];
  const seen = [...held];
  for (let i = 0; i < count; i++) {
    const relic = pickRandomUnheldRelic(seen);
    if (!relic) break;
    picked.push(relic);
    seen.push(relic);
  }
  return picked;
}

/** Builds a Relic Item from an effect ID. */
export function createRelicItemByEffect(effect: string, id: string): Item {
  return { id, kind: 'RELIC', name: relicName(effect), value: 0, effect };
}

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

/** Applies Elite stat modifiers. */
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

const LORE_BY_NAME: Record<string, string> = {};
for (const w of Object.values(WEAPONS)) LORE_BY_NAME[w.name] = w.lore;
for (const a of Object.values(ACCESSORIES)) LORE_BY_NAME[a.name] = a.lore;
for (const c of Object.values(CONSUMABLES)) LORE_BY_NAME[c.name] = c.lore;
for (const p of Object.values(POTIONS)) LORE_BY_NAME[p.name] = p.lore;

export function loreForItem(name: string): string | undefined {
  return LORE_BY_NAME[name];
}

/** Display text for an item's name — appends a Weapon's upgradeBonus suffix (e.g. "Flametongue +2"); base `name` never changes. */
export function itemDisplayName(item: Item): string {
  if (item.kind === 'WEAPON') {
    const bonus = (item as Weapon).upgradeBonus;
    if (bonus) return `${item.name} +${bonus}`;
  }
  return item.name;
}

const MELT_VALUE_BY_NAME: Record<string, number> = {};
for (const a of Object.values(ACCESSORIES)) MELT_VALUE_BY_NAME[a.name] = a.melt;
for (const c of Object.values(CONSUMABLES)) MELT_VALUE_BY_NAME[c.name] = c.melt;
for (const p of Object.values(POTIONS)) MELT_VALUE_BY_NAME[p.name] = p.melt;

export function itemMeltValue(item: Item): number {
  if (item.kind === 'WEAPON') {
    const w = item as Weapon;
    let tierBonus = 0;
    
    const wKey = Object.keys(WEAPONS).find(k => WEAPONS[k as WeaponKey].name === w.name) as WeaponKey;
    if (wKey) {
      if (LATE_TIER_WEAPON_KEYS.includes(wKey)) tierBonus = 40;
      else if (MID_TIER_WEAPON_KEYS.includes(wKey)) tierBonus = 15;
      else if (EARLY_TIER_WEAPON_KEYS.includes(wKey)) tierBonus = 5;
    }

    const bonus = w.upgradeBonus ?? 0;
    const bonusMelt = bonus * 20;
    const baseAtk = w.atk - bonus;
    
    return 5 + tierBonus + bonusMelt + (baseAtk * 2);
  }
  return MELT_VALUE_BY_NAME[item.name] ?? 5;
}

// Inventory Stat Block labels.
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
  cremate: '2x Damage vs Burning',
  gungnir_pierce: 'Range 1-2, Pierces, Guaranteed Stun',
  shatter_execute: 'Executes Chilled Enemies Below 25% HP',
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

// Consumable effect text.
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

// Chest loot pools by Biome.
type ChestRoll = (id: string) => Item;

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

const MID_STAGE_CHEST_ITEMS: ChestRoll[] = [
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

const LATE_STAGE_CHEST_ITEMS: ChestRoll[] = [
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
  // Rare chest-loot source for Relics.
  (id) => createRelicItemByEffect(RELIC_EFFECT_KEYS[Math.floor(Math.random() * RELIC_EFFECT_KEYS.length)], id),
];

// Stage-overlapping chest pools:
// Biome 1-2 (F1-20): Early Stage items
// Biome 3-5 (F21-50): Early + Mid Stage items
// Biome 6+  (F51-99): Mid + Late Stage items (excludes Early Stage items)
const CHEST_POOL_B2: ChestRoll[] = [...CHEST_POOL_B1, ...MID_STAGE_CHEST_ITEMS];
const CHEST_POOL_B3: ChestRoll[] = [...MID_STAGE_CHEST_ITEMS, ...LATE_STAGE_CHEST_ITEMS];

export function rollChestItem(rng: () => number, floorNumber: number, id: string): Item {
  const biome = biomeOf(floorNumber);
  const pool = biome >= 6 ? CHEST_POOL_B3 : biome >= 3 ? CHEST_POOL_B2 : CHEST_POOL_B1;
  return pool[Math.floor(rng() * pool.length)](id);
}

// Skills. Four Branches radiating from the starter Dash skill (Section 6B).
export const SKILLS: Record<string, { name: string; element: Element; stamina: number }> = {
  // --- Branch A: The Striker (Mobility, Positioning, Assassination) ---
  dash: { name: 'Dash', element: 'PHYSICAL', stamina: 2 },
  bash: { name: 'Bash', element: 'PHYSICAL', stamina: 2 },
  mug: { name: 'Mug', element: 'PHYSICAL', stamina: 2 },
  grapple: { name: 'Grapple', element: 'PHYSICAL', stamina: 2 },
  static_shift: { name: 'Static Shift', element: 'VOLT', stamina: 3 },
  omnislash: { name: 'Omnislash', element: 'PHYSICAL', stamina: 3 },
  vanish: { name: 'Vanish', element: 'CHRONO', stamina: 2 },

  // --- Branch B: The Sentinel (Defense, Survival, Brawling) ---
  cleave: { name: 'Cleave', element: 'PHYSICAL', stamina: 3 },
  ice_aegis: { name: 'Ice Aegis', element: 'FROST', stamina: 4 },
  provoke: { name: 'Provoke', element: 'FIRE', stamina: 2 },
  reflect_barrier: { name: 'Reflect Barrier', element: 'VOLT', stamina: 3 },
  chakra: { name: 'Chakra', element: 'PHYSICAL', stamina: 3 },
  fortify: { name: 'Fortify', element: 'PHYSICAL', stamina: 0 }, // "ALL Stamina" — see skills.ts's skillStaminaCost
  aura: { name: 'Aura', element: 'PHYSICAL', stamina: 3 },

  // --- Branch C: The Weaver (Magic, Area Control, Debuffs) ---
  flame_arc: { name: 'Flame Arc', element: 'FIRE', stamina: 4 },
  defuse: { name: 'Defuse', element: 'VOLT', stamina: 2 },
  blizzard_wave: { name: 'Blizzard Wave', element: 'FROST', stamina: 4 },
  slow: { name: 'Slow', element: 'FROST', stamina: 3 },
  chain_lightning: { name: 'Chain Lightning', element: 'VOLT', stamina: 4 },
  meteor: { name: 'Meteor', element: 'FIRE', stamina: 5 },

  // --- Branch D: The Chronomancer (Time Manipulation, Endgame) ---
  recall: { name: 'Recall', element: 'CHRONO', stamina: 4 },
  haste: { name: 'Haste', element: 'CHRONO', stamina: 4 },
  time_stop: { name: 'Time-Stop', element: 'CHRONO', stamina: 5 },
  paradox: { name: 'Paradox', element: 'CHRONO', stamina: 4 },
  ultima: { name: 'Ultima', element: 'CHRONO', stamina: 0 }, // "ALL Stamina" — see skills.ts's skillStaminaCost
};

export type SkillId = keyof typeof SKILLS;

// Skill level effects.
export const SKILL_LEVEL_EFFECTS: Record<SkillId, readonly [string, string, string]> = {
  dash: ['Move 2 tiles in one turn.', 'Move 3 tiles.', '+1 Turn refunded on use.'],
  bash: ['1x ATK + Knockback 2 tiles.', '1.5x ATK + Knockback 2.', 'Stuns instead if it hits a wall.'],
  mug: ['0.5x ATK, 25% chance to steal a Consumable.', '35% chance to steal.', '50% chance to steal.'],
  grapple: ['Pulls target up to 3 tiles directly to you.', 'Pulls up to 4 tiles.', 'Next attack against them deals 1.5x damage.'],
  static_shift: ['Teleport 3 tiles, Stun adjacent.', 'Range becomes 4 tiles.', 'Costs 2 Stamina instead of 3.'],
  omnislash: ['1.5x ATK (3x vs. Stunned/Chilled).', '2x ATK (4x vs. Stunned/Chilled).', 'Resets Stamina to Max on a kill.'],
  vanish: ['Next move ignores enemy/wall collision.', 'Next 2 moves ignore collision.', 'Grants +1 Turn on cast.'],

  cleave: ['Deal 1.2x ATK to 3 front tiles.', 'Deal 1.5x ATK.', 'Inflicts Knockback 1.'],
  ice_aegis: ['Block the next 1 attack entirely.', 'Blocks the next 2 attacks.', 'Attackers are Chilled.'],
  provoke: ['+5 DEF for 1 turn, pulls enemies within 5 tiles closer.', '+7 DEF for 1 turn.', 'Also Burns adjacent enemies on cast.'],
  reflect_barrier: ['Block 1 hit, return 2x ATK to attacker.', 'Block 1 hit, return 3x ATK.', 'The reflected hit also Stuns them.'],
  chakra: ['Costs 0 Turns; restores 20% Max HP.', 'Restores 30% Max HP.', 'Also grants +2 ATK for 3 turns.'],
  fortify: ['Consumes all Stamina. Grants +2 DEF per Stamina spent for 3 turns.', '+3 DEF per Stamina spent.', 'Also grants status immunity while active.'],
  aura: ['Cleanses Status, grants immunity for 3 turns.', 'Immunity lasts 4 turns.', 'Heals 20 HP on cast.'],

  flame_arc: ['Deal 5 Fire DMG to adjacent enemies.', 'Chance to Burn (50%).', 'Leaves Fire Hazard on floor (3 turns).'],
  defuse: ["Strips a target's DEF to 0 for 1 turn.", 'Lasts 2 turns.', 'Lasts 3 turns.'],
  blizzard_wave: ['3x3 AOE Frost damage + Chilled.', '1.3x damage.', 'Also Knocks back 1 tile.'],
  slow: ["Target's speed becomes 0 for 2 turns.", 'Lasts 3 turns.', 'Affects a 3x3 area instead of single target.'],
  chain_lightning: ['Hits target, arcs to 2 nearest enemies for 1x ATK.', 'Arcs to 3 enemies.', '25% chance to Stun all hit targets.'],
  meteor: ['4-range, 1-turn-delay 3x3 explosion (2x ATK).', '3x ATK.', 'Leaves Fire Hazard at center.'],

  recall: ['Mark a tile, recast to teleport back instantly.', 'Recast restores 1 Stamina.', 'Recast costs 0 Turns.'],
  haste: ['Next 2 actions (Move/Attack) cost 0 Turns.', 'Also restores 1 Stamina on cast.', 'Next 3 actions cost 0 Turns.'],
  time_stop: ["Freezes the floor's 100-Turn counter for 3 turns.", 'Freezes for 5 turns.', 'Freezes for 7 turns.'],
  paradox: ['Swaps your current HP % with target\'s HP %.', 'Also swaps Status effects.', 'Refunds 2 Turns if used on an Elite/Boss.'],
  ultima: ['Consumes all Stamina; 5x5 AOE for (Stamina x2) DMG.', '(Stamina x2.5) DMG.', '(Stamina x3) DMG.'],
};

// Skill Cost Tiers (Section 6B/7): Core/Setup, Advanced/Tactical, Chronomancer/Endgame.
export type SkillTier = 1 | 2 | 3;

export const SKILL_TIER: Record<SkillId, SkillTier> = {
  dash: 1, bash: 1, cleave: 1, mug: 1, flame_arc: 1, ice_aegis: 1, defuse: 1,
  grapple: 2, static_shift: 2, omnislash: 2, provoke: 2, reflect_barrier: 2, chakra: 2, blizzard_wave: 2, slow: 2, chain_lightning: 2, vanish: 2,
  recall: 3, haste: 3, time_stop: 3, paradox: 3, meteor: 3, fortify: 3, aura: 3, ultima: 3,
};

/** One skill-and-level prerequisite, or an "any of" list for skills reachable from two branches. */
export interface SkillRequirement {
  anyOf: readonly { skillId: SkillId; level: number }[];
}

function req(skillId: SkillId, level: number): SkillRequirement {
  return { anyOf: [{ skillId, level }] };
}

// Prerequisites gating a skill's Level 1 unlock. Absent = no prerequisite (Dash, the starter).
export const SKILL_REQUIREMENTS: Partial<Record<SkillId, SkillRequirement>> = {
  bash: req('dash', 1),
  mug: req('dash', 1),
  grapple: req('bash', 1),
  static_shift: req('dash', 2),
  omnislash: { anyOf: [{ skillId: 'grapple', level: 1 }, { skillId: 'static_shift', level: 1 }] },
  vanish: req('mug', 2),

  cleave: req('dash', 1),
  ice_aegis: req('dash', 1),
  provoke: req('cleave', 1),
  reflect_barrier: req('ice_aegis', 1),
  chakra: req('provoke', 1),
  fortify: req('reflect_barrier', 2),
  aura: req('chakra', 2),

  flame_arc: { anyOf: [{ skillId: 'bash', level: 1 }, { skillId: 'cleave', level: 1 }] },
  defuse: req('flame_arc', 1),
  blizzard_wave: req('flame_arc', 1),
  slow: req('defuse', 1),
  chain_lightning: req('defuse', 2),
  meteor: req('blizzard_wave', 2),

  haste: req('recall', 1),
  time_stop: req('recall', 2),
  paradox: req('haste', 2),
};

// Recall and Ultima unlock once the player has purchased this many *other* skills (any level), instead of a specific prerequisite skill.
export const SKILL_UNLOCK_COUNT_REQUIREMENT: Partial<Record<SkillId, number>> = {
  recall: 10,
  ultima: 15,
};

/** Human-readable prerequisite text for the locked-skill tooltip, e.g. "Requires: Cleave Lvl 1". */
export function skillRequirementLabel(skillId: SkillId): string | null {
  const count = SKILL_UNLOCK_COUNT_REQUIREMENT[skillId];
  if (count !== undefined) return `Requires: Unlock ${count} Skills`;
  const requirement = SKILL_REQUIREMENTS[skillId];
  if (!requirement) return null;
  const parts = requirement.anyOf.map(({ skillId: reqId, level }) => `${SKILLS[reqId].name} Lvl ${level}`);
  return `Requires: ${parts.join(' or ')}`;
}

// Skill Tree branch grouping, for the Skill tab / Upgrade Shop UI (Section 8).
export const SKILL_BRANCHES: readonly { label: string; skills: readonly SkillId[] }[] = [
  { label: 'The Striker', skills: ['dash', 'bash', 'mug', 'grapple', 'static_shift', 'omnislash', 'vanish'] },
  { label: 'The Sentinel', skills: ['cleave', 'ice_aegis', 'provoke', 'reflect_barrier', 'chakra', 'fortify', 'aura'] },
  { label: 'The Weaver', skills: ['flame_arc', 'defuse', 'blizzard_wave', 'slow', 'chain_lightning', 'meteor'] },
  { label: 'The Chronomancer', skills: ['recall', 'haste', 'time_stop', 'paradox', 'ultima'] },
];

// Enemy death drops.
type DropRoll = (id: string) => Item;
interface DropEntry {
  roll: DropRoll;
  isPotion?: boolean;
}

const ENEMY_DROPS: Partial<Record<EnemyKind, DropEntry[]>> = {
  BONE_GRUNT: [{ roll: (id) => createWeapon('RUSTY_SWORD', id) }, { roll: (id) => createPotion('POTION', id), isPotion: true }],
  EMBER_BAT: [{ roll: (id) => createWeapon('FLAMETONGUE', id) }],
  VOLT_TURRET: [{ roll: (id) => createWeapon('MAGE_MASHER', id) }],
  FROST_WRAITH: [{ roll: (id) => createWeapon('ICE_LANCE', id) }],
  TIME_WEAVER: [{ roll: (id) => createWeapon('ASSASSINS_DAGGER', id) }, { roll: (id) => createPotion('MAX_POTION', id), isPotion: true }],
  BONE_KNIGHT: [{ roll: (id) => createWeapon('DARK_KNIGHTS_BLADE', id) }, { roll: (id) => createPotion('POTION', id), isPotion: true }],
  CINDER_SHAMAN: [{ roll: (id) => createConsumable('LIQUID_FIRE_FLASK', id) }, { roll: (id) => createWeapon('FLAMBERGE', id) }],
  VOLT_HOUND: [{ roll: (id) => createWeapon('CORAL_SWORD', id) }, { roll: (id) => createConsumable('STAMINA_DRAUGHT', id) }],
  FROST_SENTINEL: [{ roll: (id) => createWeapon('DIAMOND_MACE', id) }, { roll: (id) => createWeapon('SAVE_THE_QUEEN', id) }],
};

// Below this HP fraction, Potion/Minor Potion entries count twice in the drop roll (Dynamic Loot).
export const DYNAMIC_LOOT_HP_THRESHOLD = 0.3;

/** Rolls one item from this enemy kind's drop table (null if it has none, e.g. the Boss). */
export function rollEnemyDrop(rng: Rng, kind: EnemyKind, id: string, lowHp = false): Item | null {
  const table = ENEMY_DROPS[kind];
  if (!table || table.length === 0) return null;
  const weighted = lowHp ? table.flatMap((e) => (e.isPotion ? [e, e] : [e])) : table;
  return weighted[Math.floor(rng() * weighted.length)].roll(id);
}

const LATE_TIER_WEAPON_KEYS: WeaponKey[] = [
  'FIRAGA_EDGE', 'ICE_BRAND', 'BLITZ_WHIP', 'RUNE_AXE', 'EXCALIBUR', 'HOLY_LANCE',
  'ULTIMA_WEAPON', 'RAGNAROK', 'GUNGNIR', 'SAVE_THE_QUEEN', 'BLOOD_LANCE',
  'DEATHBRINGER', 'APOCALYPSE', 'MASAMUNE', 'LAEVATEINN', 'VAJRA', 'NIFLHEIM',
];

const MID_TIER_WEAPON_KEYS: WeaponKey[] = [
  'THUNDER_ROD', 'IFRITS_BLADE', 'ELVEN_BOW', 'BLOOD_SWORD', 'CORAL_SWORD',
  'DARK_KNIGHTS_BLADE', 'ASSASSINS_DAGGER', 'FLAMBERGE', 'TRIDENT', 'BIO_BLADE',
  'MURASAME', 'GALE_BOW', 'KOTETSU', 'DIAMOND_MACE',
];

// Excludes Rusty Sword — the starter weapon isn't a meaningful Elite reward.
const EARLY_TIER_WEAPON_KEYS: WeaponKey[] = [
  'BONE_DAGGER', 'MYTHRIL_HAMMER', 'MAGE_MASHER', 'FLAMETONGUE', 'ICE_LANCE',
  'PARTISAN', 'GLASS_SWORD', 'BROADSWORD', 'ASH_WAND', 'BONE_CLUB', 'DEFENDER',
];

/** Rolls a random weapon strictly from the Early Tier (F1-20) pool. */
export function rollEarlyTierWeapon(id: string): Weapon {
  const key = EARLY_TIER_WEAPON_KEYS[Math.floor(Math.random() * EARLY_TIER_WEAPON_KEYS.length)];
  return createWeapon(key, id);
}

/** Rolls a random weapon strictly from the Mid Tier (F21-50) pool. */
export function rollMidTierWeapon(id: string): Weapon {
  const key = MID_TIER_WEAPON_KEYS[Math.floor(Math.random() * MID_TIER_WEAPON_KEYS.length)];
  return createWeapon(key, id);
}

/** Rolls a random weapon strictly from the Late Tier (F51-99) pool. */
export function rollLateTierWeapon(id: string): Weapon {
  const key = LATE_TIER_WEAPON_KEYS[Math.floor(Math.random() * LATE_TIER_WEAPON_KEYS.length)];
  return createWeapon(key, id);
}

/** Rolls a weapon for a given floor depth using stage-overlapping pools (F1-20: Early; F21-50: Early+Mid; F51+: Mid+Late). */
export function rollWeaponForDepth(floorNumber: number, id: string): Weapon {
  if (floorNumber >= 51) {
    const keys = [...MID_TIER_WEAPON_KEYS, ...LATE_TIER_WEAPON_KEYS];
    return createWeapon(keys[Math.floor(Math.random() * keys.length)], id);
  }
  if (floorNumber >= 21) {
    const keys = [...EARLY_TIER_WEAPON_KEYS, ...MID_TIER_WEAPON_KEYS];
    return createWeapon(keys[Math.floor(Math.random() * keys.length)], id);
  }
  return rollEarlyTierWeapon(id);
}

// Elite weapon-drop ATK bonus range, layered on top of the tier's base atk and mirrored into upgradeBonus for the UI suffix.
const ELITE_DROP_ATK_BONUS_LATE: readonly [number, number] = [2, 4];
const ELITE_DROP_ATK_BONUS_MID: readonly [number, number] = [1, 3];
const ELITE_DROP_ATK_BONUS_EARLY: readonly [number, number] = [1, 2];

function getRandomBonus(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Rolls regular Elite drop — weapon tier (and its ATK bonus range) scales with how deep the kill happened. */
export function rollEliteDrop(id: string, heldRelics: readonly string[], currentFloor: number): Item {
  if (Math.random() < 0.5) {
    const relic = pickRandomUnheldRelic(heldRelics);
    if (relic) return createRelicItemByEffect(relic, id);
  }
  const weapon = rollWeaponForDepth(currentFloor, id);
  const [min, max] = currentFloor >= 51 ? ELITE_DROP_ATK_BONUS_LATE : currentFloor >= 21 ? ELITE_DROP_ATK_BONUS_MID : ELITE_DROP_ATK_BONUS_EARLY;
  const bonus = getRandomBonus(min, max);
  weapon.atk += bonus;
  weapon.upgradeBonus = bonus;
  return weapon;
}

export const TIME_SHARD_DROP_CHANCE = 0.25;

export function createTimeShard(id: string): Item {
  return { id, kind: 'TIME_SHARD', name: 'Time Shard', value: 5 };
}

// --- The Eternity Tree (Hub decoration) ---
export const ETERNITY_TREE_FLAVOR: readonly string[] = [
  "A frail seedling. Its roots struggle to grip this fractured reality. It needs more Temporal Anchors to stabilize the Keep.",
  "The Eternity Tree is growing. The anchors you've driven into the rift are giving it strength. The air around it feels peacefully still.",
  "A strong temporal tree. Its amber leaves hum with stored time. The Lich's grasp on the upper floors is visibly weakening.",
  'The Tree blooms across stabilized time! Its roots have completely pierced the anomaly. The path to the Chrono-Lich is forever secured.',
];

/** Growth stage (0-3) from how many Biomes have been anchored. */
export function eternityTreeStage(unlockedAnchorCount: number): 0 | 1 | 2 | 3 {
  if (unlockedAnchorCount >= 9) return 3;
  if (unlockedAnchorCount >= 6) return 2;
  if (unlockedAnchorCount >= 3) return 1;
  return 0;
}

// --- The Temporal Smuggler (Hub random encounter) ---
export type SmugglerOfferId = 'relic' | 'weapon' | 'potion';
export interface SmugglerOffer {
  id: SmugglerOfferId;
  label: string;
  cost: number;
  description: string;
}
export const SMUGGLER_OFFERS: readonly SmugglerOffer[] = [
  { id: 'relic', label: 'Smuggled Relic', cost: 250, description: 'A random Relic, for this run.' },
  { id: 'weapon', label: 'Sharpened Edge', cost: 150, description: 'Replaces your equipped weapon with a random Mid Tier one.' },
  { id: 'potion', label: 'Lifeblood', cost: 200, description: 'A Max Potion, added to your inventory.' },
];
export const SMUGGLER_SPAWN_CHANCE = 0.3;
export const SMUGGLER_MIN_LOOP_COUNT = 2;

// --- Cursed Rift Event Roulette ---
// Rolled uniformly (1-6) the instant the player steps onto a Cursed Rift tile.
export const CURSED_RIFT_EVENT_KINDS: readonly CursedRiftEventKind[] = [
  'rift_shop',
  'blood_anvil',
  'frozen_watchwarden',
  'paradox_mirror',
  'lich_projection',
  'echo_geode',
];

export function rollCursedRiftEvent(): CursedRiftEventKind {
  return CURSED_RIFT_EVENT_KINDS[Math.floor(Math.random() * CURSED_RIFT_EVENT_KINDS.length)];
}

export interface CursedRiftEventInfo {
  title: string;
  flavor: string;
}
export const CURSED_RIFT_EVENT_INFO: Record<CursedRiftEventKind, CursedRiftEventInfo> = {
  rift_shop: {
    title: 'The Rift Shop',
    flavor: 'A voice not quite Silas\'s offers you Relics for memories.',
  },
  blood_anvil: {
    title: 'The Blood-Infused Anvil',
    flavor: 'A crude altar, stained dark. It wants life, not Echoes.',
  },
  frozen_watchwarden: {
    title: 'The Frozen Watchwarden',
    flavor: 'A comrade, locked in ice mid-stride. Something could still thaw him.',
  },
  paradox_mirror: {
    title: 'The Paradox Mirror',
    flavor: 'The Rift shatters. Something wearing your face steps out of the pieces.',
  },
  lich_projection: {
    title: "The Chrono-Lich's Projection",
    flavor: 'A flickering echo of Him leans in, amused. He always has an offer.',
  },
  echo_geode: {
    title: 'The Echo Geode',
    flavor: 'A jagged crystal, humming with trapped memories, ready to be struck.',
  },
};

// Event 1: Rift Shop.
export const RIFT_SHOP_OFFER_COUNT = 3;
export const RIFT_SHOP_PRICES: readonly number[] = [50, 150, 300];

// Event 2: Blood-Infused Anvil.
export const BLOOD_ANVIL_HP_COST_FRACTION = 0.5;
export const BLOOD_ANVIL_ATK_BONUS = 2;

// Event 3: Frozen Watchwarden.
export const WATCHWARDEN_SKILL_LEVEL_BONUS = 1;

// Event 5: The Chrono-Lich's Projection.
export const LICH_PROJECTION_MAX_HP_COST = 10;

// Event 6: Echo Geode.
export const ECHO_GEODE_MAX_TURNS = 5;
export const ECHO_GEODE_ECHOES_PER_TURN = 15;
export const ECHO_GEODE_AMBUSH_TURNS: readonly number[] = [3, 5];
export const ECHO_GEODE_AMBUSH_CHANCE = 0.5;
