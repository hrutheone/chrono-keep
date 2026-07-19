// Turn resolution phases.

import { applyEnemyStatus, applyPlayerStatus, computeDamage, consumeHitStopFlag, killEnemy, playerElement } from './combat';
import { runEnemyPhase, tickBossRewind } from './enemyAI';
import { TILE, effectiveTileAt } from './mapgen';
import { HUB_FLOOR, enterHub } from './hub';
import { resetRunForNewLoop } from './state';
import { logLine } from './turns';
import { markFloorDamageTaken } from './echoes';
import { saveGame, saveRunSnapshot } from './persistence';
import { playDeathSfx, playLoopResetSfx } from './audio';
import { PLAYER_ID, notifyDeath } from './animation';
import { notifyFloatingText } from './floatingText';
import { consumeAccessoryWithPassive, hasAccessoryPassive, totalDef } from './inventory';
import { isShatteringTutorial } from './shattering';
import type { GameState } from './types';

export type PlayerActionKind = 'move' | 'attack' | 'wait' | 'skill' | 'item';

function isHazardAt(state: GameState, x: number, y: number): boolean {
  return effectiveTileAt(state, x, y) === TILE.FIRE_HAZARD;
}

function applyFireHazard(state: GameState): void {
  if (isHazardAt(state, state.run.playerX, state.run.playerY)) {
    if (!hasAccessoryPassive(state, 'burn_immune')) applyPlayerStatus(state, 'BURN', 3);
  }

  for (const enemy of state.dungeon.enemies) {
    if (isHazardAt(state, enemy.x, enemy.y)) {
      enemy.status = 'BURN';
      enemy.statusTurns = 3;
    }
  }
}

// Frost Hazard chip damage.
const FROST_HAZARD_DAMAGE = 1;

function isFrostHazardAt(state: GameState, x: number, y: number): boolean {
  return effectiveTileAt(state, x, y) === TILE.FROST_HAZARD;
}

function applyFrostHazard(state: GameState): void {
  if (isFrostHazardAt(state, state.run.playerX, state.run.playerY)) {
    state.run.currentHp = Math.max(0, state.run.currentHp - FROST_HAZARD_DAMAGE);
    markFloorDamageTaken(state);
    logLine(state, `The frost gnaws at you for ${FROST_HAZARD_DAMAGE}.`);
    notifyFloatingText(state.run.playerX, state.run.playerY, `${FROST_HAZARD_DAMAGE}`, 'damage');
  }
  // Iterate enemy snapshot.
  for (const enemy of [...state.dungeon.enemies]) {
    if (!isFrostHazardAt(state, enemy.x, enemy.y)) continue;
    enemy.hp -= FROST_HAZARD_DAMAGE;
    notifyFloatingText(enemy.x, enemy.y, `${FROST_HAZARD_DAMAGE}`, 'damage');
    if (enemy.hp <= 0) killEnemy(state, enemy, 'bump');
  }
}

/** Tick temporary buffs. */
function tickTempBuffs(state: GameState): void {
  if (state.run.tempAtkBonusTurns > 0) {
    state.run.tempAtkBonusTurns -= 1;
    if (state.run.tempAtkBonusTurns <= 0) state.run.tempAtkBonus = 0;
  }
  if (state.run.tempDefBonusTurns > 0) {
    state.run.tempDefBonusTurns -= 1;
    if (state.run.tempDefBonusTurns <= 0) state.run.tempDefBonus = 0;
  }
  if (state.run.statusImmuneTurns > 0) state.run.statusImmuneTurns -= 1;
}

/** Tick enemy overrides. */
function tickEnemyOverrides(state: GameState): void {
  for (const enemy of state.dungeon.enemies) {
    if (enemy.defuseTurnsLeft !== undefined && enemy.defuseTurnsLeft > 0) {
      enemy.defuseTurnsLeft -= 1;
      if (enemy.defuseTurnsLeft <= 0) {
        enemy.defense = enemy.defuseOriginalDef ?? enemy.defense;
        enemy.defuseOriginalDef = undefined;
      }
    }
    if (enemy.slowTurnsLeft !== undefined && enemy.slowTurnsLeft > 0) {
      enemy.slowTurnsLeft -= 1;
      if (enemy.slowTurnsLeft <= 0) {
        enemy.speed = enemy.slowOriginalSpeed ?? enemy.speed;
        enemy.slowOriginalSpeed = undefined;
      }
    }
  }
}

