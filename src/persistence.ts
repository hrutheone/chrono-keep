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

export function hasSave(): boolean {
  try {
    return localStorage.getItem(SAVE_KEY) !== null;
  } catch {
    return false;
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // Ignore.
  }
}

// Master volume/mute (Phase 7, Section 11): a separate small settings blob,
// alongside `persistent` rather than inside it — it's a device/browser
// preference, not part of the save file's game-progress schema.
const AUDIO_SETTINGS_KEY = 'chrono-keep-audio-v1';

export interface AudioSettings {
  volume: number;
  muted: boolean;
}

export function saveAudioSettings(settings: AudioSettings): void {
  try {
    localStorage.setItem(AUDIO_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Ignore.
  }
}

export function loadAudioSettings(): AudioSettings | null {
  try {
    const raw = localStorage.getItem(AUDIO_SETTINGS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || typeof parsed.volume !== 'number' || typeof parsed.muted !== 'boolean') return null;
    return parsed as AudioSettings;
  } catch {
    return null;
  }
}
