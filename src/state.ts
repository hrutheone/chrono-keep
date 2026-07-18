import { createWeapon } from './content';
import type { GameState } from './types';

// Baseline run stats; per-level upgrades add +5 HP / +2 Stamina / +5 turns.
export const BASE_MAX_HP = 25;
export const BASE_MAX_STAMINA = 10;
export const BASE_TURNS = 100;

/** The turn counter is per-floor — this is the value it refills to on every
 * floor entry, so the Turn Bonus upgrade applies to every floor, not once
 * per run. */
export function floorTurnLimit(state: GameState): number {
  return BASE_TURNS + state.persistent.turnBonusUpgrade * 5;
}

export const DUNGEON_SIZE = 32;

function startingWeapon() {
  return createWeapon('RUSTY_SWORD', 'starter-weapon');
}

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
      equippedAccessory: null,
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

/** Rerolls the seed and wipes `persistent`, mutating the existing state
 * object in place so every module's reference to it stays valid. */
export function resetToNewGame(state: GameState): void {
  const fresh = createNewGameState();
  state.persistent = fresh.persistent;
  state.run = fresh.run;
  state.dungeon = fresh.dungeon;
  state.ui = fresh.ui;
}

/** A fresh dungeon layout for New Game+; every permanent upgrade/skill/Echo/
 * stat carries over. */
export function rerollSeedKeepProgress(state: GameState): void {
  state.persistent.rngSeed = Math.floor(Math.random() * 2 ** 31);
}

/** Resets `run` to a fresh loop's starting values from `persistent`'s current
 * upgrades — shared by loop reset (death/timeout), New Game+, and the Hub's
 * Shortcut Gate, all of which keep every permanent upgrade/skill.
 * `startFloor` defaults to 1; the Shortcut Gate passes its warp destination. */
export function resetRunForNewLoop(state: GameState, startFloor = 1): void {
  state.run.maxHp = BASE_MAX_HP + state.persistent.maxHpUpgrade * 5;
  state.run.currentHp = state.run.maxHp;
  state.run.maxStamina = BASE_MAX_STAMINA + state.persistent.maxStamUpgrade * 2;
  state.run.currentStamina = state.run.maxStamina;
  state.run.turnsRemaining = floorTurnLimit(state);
  state.run.startFloor = startFloor;
  state.run.inventory = [];
  state.run.equippedWeapon = startingWeapon();
  state.run.equippedAccessory = null;
  // Copied, not aliased, so run and persistent stay independently mutable.
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
  // Chronofacts are run-scoped, same lifecycle as inventory/equipment above.
  state.run.relics = [];
  state.run.staticGenSteps = 0;
  state.run.staticGenCharged = false;
  state.run.trollBloodCounter = 0;
}