/** Troll Blood: auto-restores 1 HP every 10 dungeon turns (Hub excluded). */
function tickTrollBlood(state: GameState): void {
  if (!state.run.relics.includes('troll_blood')) return;
  state.run.trollBloodCounter += 1;
  if (state.run.trollBloodCounter < 10) return;
  state.run.trollBloodCounter = 0;
  if (state.run.currentHp < state.run.maxHp) {
    state.run.currentHp = Math.min(state.run.maxHp, state.run.currentHp + 1);
    logLine(state, 'Troll Blood knits a wound shut — +1 HP.');
  }
}

function tickExpiringTiles(state: GameState): void {
  for (const tile of state.dungeon.expiringTiles) tile.turnsLeft -= 1;
  state.dungeon.expiringTiles = state.dungeon.expiringTiles.filter((t) => t.turnsLeft > 0);
}

// Default Fire Hazard turns.
const DEFAULT_FIRE_HAZARD_TURNS = 2;

function detonateTelegraph(state: GameState, t: GameState['dungeon']['telegraphTiles'][number]): void {
  const hitsPlayer = state.run.playerX === t.x && state.run.playerY === t.y;

  if (t.payload === 'stun') {
    if (hitsPlayer) {
      applyPlayerStatus(state, 'STUN', 1);
      logLine(state, 'The Time-Blast detonates — you are Stunned!');
    }
    for (const enemy of state.dungeon.enemies) {
      if (enemy.x === t.x && enemy.y === t.y && enemy.kind !== 'CHRONO_LICH') applyEnemyStatus(enemy, 'STUN', 1);
    }
    return;
  }

  if (t.payload === 'fire_aoe') {
    if (hitsPlayer) {
      const dmg = computeDamage(t.sourceAttack, totalDef(state), 'FIRE', playerElement(state));
      state.run.currentHp = Math.max(0, state.run.currentHp - dmg);
      markFloorDamageTaken(state);
      logLine(state, `The fire detonates — you take ${dmg} Fire damage!`);
      notifyFloatingText(t.x, t.y, `${dmg}`, 'damage');
    }
    if (t.hazard) {
      const turns = t.hazardTurns ?? DEFAULT_FIRE_HAZARD_TURNS;
      const existing = state.dungeon.expiringTiles.find((et) => et.x === t.x && et.y === t.y);
      if (existing) existing.turnsLeft = turns;
      else state.dungeon.expiringTiles.push({ x: t.x, y: t.y, turnsLeft: turns, tileType: TILE.FIRE_HAZARD });
    }
    return;
  }

  // 'chill_pulse'
  if (hitsPlayer) {
    const dmg = computeDamage(t.sourceAttack, totalDef(state), 'FROST', playerElement(state));
    state.run.currentHp = Math.max(0, state.run.currentHp - dmg);
    markFloorDamageTaken(state);
    logLine(state, `The frost pulse hits you for ${dmg}.`);
    notifyFloatingText(t.x, t.y, `${dmg}`, 'damage');
    if (Math.random() < 0.5) {
      applyPlayerStatus(state, 'CHILLED', 3);
      logLine(state, 'You are Chilled!');
    }
  }
}

/** Tick telegraph tiles. */
function tickTelegraphTiles(state: GameState): void {
  for (const t of state.dungeon.telegraphTiles) t.turnsUntil -= 1;
  const detonating = state.dungeon.telegraphTiles.filter((t) => t.turnsUntil <= 0);
  for (const t of detonating) detonateTelegraph(state, t);
  state.dungeon.telegraphTiles = state.dungeon.telegraphTiles.filter((t) => t.turnsUntil > 0);
}

