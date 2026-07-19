import { createWeapon } from './content';
import type { GameState } from './types';

// Baseline run stats.
export const BASE_MAX_HP = 25;
export const BASE_MAX_STAMINA = 10;
export const BASE_TURNS = 100;

/** Per-floor turn limit. */
export function floorTurnLimit(state: GameState): number {
  return BASE_TURNS + state.persistent.turnBonusUpgrade * 5;
}

export const DUNGEON_SIZE = 32;

function startingWeapon() {
  return createWeapon('RUSTY_SWORD', 'starter-weapon');
}

/** Fresh save state. */
export function createNewGameState(): GameState {
  return {
    persistent: {
      rngSeed: Math.floor(Math.random() * 2 ** 31),
      loopCount: 0,
      echoes: 0,
      maxHpUpgrade: 0,
      maxStamUpgrade: 0,
      turnBonusUpgrade: 0,
      baseAtkUpgrade: 0,
      skills: { dash: 1 },
      skillLoadout: ['dash'],
      unlockedAnchors: [],
      stats: {
        deepestFloor: 1,
        bestTurnsRemaining: 0,
        wins: 0,
      },
      bestiaryKnown: [],
      ngPlusLevel: 0,
      cheatModeEnabled: false,
      weaponSlot2Unlocked: false,
      accessorySlot2Unlocked: false,
      accessorySlot3Unlocked: false,
    },

    run: {
      currentHp: BASE_MAX_HP,
      maxHp: BASE_MAX_HP,
      currentStamina: BASE_MAX_STAMINA,
      maxStamina: BASE_MAX_STAMINA,
      turnsRemaining: BASE_TURNS,
      currentFloor: 1,
      startFloor: 1,
      playerX: 0, // placed at the spawn room by the generator
      playerY: 0,
      facing: 'DOWN',
      inventory: [],
      equippedWeapon: startingWeapon(),
      equippedWeapon2: null,
      equippedAccessory: null,
      equippedAccessory2: null,
      equippedAccessory3: null,
      activeSkills: ['dash'],
      status: 'NONE',
      statusTurns: 0,
      braced: false,
      iceAegisCharges: 0,
      iceAegisChillsAttacker: false,
      floorDamageTaken: false,
      floorsVisitedThisLoop: [],
      floorFirstHitNegated: false,
      quicksilverCharges: 0,
      whetstoneCharge: false,
      recallMarkX: null,
      recallMarkY: null,
      vanishCharges: 0,
      reflectBarrierCharges: 0,
      reflectBarrierStuns: false,
      tempAtkBonus: 0,
      tempAtkBonusTurns: 0,
      tempDefBonus: 0,
      tempDefBonusTurns: 0,
      statusImmuneTurns: 0,
      relics: [],
      staticGenSteps: 0,
      staticGenCharged: false,
      trollBloodCounter: 0,
    },

    dungeon: {
      width: DUNGEON_SIZE,
      height: DUNGEON_SIZE,
      tiles: [], // generated deterministically on floor entry
      enemies: [],
      items: [],
      spawnX: 0,
      spawnY: 0,
      stairsX: 0,
      stairsY: 0,
      riftX: null,
      riftY: null,
      expiringTiles: [],
      telegraphTiles: [],
    },

    ui: {
      currentScreen: 'TITLE',
      log: [],
    },
  };
}

/** Wipes persistent state and mutates the existing state object in place. */
export function resetToNewGame(state: GameState): void {
  const fresh = createNewGameState();
  state.persistent = fresh.persistent;
  state.run = fresh.run;
  state.dungeon = fresh.dungeon;
  state.ui = fresh.ui;
}

/** Reroll seed for New Game+. */
export function rerollSeedKeepProgress(state: GameState): void {
  state.persistent.rngSeed = Math.floor(Math.random() * 2 ** 31);
}

/** Resets run to a fresh loop's starting values. */
export function resetRunForNewLoop(state: GameState, startFloor = 1): void {
  state.run.maxHp = BASE_MAX_HP + state.persistent.maxHpUpgrade * 5;
  state.run.currentHp = state.run.maxHp;
  state.run.maxStamina = BASE_MAX_STAMINA + state.persistent.maxStamUpgrade * 2;
  state.run.currentStamina = state.run.maxStamina;
  state.run.turnsRemaining = floorTurnLimit(state);
  state.run.startFloor = startFloor;
  state.run.inventory = [];
  state.run.equippedWeapon = startingWeapon();
  state.run.equippedWeapon2 = null;
  state.run.equippedAccessory = null;
  state.run.equippedAccessory2 = null;
  state.run.equippedAccessory3 = null;
  // Copied so run and persistent stay independently mutable.
  state.run.activeSkills = [...state.persistent.skillLoadout];
  state.run.status = 'NONE';
  state.run.statusTurns = 0;
  state.run.facing = 'DOWN';
  state.run.braced = false;
  state.run.iceAegisCharges = 0;
  state.run.iceAegisChillsAttacker = false;
  state.run.floorsVisitedThisLoop = [];
  state.run.quicksilverCharges = 0;
  state.run.whetstoneCharge = false;
  state.run.recallMarkX = null;
  state.run.recallMarkY = null;
  state.run.vanishCharges = 0;
  state.run.reflectBarrierCharges = 0;
  state.run.reflectBarrierStuns = false;
  state.run.tempAtkBonus = 0;
  state.run.tempAtkBonusTurns = 0;
  state.run.tempDefBonus = 0;
  state.run.tempDefBonusTurns = 0;
  state.run.statusImmuneTurns = 0;
  // Relics are run-scoped.
  state.run.relics = [];
  state.run.staticGenSteps = 0;
  state.run.staticGenCharged = false;
  state.run.trollBloodCounter = 0;
}
