// Player movement, bump-combat entry point, and input (GDD Sections 7 & 8).
// A move/attack/wait here is the Player Move Phase; resolvePlayerTurn runs
// the rest (Enemy -> Tick -> Check) for every turn-costing action.

import { playerAttackEnemy } from './combat';
import { pickupItemsAt } from './inventory';
import { enterFloor, isWalkable, TILE } from './mapgen';
import { resolvePlayerTurn } from './turnController';
import { logLine } from './turns';
import type { GameState } from './types';

type Facing = GameState['run']['facing'];

const MAX_PLAYABLE_FLOOR = 3; // Floor 4 (Boss Arena) arrives in Phase 6.

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

/** A Stunned player skips this action entirely; the turn still advances. */
function consumeStunnedAction(state: GameState): boolean {
  if (state.run.status !== 'STUN') return false;
  logLine(state, 'You are stunned and cannot act!');
  resolvePlayerTurn(state, 'wait');
  return true;
}

/** Attempts one tile of movement, or a bump-attack if an enemy occupies the target tile. */
export function tryMove(state: GameState, dx: number, dy: number, facing: Facing): void {
  state.run.facing = facing;
  if (consumeStunnedAction(state)) return;

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
  if (!isWalkable(tile)) return;

  state.run.playerX = nx;
  state.run.playerY = ny;
  logLine(state, `You move ${facing.toLowerCase()}.`);
  pickupItemsAt(state, nx, ny);

  if (tile === TILE.STAIRS && state.run.currentFloor < MAX_PLAYABLE_FLOOR) {
    enterFloor(state, state.run.currentFloor + 1);
    logLine(state, `You descend to Floor ${state.run.currentFloor}.`);
  }

  resolvePlayerTurn(state, 'move');
}

export function passTurn(state: GameState): void {
  if (consumeStunnedAction(state)) return;
  logLine(state, 'You wait.');
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
