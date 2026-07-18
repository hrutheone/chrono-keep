// Echo Economy (GDD Section 7): earning rules and per-floor bookkeeping
// (Flawless Floor, first-time-reached bonus). Spending lives in shop.ts.

import { logLine } from './turns';
import { saveGame } from './persistence';
import type { GameState } from './types';

/** Echo Charm: +20% Echoes earned. Echo Magnet (Phase 19 Relic): +50% more
 * on top — the two stack multiplicatively, rounded up once at the end. */
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

/** Call right after a floor is installed into state (Phase 1/5 entry point). */
export function onFloorEntered(state: GameState): void {
  state.run.floorDamageTaken = false;
  state.run.floorFirstHitNegated = false;
  // Recall's mark is floor-relative — a mark from the previous floor points
  // at coordinates that no longer mean anything once the layout changes.
  state.run.recallMarkX = null;
  state.run.recallMarkY = null;
  const floor = state.run.currentFloor;
  if (!state.run.floorsVisitedThisLoop.includes(floor)) {
    state.run.floorsVisitedThisLoop.push(floor);
    awardEchoes(state, 3, 'floor reached');
  }

  // Cartographer's Lens (Phase 19 Relic): "reveals Stairs and Chest
  // locations immediately on floor entry" — this game has no fog-of-war to
  // literally reveal (everything on a floor already renders), so the
  // closest implementable equivalent is a log callout with distance/
  // direction, the same information a minimap ping would convey.
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

/** Call right before leaving a floor via its Stairs (Flawless Floor bonus). */
export function onFloorCleared(state: GameState): void {
  if (!state.run.floorDamageTaken) awardEchoes(state, 10, 'Flawless Floor');
}

/** Marks the current floor as no longer eligible for the Flawless Floor bonus. */
export function markFloorDamageTaken(state: GameState): void {
  state.run.floorDamageTaken = true;
}
