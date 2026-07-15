// Player movement, bump-combat entry point, and input (GDD Sections 7 & 8).
// A move/attack/wait here is the Player Move Phase; resolvePlayerTurn runs
// the rest (Enemy -> Tick -> Check) for every turn-costing action.

import { playerAttackEnemy } from './combat';
import { pickupItemsAt } from './inventory';
import { onFloorCleared, onFloorEntered } from './echoes';
import { enterFloor, isWalkable, TILE } from './mapgen';
import { resolvePlayerTurn } from './turnController';
import { logLine } from './turns';
import { playBlockedSfx, playMoveSfx } from './audio';
import type { GameState } from './types';

type Facing = GameState['run']['facing'];

export const MAX_PLAYABLE_FLOOR = 3; // Floor 4 (Boss Arena) arrives in Phase 6.

/** Descends to the next floor if the player is standing on Stairs, awarding the
 * Flawless Floor bonus for the floor just left and the first-visit bonus for
 * the one just entered (Section 7). Shared by move, Dash, and Static Shift. */
export function tryDescendIfOnStairs(state: GameState): void {
  const tile = state.dungeon.tiles[state.run.playerY][state.run.playerX];
  if (tile !== TILE.STAIRS || state.run.currentFloor >= MAX_PLAYABLE_FLOOR) return;
  onFloorCleared(state);
  const next = state.run.currentFloor + 1;
  enterFloor(state, next);
  onFloorEntered(state);
  logLine(state, `You descend to Floor ${next}.`);
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

/** Attempts one tile of movement, or a bump-attack if an enemy occupies the target tile. */
export function tryMove(state: GameState, dx: number, dy: number, facing: Facing): void {
  state.run.facing = facing;
  if (consumeStunnedAction(state)) return;
  state.run.braced = false; // Brace only covers the Enemy Phase right after a Wait.

  const nx = state.run.playerX + dx;
  const ny = state.run.playerY + dy;
  if (nx < 0 || nx >= state.dungeon.width || ny < 0 || ny >= state.dungeon.height) return;

  const enemy = state.dungeon.enemies.find((e) => e.x === nx && e.y === ny);
  if (enemy) {
    playerAttackEnemy(state, enemy);
    resolvePlayerTurn(state, 'attack');
    return;
  }

  const tile = state.dungeon.tiles[ny][nx];
  if (!isWalkable(tile)) {
    playBlockedSfx();
    return;
  }

  state.run.playerX = nx;
  state.run.playerY = ny;
  logLine(state, `You move ${facing.toLowerCase()}.`);
  playMoveSfx();
  pickupItemsAt(state, nx, ny);
  tryDescendIfOnStairs(state);

  resolvePlayerTurn(state, 'move');
}

/** Space: Brace (GDD Section 7/8) — +1 DEF until the start of the player's next turn. */
export function passTurn(state: GameState): void {
  if (consumeStunnedAction(state)) return;
  state.run.braced = true;
  logLine(state, 'You brace, +1 DEF until your next turn.');
  resolvePlayerTurn(state, 'wait');
}

/** Wires WASD/Arrows (move) and Space (pass) to the game state. */
export function installInput(state: GameState): void {
  window.addEventListener('keydown', (ev) => {
    if (state.ui.currentScreen !== 'GAME') return;
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
