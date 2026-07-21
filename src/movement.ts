// Player movement logic.

import { findRangedTarget, playerAttackEnemy, weaponBlockedAtRange } from './combat';
import { pickupItemsAt, reforgeWeapon } from './inventory';
import { onFloorCleared, onFloorEntered, awardEchoes } from './echoes';
import { effectiveTileAt, enterFloor, isWalkableAt, TILE } from './mapgen';
import { HUB_FLOOR } from './hub';
import { isArenaFloor, enterArenaFloor } from './arenas';
import { enterBossFloor, FINAL_BOSS_FLOOR } from './bossArena';
import { showConfirm } from './menus';
import { isTurnBusy, resolvePlayerTurn } from './turnController';
import { isRunOver, logLine } from './turns';
import { playBlockedSfx, playEquipSfx, playMoveSfx, playPotionSfx } from './audio';
import { saveRunSnapshot } from './persistence';
import { pickRandomUnheldRelic, createRelicItemByEffect, rollSameTierWeapon, rollLateTierWeapon, createWeapon } from './content';
import { notifyFloatingText } from './floatingText';
import { triggerScreenShake } from './animation';
import { isSilasAt } from './npc';
import { openDialogue, openTreeDialogue } from './dialogue';
import { triggerCursedRiftEvent } from './cursedRift';
import type { GameState } from './types';

type Facing = GameState['run']['facing'];

const ARENA_THRESHOLD_WARNING =
  'The temporal density beyond this stair is overwhelming. Something old and hungry guards the descent. Steady yourself — there is no retreat once you cross.';

/** Perform descend to next floor. */
export function performDescend(state: GameState, next: number): void {
  onFloorCleared(state);

  if (state.run.floorEvent === 'PACIFIST' && state.run.pacifistKills === 0) {
    awardEchoes(state, 150, "Pacifist's Reward");
    const relic = pickRandomUnheldRelic(state.run.relics);
    if (relic) {
      state.dungeon.items.push({ item: createRelicItemByEffect(relic, 'pacifist-relic'), x: state.run.playerX, y: state.run.playerY, chestLoot: false });
      pickupItemsAt(state, state.run.playerX, state.run.playerY);
    }
  }

  if (next === FINAL_BOSS_FLOOR) enterBossFloor(state);
  else if (isArenaFloor(next)) enterArenaFloor(state, next);
  else enterFloor(state, next);
  onFloorEntered(state);
  logLine(state, next === FINAL_BOSS_FLOOR ? 'You descend into the Chrono-Lich\'s arena.' : `You descend to Floor ${next}.`);
  state.ui.currentScreen = 'GAME';
  // Save snapshot after descending.
  saveRunSnapshot(state);
}

/** Descend if on Stairs. */
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

/** Full HP/Stamina/status restore, then the well reverts to floor. */
function tryEchoWell(state: GameState, x: number, y: number): void {
  if (effectiveTileAt(state, x, y) !== TILE.ECHO_WELL) return;
  state.run.currentHp = state.run.maxHp;
  state.run.currentStamina = state.run.maxStamina;
  state.run.status = 'NONE';
  state.run.statusTurns = 0;
  state.dungeon.tiles[y][x] = TILE.FLOOR;
  logLine(state, 'The Echo Well washes over you — fully restored.');
  playPotionSfx();
}

/** Offers the equipped weapon to the Chrono Anvil for a 4-outcome gamble. */
function tryChronoAnvil(state: GameState, x: number, y: number): void {
  if (effectiveTileAt(state, x, y) !== TILE.CHRONO_ANVIL) return;
  if (!state.run.equippedWeapon) {
    showConfirm(state, 'You have nothing to forge.', () => {
      state.ui.currentScreen = 'GAME';
    });
    return;
  }
  
  showConfirm(state, 'Offer your weapon to the Anvil? The chronal forge is unpredictable.', () => {
    state.ui.currentScreen = 'GAME';
    const floor = state.run.currentFloor;
    const id = `f${floor}-anvil-${x}-${y}`;
    const roll = Math.random();
    
    if (roll < 0.2) {
      // Jackpot
      const forged = rollLateTierWeapon(id);
      reforgeWeapon(state, forged);
      notifyFloatingText(x, y, 'FLAWLESS FORGE!', 'crit');
      logLine(state, 'JACKPOT! The Anvil forges a masterpiece!');
      triggerScreenShake();
      playEquipSfx();
    } else if (roll < 0.4) {
      // Upgrade
      if (state.run.equippedWeapon) {
        state.run.equippedWeapon.upgradeBonus = (state.run.equippedWeapon.upgradeBonus ?? 0) + 1;
        state.run.equippedWeapon.atk += 1;
      }
      notifyFloatingText(x, y, 'RESONANCE INCREASED', 'immune');
      logLine(state, 'UPGRADE! Your weapon feels sharper.');
      playEquipSfx();
    } else if (roll < 0.8) {
      // Sidegrade
      const forged = rollSameTierWeapon(state.run.equippedWeapon!, id);
      reforgeWeapon(state, forged);
      notifyFloatingText(x, y, 'REFORGED', 'damage');
      logLine(state, 'SIDEGRADE. The Anvil returns an equivalent weapon.');
      playEquipSfx();
    } else {
      // Catastrophe
      const forged = createWeapon('SHATTERED_SCRAP', id);
      reforgeWeapon(state, forged);
      notifyFloatingText(x, y, 'SHATTERED...', 'corrupted');
      logLine(state, 'CATASTROPHE! Your weapon shatters into scrap.');
      triggerScreenShake();
      playBlockedSfx();
    }
    
    state.dungeon.tiles[y][x] = TILE.FLOOR;
  });
}

