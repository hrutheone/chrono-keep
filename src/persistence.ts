// localStorage persistence of the `persistent` block (GDD Section 7, point 9
// of the Phase 5 plan): seed, loopCount, echoes, upgrades, skills,
// unlockedAnchors, stats. Only "New Game" wipes this and rerolls the seed.

import type { GameState } from './types';

const SAVE_KEY = 'chrono-keep-save-v1';

/** 99-Floor Descent migration (Phase 11): pre-redesign saves stored
 * `unlockedShortcuts: string[]` (per-floor gate IDs) and predate
 * `unlockedAnchors`. Old shortcut IDs have no meaning in the new structure
 * (Anchors are Biome start floors dropped by Mini-Bosses), so they are
 * dropped; echoes/skills/upgrades/stats all carry over. Every field is
 * defaulted so a save from ANY earlier phase loads without corruption. */
function migratePersistent(parsed: Record<string, unknown>): GameState['persistent'] {
  const legacy = parsed as Partial<GameState['persistent']> & { unlockedShortcuts?: unknown };
  const stats = (legacy.stats ?? {}) as Partial<GameState['persistent']['stats']>;
  return {
    rngSeed: legacy.rngSeed as number, // presence/type checked by the caller
    loopCount: legacy.loopCount ?? 0,
    echoes: legacy.echoes ?? 0,
    maxHpUpgrade: legacy.maxHpUpgrade ?? 0,
    maxStamUpgrade: legacy.maxStamUpgrade ?? 0,
    turnBonusUpgrade: legacy.turnBonusUpgrade ?? 0,
    skills: legacy.skills ?? { dash: 1 },
    // Small Improvements: pre-existing saves predate the persisted Q/E/R/F
    // loadout — default to whatever their old `run.activeSkills` would have
    // been (Dash on Q if unlocked, otherwise empty).
    skillLoadout: Array.isArray(legacy.skillLoadout)
      ? legacy.skillLoadout.filter((s): s is string => typeof s === 'string')
      : (legacy.skills?.dash ? ['dash'] : []),
    unlockedAnchors: Array.isArray(legacy.unlockedAnchors)
      ? legacy.unlockedAnchors.filter((f): f is number => typeof f === 'number')
      : [],
    stats: {
      deepestFloor: stats.deepestFloor ?? 1,
      bestTurnsRemaining: stats.bestTurnsRemaining ?? 0,
      wins: stats.wins ?? 0,
    },
    bestiaryKnown: legacy.bestiaryKnown ?? [],
    ngPlusLevel: legacy.ngPlusLevel ?? 0,
  };
}

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
    return migratePersistent(parsed);
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