function tickPlayerStatus(state: GameState): void {
  if (state.run.status === 'NONE') return;
  if (state.run.status === 'BURN') {
    state.run.currentHp = Math.max(0, state.run.currentHp - 2);
    markFloorDamageTaken(state);
    logLine(state, 'You take 2 Burn damage.');
  }
  state.run.statusTurns -= 1;
  if (state.run.statusTurns <= 0) state.run.status = 'NONE';
}

function tickEnemyStatuses(state: GameState): void {
  // Decrement enemy status durations.
  for (const enemy of state.dungeon.enemies) {
    if (enemy.status === 'NONE') continue;
    enemy.statusTurns -= 1;
    if (enemy.statusTurns <= 0) enemy.status = 'NONE';
  }
}

function runTickPhase(state: GameState, actionKind: PlayerActionKind): void {
  // Skip Tick Phase in Hub.
  if (state.run.currentFloor === HUB_FLOOR) return;

  const chilledBeforeTick = state.run.status === 'CHILLED';

  applyFireHazard(state);
  applyFrostHazard(state);
  tickPlayerStatus(state);
  tickTempBuffs(state);
  tickTrollBlood(state);
  // Handle Boss Rewind before statuses clear.
  tickBossRewind(state);
  tickEnemyStatuses(state);
  tickEnemyOverrides(state);
  tickExpiringTiles(state);
  tickTelegraphTiles(state);

  // Regenerate Stamina.
  if (actionKind !== 'skill') {
    state.run.currentStamina = Math.min(state.run.maxStamina, state.run.currentStamina + 1);
  }

  // Handle Quicksilver charges.
  if (state.run.quicksilverCharges > 0 && (actionKind === 'move' || actionKind === 'attack')) {
    state.run.quicksilverCharges -= 1;
    logLine(state, `Quicksilver — this action was free (${state.run.quicksilverCharges} left).`);
    return;
  }

  const penalty = actionKind === 'move' && chilledBeforeTick ? 2 : 1;
  state.run.turnsRemaining = Math.max(0, state.run.turnsRemaining - penalty);
}

/** Loss pending flag. */
let lossPending = false;
const CRT_WARP_MS = 600;

/** CRT Warp effect. */
function playCrtWarp(): void {
  document.querySelector('#game')?.classList.add('death-warp');
  document.querySelector('#hud-top')?.classList.add('death-fade');
  document.querySelector('#hud-bottom')?.classList.add('death-fade');
}

function clearCrtWarp(): void {
  document.querySelector('#game')?.classList.remove('death-warp');
  document.querySelector('#hud-top')?.classList.remove('death-fade');
  document.querySelector('#hud-bottom')?.classList.remove('death-fade');
}

/** Shattered Hourglass relic. */
function tryShatteredHourglass(state: GameState): boolean {
  if (state.run.turnsRemaining > 0 || state.run.currentHp <= 0) return false;
  if (!hasAccessoryPassive(state, 'safety_net_15')) return false;
  consumeAccessoryWithPassive(state, 'safety_net_15');
  state.run.turnsRemaining = 15;
  logLine(state, 'The Shattered Hourglass shatters completely — 15 Turns restored!');
  return true;
}

/** Phoenix Feather relic. */
function tryPhoenixFeather(state: GameState): boolean {
  if (state.run.currentHp > 0) return false;
  if (!state.run.relics.includes('phoenix_feather')) return false;
  state.run.relics = state.run.relics.filter((r) => r !== 'phoenix_feather');
  state.run.currentHp = Math.max(1, Math.round(state.run.maxHp * 0.5));
  logLine(state, 'Phoenix Feather ignites — revived at half HP! (consumed)');
  notifyFloatingText(state.run.playerX, state.run.playerY, 'REVIVED', 'immune');
  return true;
}

// Shatter Eternity: the Chrono-Lich's scripted kill during The Shattering (Loop 0 only).
const SHATTER_HP_THRESHOLD = 0.25;
const SHATTER_DAMAGE = 9999;

function playShatterEternityVisual(): void {
  const el = document.querySelector('#game');
  if (!el) return;
  el.classList.remove('screen-shake-long', 'shatter-flash');
  void (el as HTMLElement).offsetWidth; // restart the CSS animation
  el.classList.add('screen-shake-long', 'shatter-flash');
}

