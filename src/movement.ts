// Player movement, bump-combat entry point, and input. A move/attack/wait
// here is the Player Move Phase; resolvePlayerTurn runs the rest
// (Enemy -> Tick -> Check) for every turn-costing action.

import { findRangedTarget, playerAttackEnemy, weaponBlockedAtRange } from './combat';
import { pickupItemsAt } from './inventory';
import { onFloorCleared, onFloorEntered } from './echoes';
import { enterFloor, isWalkableAt, TILE } from './mapgen';
import { HUB_FLOOR } from './hub';
import { isArenaFloor, enterArenaFloor } from './arenas';
import { enterBossFloor, FINAL_BOSS_FLOOR } from './bossArena';
import { showConfirm } from './menus';
import { isTurnBusy, resolvePlayerTurn } from './turnController';
import { isRunOver, logLine } from './turns';
import { playBlockedSfx, playMoveSfx } from './audio';
import { saveRunSnapshot } from './persistence';
import type { GameState } from './types';

type Facing = GameState['run']['facing'];

const ARENA_THRESHOLD_WARNING =
  'The temporal density beyond this stair is overwhelming. Something old and hungry guards the descent. Steady yourself — there is no retreat once you cross.';

/** Leaves the current floor, installs the next one (procedural, a Mini-Boss
 * Arena, or the Floor 99 Chrono-Lich Arena), and awards its first-visit
 * bonus. Explicitly resets the screen to GAME since showConfirm's
 * onConfirm callbacks own restoring it themselves on accept. */
function performDescend(state: GameState, next: number): void {
  onFloorCleared(state);
  if (next === FINAL_BOSS_FLOOR) enterBossFloor(state);
  else if (isArenaFloor(next)) enterArenaFloor(state, next);
  else enterFloor(state, next);
  onFloorEntered(state);
  logLine(state, next === FINAL_BOSS_FLOOR ? 'You descend into the Chrono-Lich\'s arena.' : `You descend to Floor ${next}.`);
  state.ui.currentScreen = 'GAME';
  // Stepping onto Stairs never costs a turn, so resolvePlayerTurn's own save
  // never fires here — without this, a reload right after descending would
  // resume the previous floor instead of the one just entered.
  saveRunSnapshot(state);
}

/** Descends to the next floor if the player is standing on Stairs. Shared by
 * move, Dash, and Static Shift. A next-floor that's an Arena shows the
 * threshold warning first; either way this short-circuits the caller's
 * normal turn resolution since stepping onto Stairs never costs a turn.
 * Floor 99's arena has no Stairs tile (killing the Chrono-Lich ends the run
 * via triggerVictory instead), so this never re-fires once there. */
export function tryDescendIfOnStairs(state: GameState): boolean {
  const tile = state.dungeon.tiles[state.run.playerY][state.run.playerX];
  if (tile !== TILE.STAIRS) return false;

  const next = state.run.currentFloor + 1;
  if (next === FINAL_BOSS_FLOOR || isArenaFloor(next)) {
    showConfirm(state, ARENA_THRESHOLD_WARNING, () => performDescend(state, next));
    return true;
  }

  performDescend(state, next);
  return true;
}

/** Stepping onto the Hub's Shop Terminal or Shortcut Gate opens its HTML
 * overlay instead of resolving a normal turn. Both tiles only ever exist on
 * the hand-authored Hub floor (src/hub.ts). */
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

/** Stepping onto a procedural floor's Cursed Rift opens its sacrifice-pact
 * modal, free to open like the Hub tiles above. A coordinate check, not a
 * tile-type check — see types.ts's dungeon.riftX/Y comment for why. */
