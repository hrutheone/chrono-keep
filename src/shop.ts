// Upgrade Shop state logic.

import { SKILL_TIER, SKILLS, SKILL_REQUIREMENTS, SKILL_UNLOCK_COUNT_REQUIREMENT } from './content';
import type { SkillId, SkillTier } from './content';
import { logLine } from './turns';
import { saveGame } from './persistence';
import { playPurchaseSfx, playSkillUnlockSfx } from './audio';
import type { GameState } from './types';

export type StatTrack = 'maxHpUpgrade' | 'maxStamUpgrade' | 'turnBonusUpgrade' | 'baseAtkUpgrade';

export const STAT_TRACKS: { track: StatTrack; label: string }[] = [
  { track: 'maxHpUpgrade', label: 'Max HP (+5/lvl)' },
  { track: 'maxStamUpgrade', label: 'Max Stamina (+2/lvl)' },
  { track: 'turnBonusUpgrade', label: 'Turn Bonus (+5/lvl)' },
  { track: 'baseAtkUpgrade', label: 'Base ATK (+1/lvl)' },
];

// Standard Curve (Max HP, Max Stamina, Turn Bonus): Levels 1-10, then +200/level with no cap.
const STANDARD_CURVE = [25, 50, 100, 150, 200, 300, 400, 500, 650, 800];
const STANDARD_CURVE_STEP_AFTER = 200;

function standardTrackCost(level: number): number {
  if (level < STANDARD_CURVE.length) return STANDARD_CURVE[level];
  return STANDARD_CURVE[STANDARD_CURVE.length - 1] + STANDARD_CURVE_STEP_AFTER * (level - STANDARD_CURVE.length + 1);
}

// Base ATK: mathematically the strongest stat. Uncapped past Level 10, same as the Standard Curve.
const BASE_ATK_CURVE = [50, 150, 300, 600, 1200, 2000, 3000, 4500, 6000, 8000];
const BASE_ATK_STEP_AFTER = 2000;

function baseAtkCost(level: number): number {
  if (level < BASE_ATK_CURVE.length) return BASE_ATK_CURVE[level];
  return BASE_ATK_CURVE[BASE_ATK_CURVE.length - 1] + BASE_ATK_STEP_AFTER * (level - BASE_ATK_CURVE.length + 1);
}

export function statTrackCost(state: GameState, track: StatTrack): number | null {
  const level = state.persistent[track];
  if (track === 'baseAtkUpgrade') return baseAtkCost(level);
  return standardTrackCost(level);
}

export function buyStatUpgrade(state: GameState, track: StatTrack): boolean {
  const cost = statTrackCost(state, track);
  if (cost === null || state.persistent.echoes < cost) return false;
  state.persistent.echoes -= cost;
  state.persistent[track] += 1;
  logLine(state, `Upgraded ${STAT_TRACKS.find((t) => t.track === track)!.label} to Lv${state.persistent[track]}.`);
  playPurchaseSfx();
  saveGame(state);
  return true;
}

export function skillLevel(state: GameState, skillId: string): number {
  return state.persistent.skills[skillId] ?? 0;
}

// Skill Cost Tiers (Section 6B/7): Core/Setup, Advanced/Tactical, Chronomancer/Endgame.
const SKILL_COSTS_BY_TIER: Record<SkillTier, number[]> = {
  1: [25, 50, 100],
  2: [75, 150, 300],
  3: [200, 400, 800],
};
export const MAX_SKILL_LEVEL = 3;

export function skillCost(state: GameState, skillId: string): number | null {
  const level = skillLevel(state, skillId);
  if (level >= MAX_SKILL_LEVEL) return null;
  return SKILL_COSTS_BY_TIER[SKILL_TIER[skillId as SkillId]][level];
}

/** Whether a skill's Level 1 prerequisites (a skill-and-level, or an "unlock N skills" gate) are met. Dash has none. */
export function isSkillUnlocked(state: GameState, skillId: SkillId): boolean {
  const countRequirement = SKILL_UNLOCK_COUNT_REQUIREMENT[skillId];
  if (countRequirement !== undefined) {
    const unlockedCount = Object.values(state.persistent.skills).filter((level) => level > 0).length;
    return unlockedCount >= countRequirement;
  }
  const requirement = SKILL_REQUIREMENTS[skillId];
  if (!requirement) return true;
  return requirement.anyOf.some(({ skillId: reqId, level }) => skillLevel(state, reqId) >= level);
}

export function buySkillUpgrade(state: GameState, skillId: string): boolean {
  const cost = skillCost(state, skillId);
  if (cost === null || state.persistent.echoes < cost) return false;
  const level = skillLevel(state, skillId);
  if (level === 0 && !isSkillUnlocked(state, skillId as SkillId)) return false;
  state.persistent.echoes -= cost;
  state.persistent.skills[skillId] = level + 1;
  logLine(state, `${SKILLS[skillId].name} upgraded to Lv${state.persistent.skills[skillId]}.`);
  playSkillUnlockSfx();
  saveGame(state);
  return true;
}

// One-time gear-slot unlocks — not part of the leveled Stat Tracks above.
export type OneTimeUpgradeId = 'weaponSlot2' | 'accessorySlot2' | 'accessorySlot3';
type BooleanPersistentFlag = 'weaponSlot2Unlocked' | 'accessorySlot2Unlocked' | 'accessorySlot3Unlocked';

export interface OneTimeUpgrade {
  id: OneTimeUpgradeId;
  label: string;
  cost: number;
  flag: BooleanPersistentFlag;
  prereqFlag?: BooleanPersistentFlag;
}

export const ONE_TIME_UPGRADES: readonly OneTimeUpgrade[] = [
  { id: 'weaponSlot2', label: 'Second Weapon Slot (hold 2, swap active)', cost: 800, flag: 'weaponSlot2Unlocked' },
  { id: 'accessorySlot2', label: 'Second Accessory Slot', cost: 600, flag: 'accessorySlot2Unlocked' },
  { id: 'accessorySlot3', label: 'Third Accessory Slot', cost: 1500, flag: 'accessorySlot3Unlocked', prereqFlag: 'accessorySlot2Unlocked' },
];

export function oneTimeUpgradeAvailable(state: GameState, upgrade: OneTimeUpgrade): boolean {
  return !upgrade.prereqFlag || state.persistent[upgrade.prereqFlag];
}

export function buyOneTimeUpgrade(state: GameState, id: OneTimeUpgradeId): boolean {
  const upgrade = ONE_TIME_UPGRADES.find((u) => u.id === id);
  if (!upgrade) return false;
  if (state.persistent[upgrade.flag]) return false;
  if (!oneTimeUpgradeAvailable(state, upgrade)) return false;
  if (state.persistent.echoes < upgrade.cost) return false;
  state.persistent.echoes -= upgrade.cost;
  state.persistent[upgrade.flag] = true;
  logLine(state, `${upgrade.label} unlocked.`);
  playPurchaseSfx();
  saveGame(state);
  return true;
}
