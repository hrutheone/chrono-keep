// Echo Economy (GDD Section 7): earning rules and per-floor bookkeeping
// (Flawless Floor, first-time-reached bonus). Spending lives in shop.ts.

import { logLine } from './turns';
import { saveGame } from './persistence';
import type { GameState } from './types';

/** Echo Charm: +20% Echoes earned, rounded up. */
function echoMultiplier(state: GameState): number {
  return state.run.equippedAccessory?.passive === 'echo_bonus_20' ? 1.2 : 1;
}

/** Banks Echoes immediately (kept on death/timeout) and persists the save. */
export function awardEchoes(state: GameState, amount: number, reason: string): number {
  const total = Math.ceil(amount * echoMultiplier(state));
  state.persistent.echoes += total;
  logLine(state, `+${total} Echoes (${reason}).`);
  saveGame(state);
  return total;
}

/** Call right after a floor is installed into state (Phase 1/5 entry point). */
export function onFloorEntered(state: GameState): void {
  state.run.floorDamageTaken = false;
  const floor = state.run.currentFloor;
  if (!state.run.floorsVisitedThisLoop.includes(floor)) {
    state.run.floorsVisitedThisLoop.push(floor);
    awardEchoes(state, 3, 'floor reached');
  }
}

/** Call right before leaving a floor via its Stairs (Flawless Floor bonus). */
export function onFloorCleared(state: GameState): void {
  if (!state.run.floorDamageTaken) awardEchoes(state, 10, 'Flawless Floor');
}

/** Marks the current floor as no longer eligible for the Flawless Floor bonus. */
export function markFloorDamageTaken(state: GameState): void {
  state.run.floorDamageTaken = true;
}
