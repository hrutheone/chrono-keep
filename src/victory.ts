// Victory screen logic.

import { awardEchoes } from './echoes';
import { clearRunSnapshot, saveGame } from './persistence';
import { playVictorySfx } from './audio';
import type { GameState } from './types';

export function triggerVictory(state: GameState): void {
  awardEchoes(state, 25 + state.run.turnsRemaining, 'Victory');
  state.persistent.stats.wins += 1;
  state.persistent.stats.bestTurnsRemaining = Math.max(state.persistent.stats.bestTurnsRemaining, state.run.turnsRemaining);
  state.ui.currentScreen = 'VICTORY';
  playVictorySfx();
  saveGame(state);
  // Clear snapshot to prevent reloading into defeated boss arena.
  clearRunSnapshot();
}
