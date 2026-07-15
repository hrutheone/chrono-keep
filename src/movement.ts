// Player movement, bump-combat entry point, and input (GDD Sections 7 & 8).
// A move/attack/wait here is the Player Move Phase; resolvePlayerTurn runs
// the rest (Enemy -> Tick -> Check) for every turn-costing action.

import { playerAttackEnemy } from './combat';
import { pickupItemsAt } from './inventory';
import { onFloorCleared, onFloorEntered } from './echoes';
import { enterFloor, isWalkable, TILE } from './mapgen';
import { enterBossFloor } from './bossArena';
import { saveGame } from './persistence';
import { isTurnBusy, resolvePlayerTurn } from './turnController';
import { isRunOver, logLine } from './turns';
import { playBlockedSfx, playMoveSfx, playUnlockSfx } from './audio';
import type { GameState } from './types';

type Facing = GameState['run']['facing'];

export const MAX_PLAYABLE_FLOOR = 3; // Floor 3's Stairs is the Boss Gate threshold.
const BOSS_GATE_TURN_WARNING = 15;

/** Floor 3's Stairs double as the Boss Gate (Section 7): requires all 3
 * Temporal Anchors, and warns before entry with fewer than 15 turns left. */
function tryEnterBossArena(state: GameState): void {
  if (state.run.anchorsCollected < 3) {
    logLine(state, 'The Boss Gate is sealed — it needs all 3 Temporal Anchors.');
    playBlockedSfx();
    return;
  }
  if (state.run.turnsRemaining < BOSS_GATE_TURN_WARNING) {
    const proceed = window.confirm(
      'The temporal density ahead is overwhelming. You may not have enough time left to survive what lies beyond. Proceed anyway?',
    );
    if (!proceed) return;
  }
  onFloorCleared(state);
  enterBossFloor(state);
  onFloorEntered(state);
  logLine(state, 'You step through the Boss Gate into the Chrono-Lich\'s lair.');
}

/** Descends to the next floor if the player is standing on Stairs, awarding the
 * Flawless Floor bonus for the floor just left and the first-visit bonus for
 * the one just entered (Section 7). Shared by move, Dash, and Static Shift. */
export function tryDescendIfOnStairs(state: GameState): void {
  const tile = state.dungeon.tiles[state.run.playerY][state.run.playerX];
  if (tile !== TILE.STAIRS) return;

  if (state.run.currentFloor < MAX_PLAYABLE_FLOOR) {
    onFloorCleared(state);
    const next = state.run.currentFloor + 1;
    enterFloor(state, next);
    onFloorEntered(state);
    logLine(state, `You descend to Floor ${next}.`);
    return;
  }

  if (state.run.currentFloor === MAX_PLAYABLE_FLOOR) tryEnterBossArena(state);
}

/** Shortcut Gates (Section 7) open only from the stairwell-side neighbor tile,
 * or freely once already recorded in persistent.unlockedShortcuts. Pulling the
 * lever doesn't itself move the player onto the tile this same keypress. */
function tryOpenShortcutGate(state: GameState, gx: number, gy: number): void {
  const gate = state.dungeon.shortcutGate;
  if (!gate || gate.x !== gx || gate.y !== gy) {
    playBlockedSfx();
    return;
  }
  const alreadyUnlocked = state.persistent.unlockedShortcuts.includes(gate.shortcutId);
  const fromStairsSide = state.run.playerX === gate.stairsSideX && state.run.playerY === gate.stairsSideY;
  if (!alreadyUnlocked && !fromStairsSide) {
    logLine(state, 'This gate only opens from the other side.');
    playBlockedSfx();
    return;
  }

  state.dungeon.tiles[gy][gx] = TILE.FLOOR;
  playUnlockSfx();
  if (!alreadyUnlocked) {
    state.persistent.unlockedShortcuts.push(gate.shortcutId);
    logLine(state, 'You throw the lever — the shortcut gate opens!');
    saveGame(state);
  } else {
    logLine(state, 'The shortcut gate creaks open.');
  }
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
  if (tile === TILE.SHORTCUT_GATE) {
    tryOpenShortcutGate(state, nx, ny);
    return;
  }
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