/** The Shattering's scripted loss — fires once, regardless of who "should" have won this exchange. */
function triggerShatterEternity(state: GameState): void {
  lossPending = true;
  state.run.currentHp = 0;
  notifyDeath(PLAYER_ID, 'PLAYER', state.run.playerX, state.run.playerY, state.run.facing);
  logLine(state, `Shatter Eternity! The Chrono-Lich unravels the timeline — ${SHATTER_DAMAGE} damage.`);
  notifyFloatingText(state.run.playerX, state.run.playerY, 'TIMELINE COLLAPSE', 'crit');
  playShatterEternityVisual();
  playDeathSfx();
  playCrtWarp();
  setTimeout(() => {
    state.ui.currentScreen = 'DEATH';
  }, CRT_WARP_MS);
}

function runCheckPhase(state: GameState): void {
  // Skip Check Phase in Hub.
  if (state.run.currentFloor === HUB_FLOOR) return;
  if (lossPending) return;

  if (isShatteringTutorial(state)) {
    const boss = state.dungeon.enemies.find((e) => e.kind === 'CHRONO_LICH');
    const bossShattered = boss !== undefined && boss.hp <= boss.maxHp * SHATTER_HP_THRESHOLD;
    if (bossShattered || state.run.currentHp <= 0) {
      triggerShatterEternity(state);
      return;
    }
  }

  if (state.run.turnsRemaining > 0 && state.run.currentHp > 0) return;
  if (tryShatteredHourglass(state)) return;
  if (tryPhoenixFeather(state)) return;
  lossPending = true;
  if (state.run.currentHp <= 0) {
    notifyDeath(PLAYER_ID, 'PLAYER', state.run.playerX, state.run.playerY, state.run.facing);
    logLine(state, 'You have fallen.');
  } else {
    logLine(state, 'Time has run out.');
  }
  playDeathSfx();
  playCrtWarp();
  setTimeout(() => {
    state.ui.currentScreen = 'DEATH';
  }, CRT_WARP_MS);
}

/** Continue after death. */
export function continueAfterDeath(state: GameState): void {
  const wasTutorial = isShatteringTutorial(state);
  lossPending = false;
  clearCrtWarp();
  state.persistent.loopCount += 1;

  if (wasTutorial) {
    // The Awakening: the vision's borrowed mastery was never really earned.
    state.persistent.skills = { dash: 1 };
    state.persistent.skillLoadout = ['dash'];
  } else {
    state.persistent.stats.deepestFloor = Math.max(state.persistent.stats.deepestFloor, state.run.currentFloor);
  }

  resetRunForNewLoop(state);
  enterHub(state);
  playLoopResetSfx();

  if (wasTutorial) {
    logLine(state, 'The Hourglass shatters. The time loop begins. You have forgotten your mastery, but you remember your duty.');
  }

  state.ui.currentScreen = 'GAME';
  saveGame(state);
  // Save snapshot immediately.
  saveRunSnapshot(state);
}

// Busy flag for hit-stop.
const HIT_STOP_MS = 100;
let busy = false;
export function isTurnBusy(): boolean {
  return busy;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Trigger screen shake. */
function triggerScreenShake(): void {
  const el = document.querySelector('#game');
  if (!el) return;
  el.classList.remove('screen-shake');
  void (el as HTMLElement).offsetWidth; // restart the CSS animation
  el.classList.add('screen-shake');
}

/** Resolve player turn. */
export async function resolvePlayerTurn(state: GameState, actionKind: PlayerActionKind): Promise<void> {
  busy = true;
  if (consumeHitStopFlag()) {
    triggerScreenShake();
    await delay(HIT_STOP_MS);
  }
  runEnemyPhase(state);
  runTickPhase(state, actionKind);
  // Cheat Mode: lock HP and Stamina to max.
  if (state.persistent.cheatModeEnabled) {
    state.run.currentHp = state.run.maxHp;
    state.run.currentStamina = state.run.maxStamina;
  }
  runCheckPhase(state);
  // Snapshot unconditionally.
  saveRunSnapshot(state);
  busy = false;
}
