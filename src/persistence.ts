// localStorage persistence of the `persistent` block (GDD Section 7, point 9
// of the Phase 5 plan): seed, loopCount, echoes, upgrades, skills,
// unlockedShortcuts, stats. Only "New Game" wipes this and rerolls the seed.

import type { GameState } from './types';

const SAVE_KEY = 'chrono-keep-save-v1';

export function saveGame(state: GameState): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state.persistent));
  } catch {
    // Storage unavailable (private mode, quota) — the run continues unsaved.
  }
}

/** Returns the saved persistent block, or null if none exists / it's unreadable. */
export function loadPersistent(): GameState['persistent'] | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || typeof parsed.rngSeed !== 'number') return null;
    return parsed as GameState['persistent'];
  } catch {
    return null;
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // Ignore.
  }
}
