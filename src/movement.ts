// Player movement, bump-combat entry point, and input (GDD Sections 7 & 8).
// A move/attack/wait here is the Player Move Phase; resolvePlayerTurn runs
// the rest (Enemy -> Tick -> Check) for every turn-costing action.

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

// Arena Threshold Warning (GDD Section 7), verbatim.
const ARENA_THRESHOLD_WARNING =
  'The temporal density beyond this stair is overwhelming. Something old and hungry guards the descent. Steady yourself — there is no retreat once you cross.';

/** Shared by both branches of tryDescendIfOnStairs below: leaves the current
 * floor (Flawless Floor bonus), installs the next one (procedural, a
 * Mini-Boss Arena, or the Floor 99 Chrono-Lich Arena), and awards the
 * first-visit bonus for it. Sets the screen back to GAME explicitly —
 * required for the confirm-accepted path (showConfirm/answerPendingConfirm
 * only ever restores the screen on *decline*; every onConfirm callback in
 * this codebase is responsible for setting it back itself on accept, e.g.
 * menus.ts's startNewGame) but a harmless no-op for the direct (non-Arena)
 * path, which is already on GAME. */
function performDescend(state: GameState, next: number): void {
  onFloorCleared(state);
  if (next === FINAL_BOSS_FLOOR) enterBossFloor(state);
  else if (isArenaFloor(next)) enterArenaFloor(state, next);
  else enterFloor(state, next);
  onFloorEntered(state);
  logLine(state, next === FINAL_BOSS_FLOOR ? 'You descend into the Chrono-Lich\'s arena.' : `You descend to Floor ${next}.`);
  state.ui.currentScreen = 'GAME';
  // Phase 20: stepping onto Stairs never costs a turn (this comment's own
  // header note above), so the per-turn save in turnController.ts's
  // resolvePlayerTurn never fires here — without this, a background/reload
  // right after descending (before the next move) would resume the PREVIOUS
  // floor instead of the one just entered.
  saveRunSnapshot(state);
}

/** Descends to the next floor if the player is standing on Stairs (Section 7).
 * Shared by move, Dash, and Static Shift. A next-floor that's a Mini-Boss
 * Arena (Phase 15) or the Floor 99 Chrono-Lich Arena (Phase 16) shows the
 * Arena Threshold Warning confirm first — GDD Section 7 places it on every
 * Arena floor, "10, 20, ... 90, 99" alike. This still short-circuits the
 * caller's normal turn resolution (returns true) either way, since stepping
 * onto the stairs itself never costs a turn; declining just leaves the
 * player exactly where they were. Floor 99's arena has no Stairs tile (no
 * Floor 100 to descend to — killing the Chrono-Lich ends the run via
 * triggerVictory instead), so this never re-fires once there. */
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

/** Stepping onto a procedural floor's Cursed Rift (Phase 19) opens its
 * sacrifice-pact modal — same "free to open, no turn cost until the player
 * actually answers" shape as the Hub tiles above. A coordinate check, not a
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
    // Vanish (Phase 18 skill): the next move ignores collision entirely —
    // consumed here rather than in skills.ts since this is the only place
    // that actually knows a move was blocked.
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

  // Static Generator (Phase 19 Relic): every 3 steps taken, the next attack
  // auto-Stuns — combat.ts's playerAttackEnemy consumes staticGenCharged.
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

/** Space: Brace (GDD Section 7/8) — +1 DEF until the start of the player's next turn. */
export function passTurn(state: GameState): Promise<void> {
  if (consumeStunnedAction(state)) return Promise.resolve();
  state.run.braced = true;
  logLine(state, 'You brace, +1 DEF until your next turn.');
  return resolvePlayerTurn(state, 'wait');
}

// Hold-to-Move (Delayed Auto-Shift, Tetris-style): an initial instant move,
// then a 300ms delay before repeating every 120ms while the key stays down.
// Each repeat tick re-checks eligibility (screen/run-over/hit-stop) rather
// than cancelling the timer on an ineligible tick — a key held through a
// hit-stop freeze (e.g. stepping into a fire hazard) pauses instead of
// queuing extra moves, then resumes once the freeze clears, matching the
// "safety catch" the DAS spec calls for. Keyed by the lowercased key string
// so held direction keys track independently.
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
    // Ignore the OS's own key-repeat keydowns (and a stray re-press of an
    // already-armed key) — the DAS timer below drives every repeat itself.
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