function tryRiftInteraction(state: GameState): boolean {
  if (state.dungeon.riftX === null) return false;
  if (state.run.playerX !== state.dungeon.riftX || state.run.playerY !== state.dungeon.riftY) return false;
  state.ui.currentScreen = 'CURSED_RIFT';
  return true;
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

/** A Stunned player skips this action entirely; the turn still advances.
 * Exported so skills.ts can share the same check. */
export function consumeStunnedAction(state: GameState): boolean {
  if (state.run.status !== 'STUN') return false;
  state.run.braced = false;
  logLine(state, 'You are stunned and cannot act!');
  resolvePlayerTurn(state, 'wait');
  return true;
}

/** Attempts one tile of movement, or a bump-attack if an enemy occupies the
 * target tile. Returns the resolvePlayerTurn() promise (or a resolved
 * no-op) so programmatic callers can await a turn's full resolution;
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
    // Min-range weapons can't connect at adjacency; the attempt still
    // resolves a turn (a "whiff") rather than being a free no-op.
    if (weaponBlockedAtRange(state, 1)) {
      logLine(state, `${state.run.equippedWeapon!.name} can't hit at this range!`);
      playBlockedSfx();
      return resolvePlayerTurn(state, 'attack');
    }
    playerAttackEnemy(state, enemy);
    return resolvePlayerTurn(state, 'attack');
  }

  // No adjacent enemy — a ranged weapon may still find a target further
  // along this direction, attacking without moving.
  const rangedTarget = findRangedTarget(state, dx, dy);
  if (rangedTarget) {
    playerAttackEnemy(state, rangedTarget);
    return resolvePlayerTurn(state, 'attack');
  }

  if (!isWalkableAt(state, nx, ny)) {
    // Vanish's next-move-ignores-collision charge is consumed here rather
    // than in skills.ts since this is the only place that knows a move was
    // actually blocked.
    if (state.run.vanishCharges > 0) {
      state.run.vanishCharges -= 1;
      logLine(state, 'You phase through the wall.');
    } else {
      playBlockedSfx();
      return Promise.resolve();
    }
  }

  state.run.playerX = nx;
  state.run.playerY = ny;
  logLine(state, `You move ${facing.toLowerCase()}.`);
  playMoveSfx();

  // Static Generator: every 3 steps taken, the next attack auto-Stuns —
  // combat.ts's playerAttackEnemy consumes staticGenCharged.
  if (state.run.relics.includes('static_generator')) {
    state.run.staticGenSteps += 1;
    if (state.run.staticGenSteps >= 3) {
      state.run.staticGenSteps = 0;
      state.run.staticGenCharged = true;
      logLine(state, 'Static Generator crackles — next attack Stuns!');
    }
  }

  pickupItemsAt(state, nx, ny);
  if (tryDescendIfOnStairs(state)) return Promise.resolve();
  if (tryHubInteraction(state)) return Promise.resolve();
  if (tryRiftInteraction(state)) return Promise.resolve();

  return resolvePlayerTurn(state, 'move');
}

/** Space: Brace — +1 DEF until the start of the player's next turn. */
export function passTurn(state: GameState): Promise<void> {
  if (consumeStunnedAction(state)) return Promise.resolve();
  state.run.braced = true;
  logLine(state, 'You brace, +1 DEF until your next turn.');
  return resolvePlayerTurn(state, 'wait');
}

// Delayed Auto-Shift: an initial instant move, then repeats while held. Each
// repeat tick re-checks eligibility rather than cancelling the timer on an
// ineligible tick, so a key held through a hit-stop freeze pauses instead of
// queuing extra moves.
const DAS_DELAY_MS = 300;
const DAS_REPEAT_MS = 120;
const dasTimers = new Map<string, { timeout: number; interval: number | null }>();

function stopDas(key: string): void {
  const timer = dasTimers.get(key);
  if (!timer) return;
  clearTimeout(timer.timeout);
  if (timer.interval !== null) clearInterval(timer.interval);
  dasTimers.delete(key);
}

function stopAllDas(): void {
  for (const key of dasTimers.keys()) stopDas(key);
}

function canMoveNow(state: GameState): boolean {
  return state.ui.currentScreen === 'GAME' && !isRunOver(state) && !isTurnBusy();
}

/** Wires WASD/Arrows (move) and Space (pass) to the game state. */
export function installInput(state: GameState): void {
  window.addEventListener('keydown', (ev) => {
    const key = ev.key.toLowerCase();

    if (key === ' ' || key === 'spacebar') {
      if (state.ui.currentScreen !== 'GAME' || isRunOver(state) || isTurnBusy()) return;
      ev.preventDefault();
      passTurn(state);
      return;
    }

    const dir = DIRECTIONS[key];
    if (!dir) return;
    ev.preventDefault();
    // Ignore OS key-repeat and a stray re-press of an already-armed key —
    // the DAS timer below drives every repeat itself.
    if (ev.repeat || dasTimers.has(key)) return;
    if (!canMoveNow(state)) return;

    tryMove(state, dir.dx, dir.dy, dir.facing);

    const timeout = window.setTimeout(() => {
      const interval = window.setInterval(() => {
        if (canMoveNow(state)) tryMove(state, dir.dx, dir.dy, dir.facing);
      }, DAS_REPEAT_MS);
      dasTimers.set(key, { timeout, interval });
    }, DAS_DELAY_MS);
    dasTimers.set(key, { timeout, interval: null });
  });

  window.addEventListener('keyup', (ev) => stopDas(ev.key.toLowerCase()));
  // A key held through an alt-tab/tab-switch never fires 'keyup' — clear
  // every timer rather than leave a phantom repeat running unattended.
  window.addEventListener('blur', stopAllDas);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopAllDas();
  });
}
