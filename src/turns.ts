// Shared by movement and inventory actions so neither module imports the other.

import type { GameState } from './types';

export function spendTurn(state: GameState): void {
  state.run.turnsRemaining = Math.max(0, state.run.turnsRemaining - 1);
}

export function logLine(state: GameState, line: string): void {
  state.ui.log.push(line);
  if (state.ui.log.length > 3) state.ui.log.shift();
}

/** True from the instant a loss condition is met until continueAfterDeath()
 * resets `run` — blocks further input on GAME during the death animation,
 * before `ui.currentScreen` flips to DEATH. */
export function isRunOver(state: GameState): boolean {
  return state.run.currentHp <= 0 || state.run.turnsRemaining <= 0;
}
