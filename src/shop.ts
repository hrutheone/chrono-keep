// Upgrade Shop state logic.

import { SKILLS } from './content';
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

// Stat upgrade costs.
const STAT_TRACK_COSTS: Record<StatTrack, number[]> = {
  maxHpUpgrade: [10, 20, 35, 55, 80, 120, 160, 200, 240, 280],
  maxStamUpgrade: [10, 20, 35, 55, 80, 120, 160, 200, 240, 280],
  turnBonusUpgrade: [10, 20, 35, 55, 80, 120, 160, 200, 240, 280],
  baseAtkUpgrade: [50, 100, 200, 400, 800],
};
const SKILL_COSTS = [15, 25, 40];
export const MAX_SKILL_LEVEL = SKILL_COSTS.length;

export function statTrackCost(state: GameState, track: StatTrack): number | null {
  const level = state.persistent[track];
  const costs = STAT_TRACK_COSTS[track];
  return level >= costs.length ? null : costs[level];
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

export function skillCost(state: GameState, skillId: string): number | null {
  const level = skillLevel(state, skillId);
  return level >= MAX_SKILL_LEVEL ? null : SKILL_COSTS[level];
}

export function buySkillUpgrade(state: GameState, skillId: string): boolean {
  const cost = skillCost(state, skillId);
  if (cost === null || state.persistent.echoes < cost) return false;
  state.persistent.echoes -= cost;
  state.persistent.skills[skillId] = (state.persistent.skills[skillId] ?? 0) + 1;
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
  { id: 'weaponSlot2', label: 'Second Weapon Slot (hold 2, swap active)', cost: 1000, flag: 'weaponSlot2Unlocked' },
  { id: 'accessorySlot2', label: 'Second Accessory Slot', cost: 1000, flag: 'accessorySlot2Unlocked' },
  { id: 'accessorySlot3', label: 'Third Accessory Slot', cost: 2500, flag: 'accessorySlot3Unlocked', prereqFlag: 'accessorySlot2Unlocked' },
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
