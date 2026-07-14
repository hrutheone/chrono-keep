// Player movement & input (GDD Sections 7 & 8, Phase 2 slice only).
// Full turn controller (enemy phase, tick/status, loop-reset check) is Phase 4:
// here a move or pass only updates position/facing and decrements the counter.

import { enterFloor, isWalkable, TILE } from './mapgen';
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

function spendTurn(state: GameState): void {
  state.run.turnsRemaining = Math.max(0, state.run.turnsRemaining - 1);
}

function logLine(state: GameState, line: string): void {
  state.ui.log.push(line);
  if (state.ui.log.length > 3) state.ui.log.shift();
}

/** Attempts one tile of movement; always updates facing, only moves/spends a turn if unblocked. */
export function tryMove(state: GameState, dx: number, dy: number, facing: Facing): void {
  state.run.facing = facing;
  const nx = state.run.playerX + dx;
  const ny = state.run.playerY + dy;
  if (nx < 0 || nx >= state.dungeon.width || ny < 0 || ny >= state.dungeon.height) return;

  // Bumping an enemy just sets facing for now — combat arrives in Phase 4.
  if (state.dungeon.enemies.some((e) => e.x === nx && e.y === ny)) return;

  const tile = state.dungeon.tiles[ny][nx];
  if (!isWalkable(tile)) return;

  state.run.playerX = nx;
  state.run.playerY = ny;
  spendTurn(state);
  logLine(state, `You move ${facing.toLowerCase()}.`);

  if (tile === TILE.STAIRS && state.run.currentFloor < MAX_PLAYABLE_FLOOR) {
    enterFloor(state, state.run.currentFloor + 1);
    logLine(state, `You descend to Floor ${state.run.currentFloor}.`);
  }
}

export function passTurn(state: GameState): void {
  spendTurn(state);
  logLine(state, 'You wait.');
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
