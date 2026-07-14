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
