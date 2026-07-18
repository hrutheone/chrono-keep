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
