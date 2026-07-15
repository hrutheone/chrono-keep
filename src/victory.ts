// Victory Flow (GDD Section 7): defeating the Chrono-Lich banks the victory
// Echo bonus, updates persistent stats, and shows the VICTORY screen.

import { awardEchoes } from './echoes';
import { saveGame } from './persistence';
import { playVictorySfx } from './audio';
import type { GameState } from './types';

export function triggerVictory(state: GameState): void {
  awardEchoes(state, 25 + state.run.turnsRemaining, 'Victory');
  state.persistent.stats.wins += 1;
  state.persistent.stats.bestTurnsRemaining = Math.max(state.persistent.stats.bestTurnsRemaining, state.run.turnsRemaining);
  state.ui.currentScreen = 'VICTORY';
  playVictorySfx();
  saveGame(state);
}
