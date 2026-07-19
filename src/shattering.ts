// "The Shattering" — the Loop 0 fake-endgame intro fight and its scripted loss.

import { enterBossFloor } from './bossArena';
import { createPotion, createWeapon } from './content';
import { logLine } from './turns';
import type { GameState } from './types';

// The pre-mapped Q/E/R/F loadout for the vision fight, all shown at Lv3.
const TUTORIAL_LOADOUT = ['dash', 'cleave', 'flame_arc', 'ice_aegis'];
const TUTORIAL_MAX_HP = 100;
const TUTORIAL_MAX_STAMINA = 10;
const TUTORIAL_MAX_POTIONS = 4;

/** True only during the Loop 0 vision fight — every real loop starts at 1. */
export function isShatteringTutorial(state: GameState): boolean {
  return state.persistent.loopCount === 0;
}

/** Installs the Floor 99 "fake endgame" vision fight in place of the normal Hub start. */
export function enterShatteringTutorial(state: GameState): void {
  enterBossFloor(state);
  const { run, persistent } = state;

  run.maxHp = TUTORIAL_MAX_HP;
  run.currentHp = TUTORIAL_MAX_HP;
  run.maxStamina = TUTORIAL_MAX_STAMINA;
  run.currentStamina = TUTORIAL_MAX_STAMINA;

  run.inventory = [createWeapon('SAVE_THE_QUEEN', 'tutorial-save-the-queen')];
  const maxPotion = createPotion('MAX_POTION', 'tutorial-max-potion');
  maxPotion.count = TUTORIAL_MAX_POTIONS;
  run.inventory.push(maxPotion);
  run.equippedWeapon = createWeapon('MASAMUNE', 'tutorial-masamune');
  run.equippedAccessory = null;

  // Vision-only mastery — reset back to the real defaults once the Shattering ends.
  persistent.skills = { dash: 3, cleave: 3, flame_arc: 3, ice_aegis: 3 };
  persistent.skillLoadout = [...TUTORIAL_LOADOUT];
  run.activeSkills = [...TUTORIAL_LOADOUT];

  logLine(state, 'At last. The bottom of the Temporal Well.');
}
