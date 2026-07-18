// Echo Economy: earning rules and bookkeeping.

import { logLine } from './turns';
import { saveGame } from './persistence';
import type { GameState } from './types';

/** Calculates total echo multiplier. */
function echoMultiplier(state: GameState): number {
  const charm = state.run.equippedAccessory?.passive === 'echo_bonus_20' ? 1.2 : 1;
  const magnet = state.run.relics.includes('echo_magnet') ? 1.5 : 1;
  return charm * magnet;
}

/** Banks Echoes immediately (kept on death/timeout) and persists the save. */
export function awardEchoes(state: GameState, amount: number, reason: string): number {
  const total = Math.ceil(amount * echoMultiplier(state));
  state.persistent.echoes += total;
  logLine(state, `+${total} Echoes (${reason}).`);
  saveGame(state);
  return total;
}

/** Called when floor is entered. */
export function onFloorEntered(state: GameState): void {
  state.run.floorDamageTaken = false;
  state.run.floorFirstHitNegated = false;
  // Clear recall mark on new floor.
  state.run.recallMarkX = null;
  state.run.recallMarkY = null;
  const floor = state.run.currentFloor;
  if (!state.run.floorsVisitedThisLoop.includes(floor)) {
    state.run.floorsVisitedThisLoop.push(floor);
    awardEchoes(state, 3, 'floor reached');
  }

  // Handle Cartographer's Lens relic.
  if (state.run.relics.includes('cartographers_lens')) {
    const distStairs = Math.abs(state.dungeon.stairsX - state.run.playerX) + Math.abs(state.dungeon.stairsY - state.run.playerY);
    logLine(state, `Cartographer's Lens: Stairs are ${distStairs} tiles away.`);
    const chest = state.dungeon.items.find((wi) => wi.chestLoot);
    if (chest) {
      const distChest = Math.abs(chest.x - state.run.playerX) + Math.abs(chest.y - state.run.playerY);
      logLine(state, `Cartographer's Lens: a chest is ${distChest} tiles away.`);
    }
  }
}

/** Called before leaving a floor. */
export function onFloorCleared(state: GameState): void {
  if (!state.run.floorDamageTaken) awardEchoes(state, 10, 'Flawless Floor');
}

/** Marks the current floor as no longer eligible for the Flawless Floor bonus. */
export function markFloorDamageTaken(state: GameState): void {
  state.run.floorDamageTaken = true;
}
