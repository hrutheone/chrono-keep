// localStorage persistence of the `persistent` block.

import type { GameState } from './types';

const SAVE_KEY = 'chrono-keep-save-v1';

/** Migrates older save formats to the current structure. */
function migratePersistent(parsed: Record<string, unknown>): GameState['persistent'] {
  const legacy = parsed as Partial<GameState['persistent']> & { unlockedShortcuts?: unknown };
  const stats = (legacy.stats ?? {}) as Partial<GameState['persistent']['stats']>;
  return {
    rngSeed: legacy.rngSeed as number,
    loopCount: legacy.loopCount ?? 0,
    echoes: legacy.echoes ?? 0,
    maxHpUpgrade: legacy.maxHpUpgrade ?? 0,
    maxStamUpgrade: legacy.maxStamUpgrade ?? 0,
    turnBonusUpgrade: legacy.turnBonusUpgrade ?? 0,
    baseAtkUpgrade: legacy.baseAtkUpgrade ?? 0,
    skills: legacy.skills ?? { dash: 1 },
    // Default to Dash if unlocked.
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
    weaponSlot2Unlocked: legacy.weaponSlot2Unlocked ?? false,
    accessorySlot2Unlocked: legacy.accessorySlot2Unlocked ?? false,
    accessorySlot3Unlocked: legacy.accessorySlot3Unlocked ?? false,
    dialogueSeenIds: Array.isArray(legacy.dialogueSeenIds)
      ? legacy.dialogueSeenIds.filter((s): s is string => typeof s === 'string')
      : [],
    lastRun: legacy.lastRun ?? null,
  };
}

export function saveGame(state: GameState): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state.persistent));
  } catch {
    // Storage unavailable.
  }
}

/** Returns the saved persistent block, or null if unreadable. */
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

// Key for best-effort run snapshot. `state.dungeon` is excluded.
const RUN_SAVE_KEY = 'chrono-keep-run-v1';

export function saveRunSnapshot(state: GameState): void {
  try {
    localStorage.setItem(RUN_SAVE_KEY, JSON.stringify(state.run));
  } catch {
    // Storage unavailable.
  }
}

/** Returns the saved run snapshot, or null if invalid. */
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

// Device/browser preference, separate from game progress.
const AUDIO_SETTINGS_KEY = 'chrono-keep-audio-v1';

export interface AudioSettings {
  volume: number;
  muted: boolean;
  musicVolume: number;
  musicMuted: boolean;
}

export function saveAudioSettings(settings: AudioSettings): void {
  try {
    localStorage.setItem(AUDIO_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Ignore.
  }
}

/** Music fields are optional on the stored value so pre-BGM saves still load. */
export function loadAudioSettings(): AudioSettings | null {
  try {
    const raw = localStorage.getItem(AUDIO_SETTINGS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || typeof parsed.volume !== 'number' || typeof parsed.muted !== 'boolean') return null;
    return {
      volume: parsed.volume,
      muted: parsed.muted,
      musicVolume: typeof parsed.musicVolume === 'number' ? parsed.musicVolume : 0.5,
      musicMuted: typeof parsed.musicMuted === 'boolean' ? parsed.musicMuted : false,
    };
  } catch {
    return null;
  }
}
