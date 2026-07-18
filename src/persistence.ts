// localStorage persistence of the `persistent` block: seed, loopCount,
// echoes, upgrades, skills, unlockedAnchors, stats. Only "New Game" wipes
// this and rerolls the seed.

import type { GameState } from './types';

const SAVE_KEY = 'chrono-keep-save-v1';

/** Old saves may predate `unlockedAnchors` or carry a stale
 * `unlockedShortcuts: string[]` with no meaning in the current structure —
 * dropped; every other field is defaulted so any old save loads cleanly. */
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
    baseAtkUpgrade: legacy.baseAtkUpgrade ?? 0,
    skills: legacy.skills ?? { dash: 1 },
    // Old saves predate the persisted Q/E/R/F loadout — default to Dash on Q
    // if unlocked, otherwise empty.
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
    cheatModeEnabled: legacy.cheatModeEnabled ?? false,
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

// Separate key from SAVE_KEY — `state.run` changes every turn, unlike
// `persistent`, and this snapshot is disposable/best-effort rather than a
// migration-guaranteed save. `state.dungeon` isn't included; main.ts rebuilds
// it deterministically from `run.currentFloor` on resume.
const RUN_SAVE_KEY = 'chrono-keep-run-v1';

export function saveRunSnapshot(state: GameState): void {
  try {
    localStorage.setItem(RUN_SAVE_KEY, JSON.stringify(state.run));
  } catch {
    // Storage unavailable (private mode, quota) — the run continues unsaved.
  }
}

/** Returns the saved run snapshot, or null if none exists or it looks stale/
 * corrupt. Caller (main.ts) rebuilds `state.dungeon` for the snapshot's floor
 * before installing it. */
export function loadRunSnapshot(): GameState['run'] | null {
  try {
    const raw = localStorage.getItem(RUN_SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    if (typeof parsed.currentHp !== 'number' || parsed.currentHp <= 0) return null;
    if (typeof parsed.turnsRemaining !== 'number' || parsed.turnsRemaining <= 0) return null;
    if (typeof parsed.currentFloor !== 'number' || parsed.currentFloor < 0 || parsed.currentFloor > 99) return null;
    if (typeof parsed.playerX !== 'number' || typeof parsed.playerY !== 'number') return null;
    if (!Array.isArray(parsed.inventory) || !Array.isArray(parsed.activeSkills)) return null;
    return parsed as GameState['run'];
  } catch {
    return null;
  }
}

export function clearRunSnapshot(): void {
  try {
    localStorage.removeItem(RUN_SAVE_KEY);
  } catch {
    // Ignore.
  }
}

// Kept alongside `persistent` rather than inside it — a device/browser
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