/** Bumping the Eternity Tree, Silas, the Smuggler, the Shop Terminal, or the Shortcut Gate blocks movement instead of walking onto them — the player stays put and the interaction opens in place. */
function tryHubBump(state: GameState, nx: number, ny: number): boolean {
  if (state.run.currentFloor !== HUB_FLOOR) return false;
  if (isSilasAt(state, nx, ny)) {
    openDialogue(state);
    state.ui.currentScreen = 'DIALOGUE';
    return true;
  }
  const tile = effectiveTileAt(state, nx, ny);
  if (tile === TILE.TREE) {
    openTreeDialogue(state);
    state.ui.currentScreen = 'DIALOGUE';
    return true;
  }
  if (tile === TILE.SMUGGLER) {
    state.ui.currentScreen = 'SMUGGLER';
    return true;
  }
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

/** Try Cursed Rift interaction. */
function tryRiftInteraction(state: GameState): boolean {
  if (state.dungeon.riftX === null) return false;
  if (state.run.playerX !== state.dungeon.riftX || state.run.playerY !== state.dungeon.riftY) return false;
  triggerCursedRiftEvent(state);
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

/** Consume stunned action. */
export function consumeStunnedAction(state: GameState): boolean {
  if (state.run.status !== 'STUN') return false;
  state.run.braced = false;
  logLine(state, 'You are stunned and cannot act!');
  resolvePlayerTurn(state, 'wait');
  return true;
}

/** Try to move or attack. */
export function tryMove(state: GameState, dx: number, dy: number, facing: Facing): Promise<void> {
  state.run.facing = facing;
  if (consumeStunnedAction(state)) return Promise.resolve();
  state.run.braced = false; // Reset brace.

  const nx = state.run.playerX + dx;
  const ny = state.run.playerY + dy;
  if (nx < 0 || nx >= state.dungeon.width || ny < 0 || ny >= state.dungeon.height) return Promise.resolve();

  const enemy = state.dungeon.enemies.find((e) => e.x === nx && e.y === ny);
  if (enemy) {
    // Min-range weapons check.
    if (weaponBlockedAtRange(state, 1)) {
      logLine(state, `${state.run.equippedWeapon!.name} can't hit at this range!`);
      playBlockedSfx();
      return resolvePlayerTurn(state, 'attack');
    }
    playerAttackEnemy(state, enemy);
    return resolvePlayerTurn(state, 'attack');
  }

  // Ranged target check.
  const rangedTarget = findRangedTarget(state, dx, dy);
  if (rangedTarget) {
    playerAttackEnemy(state, rangedTarget);
    return resolvePlayerTurn(state, 'attack');
  }

  if (tryHubBump(state, nx, ny)) return Promise.resolve();

  if (!isWalkableAt(state, nx, ny)) {
    // Handle Vanish charge.
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

  // Static Generator charge.
  if (state.run.relics.includes('static_generator')) {
    state.run.staticGenSteps += 1;
    if (state.run.staticGenSteps >= 3) {
      state.run.staticGenSteps = 0;
      state.run.staticGenCharged = true;
      logLine(state, 'Static Generator crackles — next attack Stuns!');
    }
  }

  pickupItemsAt(state, nx, ny);
  tryEchoWell(state, nx, ny);
  tryChronoAnvil(state, nx, ny);
  if (tryDescendIfOnStairs(state)) return Promise.resolve();
  if (tryRiftInteraction(state)) return Promise.resolve();

  return resolvePlayerTurn(state, 'move');
}

/** Pass turn and brace. */
export function passTurn(state: GameState): Promise<void> {
  if (consumeStunnedAction(state)) return Promise.resolve();
  state.run.braced = true;
  logLine(state, 'You brace, +1 DEF until your next turn.');
  return resolvePlayerTurn(state, 'wait');
}

// Delayed Auto-Shift setup.
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

/** Install input listeners. */
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
    // Ignore OS repeat.
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
  // Clear DAS on blur.
  window.addEventListener('blur', stopAllDas);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopAllDas();
  });
}
