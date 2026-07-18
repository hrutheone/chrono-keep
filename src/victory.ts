// Victory Flow (GDD Section 7): defeating the Chrono-Lich banks the victory
// Echo bonus, updates persistent stats, and shows the VICTORY screen.

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
  // Phase 20: a run snapshot saved here would still validate (alive, Floor
  // 99, turns remaining) and, on resume, rebuild the boss arena via
  // enterBossFloor — respawning an already-defeated Chrono-Lich instead of
  // showing VICTORY. Cleared rather than saved; a reload on this screen
  // falls through to TITLE, same as pre-Phase-20 behavior (wins/stats are
  // already banked above via saveGame).
  clearRunSnapshot();
}
