// Shared turn/log helpers (GDD Section 7), used by both movement and
// inventory actions so neither module needs to import the other.

import type { GameState } from './types';

export function spendTurn(state: GameState): void {
  state.run.turnsRemaining = Math.max(0, state.run.turnsRemaining - 1);
}

export function logLine(state: GameState, line: string): void {
  state.ui.log.push(line);
  if (state.ui.log.length > 3) state.ui.log.shift();
}

/** True the instant a loss condition is met, through the CRT Time-Warp delay
 * until continueAfterDeath() resets `run` — blocks further input on GAME even
 * though `ui.currentScreen` hasn't flipped to DEATH yet (Section 11). */
export function isRunOver(state: GameState): boolean {
  return state.run.currentHp <= 0 || state.run.turnsRemaining <= 0;
}
