// Turn Controller (GDD Section 7): Player Move Phase already happened by the
// time resolvePlayerTurn is called (movement.ts/combat.ts applied it) — this
// runs Enemy Phase -> Tick Phase -> Check Phase for every turn-costing action.
// Inventory actions follow Phase 3's separate context-sensitive rule and
// never go through here.

import { applyPlayerStatus } from './combat';
import { runEnemyPhase } from './enemyAI';
import { enterFloor, TILE } from './mapgen';
import { BASE_MAX_HP, BASE_MAX_STAMINA, BASE_TURNS } from './state';
import { logLine } from './turns';
import { PLAYER_ID, notifyDeath } from './animation';
import type { GameState } from './types';

export type PlayerActionKind = 'move' | 'attack' | 'wait';

function applyFireHazard(state: GameState): void {
  const playerTile = state.dungeon.tiles[state.run.playerY][state.run.playerX];
  if (playerTile === TILE.FIRE_HAZARD) applyPlayerStatus(state, 'BURN', 3);

  for (const enemy of state.dungeon.enemies) {
    if (state.dungeon.tiles[enemy.y][enemy.x] === TILE.FIRE_HAZARD) {
      enemy.status = 'BURN';
      enemy.statusTurns = 3;
    }
  }
}

function tickPlayerStatus(state: GameState): void {
  if (state.run.status === 'NONE') return;
  if (state.run.status === 'BURN') {
    state.run.currentHp = Math.max(0, state.run.currentHp - 2);
    logLine(state, 'You take 2 Burn damage.');
  }
  state.run.statusTurns -= 1;
  if (state.run.statusTurns <= 0) state.run.status = 'NONE';
}

function tickEnemyStatuses(state: GameState): void {
  // Enemy Burn damage already applied at Enemy Phase start; here we only count duration down.
  for (const enemy of state.dungeon.enemies) {
    if (enemy.status === 'NONE') continue;
    enemy.statusTurns -= 1;
    if (enemy.statusTurns <= 0) enemy.status = 'NONE';
  }
}

function runTickPhase(state: GameState, actionKind: PlayerActionKind): void {
  const chilledBeforeTick = state.run.status === 'CHILLED';

  applyFireHazard(state);
  tickPlayerStatus(state);
  tickEnemyStatuses(state);

  state.run.currentStamina = Math.min(state.run.maxStamina, state.run.currentStamina + 1);

  const penalty = actionKind === 'move' && chilledBeforeTick ? 2 : 1;
  state.run.turnsRemaining = Math.max(0, state.run.turnsRemaining - penalty);
}

/** Minimal loss path (full Time Loop/Echoes economy arrives in Phase 5): reload Floor 1. */
function triggerLossReset(state: GameState): void {
  const reason = state.run.currentHp <= 0 ? 'You have fallen. The loop resets.' : 'Time has run out. The loop resets.';
  if (state.run.currentHp <= 0) {
    notifyDeath(PLAYER_ID, 'PLAYER', state.run.playerX, state.run.playerY, state.run.facing);
  }
  state.persistent.loopCount += 1;

  state.run.maxHp = BASE_MAX_HP + state.persistent.maxHpUpgrade * 5;
  state.run.currentHp = state.run.maxHp;
  state.run.maxStamina = BASE_MAX_STAMINA + state.persistent.maxStamUpgrade * 2;
  state.run.currentStamina = state.run.maxStamina;
  state.run.turnsRemaining = BASE_TURNS + state.persistent.turnBonusUpgrade * 5;
  state.run.anchorsCollected = 0;
  state.run.inventory = [];
  state.run.equippedWeapon = null;
  state.run.equippedAccessory = null;
  state.run.activeSkills = state.persistent.skills.dash ? ['dash'] : [];
  state.run.status = 'NONE';
  state.run.statusTurns = 0;
  state.run.facing = 'DOWN';

  enterFloor(state, 1);
  logLine(state, reason);
}

function runCheckPhase(state: GameState): void {
  if (state.run.turnsRemaining <= 0 || state.run.currentHp <= 0) triggerLossReset(state);
}

/** Call once per turn-costing player action, after the Player Move Phase has already applied. */
export function resolvePlayerTurn(state: GameState, actionKind: PlayerActionKind): void {
  runEnemyPhase(state);
  runTickPhase(state, actionKind);
  runCheckPhase(state);
}
