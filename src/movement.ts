// Player movement, bump-combat entry point, and input (GDD Sections 7 & 8).
// A move/attack/wait here is the Player Move Phase; resolvePlayerTurn runs
// the rest (Enemy -> Tick -> Check) for every turn-costing action.

import { findRangedTarget, playerAttackEnemy, weaponBlockedAtRange } from './combat';
import { pickupItemsAt } from './inventory';
import { onFloorCleared, onFloorEntered } from './echoes';
import { enterFloor, isWalkableAt, TILE } from './mapgen';
import { HUB_FLOOR } from './hub';
import { isTurnBusy, resolvePlayerTurn } from './turnController';
import { isRunOver, logLine } from './turns';
import { playBlockedSfx, playMoveSfx } from './audio';
import type { GameState } from './types';

type Facing = GameState['run']['facing'];

export const MAX_PLAYABLE_FLOOR = 99;

/** Descends to the next floor if the player is standing on Stairs, awarding the
 * Flawless Floor bonus for the floor just left and the first-visit bonus for
 * the one just entered (Section 7). Shared by move, Dash, and Static Shift. */
export function tryDescendIfOnStairs(state: GameState): boolean {
  const tile = state.dungeon.tiles[state.run.playerY][state.run.playerX];
  if (tile !== TILE.STAIRS) return false;

  if (state.run.currentFloor >= MAX_PLAYABLE_FLOOR) {
    logLine(state, 'The final descent is not implemented until Phase 16.');
    return false;
  }

  onFloorCleared(state);
  const next = state.run.currentFloor + 1;
  enterFloor(state, next);
  onFloorEntered(state);
  logLine(state, `You descend to Floor ${next}.`);
  return true;
}

/** Stepping onto the Hub's Shop Terminal or Shortcut Gate (GDD Section 7)
 * opens its HTML overlay instead of resolving a normal turn — matching how
 * tryDescendIfOnStairs short-circuits turn resolution on Stairs. Both tiles
 * only ever exist on the hand-authored Hub floor (src/hub.ts). */
function tryHubInteraction(state: GameState): boolean {
  if (state.run.currentFloor !== HUB_FLOOR) return false;
  const tile = state.dungeon.tiles[state.run.playerY][state.run.playerX];
  if (tile === TILE.SHOP_TERMINAL) {
    state.ui.currentScreen = 'UPGRADE_SHOP';
    return true;
  }
  if (tile === TILE.SHORTCUT_GATE) {
    state.ui.currentScreen = 'SHORTCUT_GATE';
    return true;
  }
  return false;
}

const DIRECTIONS: Record<string, { dx: number; dy: number; facing: Facing }> = {
  arrowup: { dx: 0, dy: -1, facing: 'UP' },
  w: { dx: 0, dy: -1, facing: 'UP' },
  arrowdown: { dx: 0, dy: 1, facing: 'DOWN' },
  s: { dx: 0, dy: 1, facing: 'DOWN' },
  arrowleft: { dx: -1, dy: 0, facing: 'LEFT' },
  a: { dx: -1, dy: 0, facing: 'LEFT' },
  arrowright: { dx: 1, dy: 0, facing: 'RIGHT' },
  d: { dx: 1, dy: 0, facing: 'RIGHT' },
};

/** A Stunned player skips this action entirely; the turn still advances. Exported
 * so skills.ts (another player-action entry point) can share the same check. */
export function consumeStunnedAction(state: GameState): boolean {
  if (state.run.status !== 'STUN') return false;
  state.run.braced = false;
  logLine(state, 'You are stunned and cannot act!');
  resolvePlayerTurn(state, 'wait');
  return true;
}

/** Attempts one tile of movement, or a bump-attack if an enemy occupies the target tile.
 * Returns the resolvePlayerTurn() promise (or a resolved no-op) so programmatic
 * callers — the Phase 7 simulation harness — can await a turn's full resolution;
 * keyboard input simply doesn't await it. */
export function tryMove(state: GameState, dx: number, dy: number, facing: Facing): Promise<void> {
  state.run.facing = facing;
  if (consumeStunnedAction(state)) return Promise.resolve();
  state.run.braced = false; // Brace only covers the Enemy Phase right after a Wait.

  const nx = state.run.playerX + dx;
  const ny = state.run.playerY + dy;
  if (nx < 0 || nx >= state.dungeon.width || ny < 0 || ny >= state.dungeon.height) return Promise.resolve();

  const enemy = state.dungeon.enemies.find((e) => e.x === nx && e.y === ny);
  if (enemy) {
    // Min-range weapons (Ashwood Bow, Static Whip — Section 6A/8) can't
    // connect at adjacency; the attempt still resolves a turn (a "whiff"),
    // matching a real combat risk for standing too close with one equipped.
    if (weaponBlockedAtRange(state, 1)) {
      logLine(state, `${state.run.equippedWeapon!.name} can't hit at this range!`);
      playBlockedSfx();
      return resolvePlayerTurn(state, 'attack');
    }
    playerAttackEnemy(state, enemy);
    return resolvePlayerTurn(state, 'attack');
  }

  // No adjacent enemy — a ranged weapon (Frost Wand/Volt Spear's line reach,
  // Ashwood Bow/Static Whip's min-range) may still find a target further
  // along this direction, attacking without moving.
  const rangedTarget = findRangedTarget(state, dx, dy);
  if (rangedTarget) {
    playerAttackEnemy(state, rangedTarget);
    return resolvePlayerTurn(state, 'attack');
  }

  if (!isWalkableAt(state, nx, ny)) {
    playBlockedSfx();
    return Promise.resolve();
  }

  state.run.playerX = nx;
  state.run.playerY = ny;
  logLine(state, `You move ${facing.toLowerCase()}.`);
  playMoveSfx();
  pickupItemsAt(state, nx, ny);
  if (tryDescendIfOnStairs(state)) return Promise.resolve();
  if (tryHubInteraction(state)) return Promise.resolve();

  return resolvePlayerTurn(state, 'move');
}

/** Space: Brace (GDD Section 7/8) — +1 DEF until the start of the player's next turn. */
export function passTurn(state: GameState): Promise<void> {
  if (consumeStunnedAction(state)) return Promise.resolve();
  state.run.braced = true;
  logLine(state, 'You brace, +1 DEF until your next turn.');
  return resolvePlayerTurn(state, 'wait');
}

/** Wires WASD/Arrows (move) and Space (pass) to the game state. */
export function installInput(state: GameState): void {
  window.addEventListener('keydown', (ev) => {
    if (state.ui.currentScreen !== 'GAME' || isRunOver(state) || isTurnBusy()) return;
    const key = ev.key.toLowerCase();

    if (key === ' ' || key === 'spacebar') {
      ev.preventDefault();
      passTurn(state);
      return;
    }

    const dir = DIRECTIONS[key];
    if (!dir) return;
    ev.preventDefault();
    tryMove(state, dir.dx, dir.dy, dir.facing);
  });
}
