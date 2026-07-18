// Defeating the Chrono-Lich banks the victory Echo bonus, updates persistent
// stats, and shows the VICTORY screen.

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
  // A run snapshot here would still validate on reload and rebuild the boss
  // arena, respawning an already-defeated Chrono-Lich — clear it instead so
  // a reload falls through to TITLE (wins/stats are already banked above).
  clearRunSnapshot();
}
