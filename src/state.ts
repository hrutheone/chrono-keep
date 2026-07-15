import type { GameState } from './types';

// Base run stats. The GDD defines the per-level upgrade increments
// (+5 HP, +2 Stamina, +5 turns) but leaves the baselines as Phase 7
// tuning knobs.
export const BASE_MAX_HP = 20;
export const BASE_MAX_STAMINA = 10;
export const BASE_TURNS = 100;

/** Dungeon grid size (GDD Section 7: 32x32 Room & Corridor generator). */
export const DUNGEON_SIZE = 32;

/** Fresh save: new seed, Dash unlocked at Level 1, everything else zeroed. */
export function createNewGameState(): GameState {
  return {
    persistent: {
      rngSeed: Math.floor(Math.random() * 2 ** 31),
      loopCount: 0,
      echoes: 0,
      maxHpUpgrade: 0,
      maxStamUpgrade: 0,
      turnBonusUpgrade: 0,
      skills: { dash: 1 },
      unlockedShortcuts: [],
      stats: {
        deepestFloor: 1,
        bestTurnsRemaining: 0,
        wins: 0,
      },
    },

    run: {
      currentHp: BASE_MAX_HP,
      maxHp: BASE_MAX_HP,
      currentStamina: BASE_MAX_STAMINA,
      maxStamina: BASE_MAX_STAMINA,
      turnsRemaining: BASE_TURNS,
      currentFloor: 1,
      anchorsCollected: 0,
      playerX: 0, // Placed at the spawn room by the generator (Phase 1)
      playerY: 0,
      facing: 'DOWN',
      inventory: [],
      equippedWeapon: null,
      equippedAccessory: null,
      activeSkills: ['dash'],
      status: 'NONE',
      statusTurns: 0,
      braced: false,
      iceAegisCharges: 0,
      iceAegisChillsAttacker: false,
      floorDamageTaken: false,
      floorsVisitedThisLoop: [],
    },

    dungeon: {
      width: DUNGEON_SIZE,
      height: DUNGEON_SIZE,
      tiles: [], // Generated deterministically on floor entry (Phase 1)
      enemies: [],
      items: [],
      expiringTiles: [],
    },

    ui: {
      currentScreen: 'TITLE',
      log: [],
    },
  };
}

/** New Game (Section 7, point 9): rerolls the seed and wipes `persistent`,
 * mutating the existing state object in place so every module's reference
 * to it stays valid. */
export function resetToNewGame(state: GameState): void {
  const fresh = createNewGameState();
  state.persistent = fresh.persistent;
  state.run = fresh.run;
  state.dungeon = fresh.dungeon;
  state.ui = fresh.ui;
}
