// The Player Move Phase already happened by the time resolvePlayerTurn is
// called (movement.ts/combat.ts applied it) — this runs Enemy Phase -> Tick
// Phase -> Check Phase for every turn-costing action. Inventory actions
// follow their own context-sensitive rule and never go through here.

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
import { totalDef } from './inventory';
import type { GameState } from './types';

export type PlayerActionKind = 'move' | 'attack' | 'wait' | 'skill' | 'item';

function isHazardAt(state: GameState, x: number, y: number): boolean {
  return effectiveTileAt(state, x, y) === TILE.FIRE_HAZARD;
}

function applyFireHazard(state: GameState): void {
  if (isHazardAt(state, state.run.playerX, state.run.playerY)) {
    if (state.run.equippedAccessory?.passive !== 'burn_immune') applyPlayerStatus(state, 'BURN', 3);
  }

  for (const enemy of state.dungeon.enemies) {
    if (isHazardAt(state, enemy.x, enemy.y)) {
      enemy.status = 'BURN';
      enemy.statusTurns = 3;
    }
  }
}

// Frost Hazard deals flat DEF-piercing chip damage each Tick Phase instead of
// a status effect, so it stays lethal against Chilled/Stun-immune builds.
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
  // Iterate a snapshot — killEnemy reassigns state.dungeon.enemies to a
  // filtered copy, which would otherwise invalidate a live for..of over it.
  for (const enemy of [...state.dungeon.enemies]) {
    if (!isFrostHazardAt(state, enemy.x, enemy.y)) continue;
    enemy.hp -= FROST_HAZARD_DAMAGE;
    notifyFloatingText(enemy.x, enemy.y, `${FROST_HAZARD_DAMAGE}`, 'damage');
    if (enemy.hp <= 0) killEnemy(state, enemy, 'bump');
  }
}

/** Temporary ATK/DEF buffs and Aura's status immunity window, counted down
 * once per Tick Phase and cleared at 0. */
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

/** Restores the enemy's original DEF/Speed once Defuse/Slow's timer runs out. */
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

// The Fire Hazard left on an AOE's center tile burns for `t.hazardTurns`
// turns if set, or this default otherwise.
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

/** Decrements each telegraphed AOE tile's warning, then detonates whichever
 * hit 0 per their `payload`. */
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
  // Enemy Burn damage already applied at Enemy Phase start; here we only count duration down.
  for (const enemy of state.dungeon.enemies) {
    if (enemy.status === 'NONE') continue;
    enemy.statusTurns -= 1;
    if (enemy.statusTurns <= 0) enemy.status = 'NONE';
  }
}

function runTickPhase(state: GameState, actionKind: PlayerActionKind): void {
  // The Hub's turn counter is frozen — no hazards, statuses, or expiring
  // tiles exist there either, so skipping the whole phase is equivalent.
  if (state.run.currentFloor === HUB_FLOOR) return;

  const chilledBeforeTick = state.run.status === 'CHILLED';

  applyFireHazard(state);
  applyFrostHazard(state);
  tickPlayerStatus(state);
  tickTempBuffs(state);
  tickTrollBlood(state);
  // Before tickEnemyStatuses: a Rewind resolving this turn must see whether
  // the boss WAS Stunned during the Enemy Phase that just ran, not a status
  // tickEnemyStatuses is about to clear in this same Tick Phase.
  tickBossRewind(state);
  tickEnemyStatuses(state);
  tickEnemyOverrides(state);
  tickExpiringTiles(state);
  tickTelegraphTiles(state);

  // +1 Stamina at the end of any turn that didn't spend any — only skills
  // spend Stamina today, so a skill turn skips regen.
  if (actionKind !== 'skill') {
    state.run.currentStamina = Math.min(state.run.maxStamina, state.run.currentStamina + 1);
  }

  // Quicksilver Flask covers Moves/Attacks only, not skills or the
  // Consumable use that granted the charges.
  if (state.run.quicksilverCharges > 0 && (actionKind === 'move' || actionKind === 'attack')) {
    state.run.quicksilverCharges -= 1;
    logLine(state, `Quicksilver — this action was free (${state.run.quicksilverCharges} left).`);
    return;
  }

  const penalty = actionKind === 'move' && chilledBeforeTick ? 2 : 1;
  state.run.turnsRemaining = Math.max(0, state.run.turnsRemaining - penalty);
}

/** True once the DEATH screen has been shown for this loss, so a stray extra
 * turn (shouldn't happen once GAME input is gated by currentScreen, but this
 * is the safety net) can't re-trigger it. */
let lossPending = false;
const CRT_WARP_MS = 600;

/** CSS-only warp effect on the #game canvas and HUD bars, kicked off the
 * instant a loss triggers. */
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

/** Shattered Hourglass: turns hitting 0 restores 15 and destroys the item
 * instead of triggering the loop reset. Doesn't apply to dying from HP loss,
 * only the turn-timeout case. */
function tryShatteredHourglass(state: GameState): boolean {
  if (state.run.turnsRemaining > 0 || state.run.currentHp <= 0) return false;
  if (state.run.equippedAccessory?.passive !== 'safety_net_15') return false;
  state.run.equippedAccessory = null;
  state.run.turnsRemaining = 15;
  logLine(state, 'The Shattered Hourglass shatters completely — 15 Turns restored!');
  return true;
}

/** Phoenix Feather: revives at 50% HP on fatal damage, then is destroyed.
 * HP-death-only — doesn't apply to the turn-timeout case. */
function tryPhoenixFeather(state: GameState): boolean {
  if (state.run.currentHp > 0) return false;
  if (!state.run.relics.includes('phoenix_feather')) return false;
  state.run.relics = state.run.relics.filter((r) => r !== 'phoenix_feather');
  state.run.currentHp = Math.max(1, Math.round(state.run.maxHp * 0.5));
  logLine(state, 'Phoenix Feather ignites — revived at half HP! (consumed)');
  notifyFloatingText(state.run.playerX, state.run.playerY, 'REVIVED', 'immune');
  return true;
}

function runCheckPhase(state: GameState): void {
  // No loss condition can fire at the Hub: no enemies to deal damage, and the
  // timer never decrements there (runTickPhase above). Guarded explicitly
  // too, in case turnsRemaining is ever stale when the player warps in.
  if (state.run.currentFloor === HUB_FLOOR) return;
  if (lossPending || (state.run.turnsRemaining > 0 && state.run.currentHp > 0)) return;
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

/** Keeps unlockedAnchors/upgrades/skills/Echoes (all in `persistent`), drops
 * the run's inventory/equipment, then returns to the Hub. Called from the
 * DEATH screen's Continue action. */
export function continueAfterDeath(state: GameState): void {
  lossPending = false;
  clearCrtWarp();
  state.persistent.loopCount += 1;
  state.persistent.stats.deepestFloor = Math.max(state.persistent.stats.deepestFloor, state.run.currentFloor);

  resetRunForNewLoop(state);

  enterHub(state);
  playLoopResetSfx();

  state.ui.currentScreen = 'GAME';
  saveGame(state);
  // Write the fresh Hub run immediately so a reload before the next move
  // resumes straight into the Hub instead of falling through to TITLE.
  saveRunSnapshot(state);
}

// `busy` is checked by movement.ts/skills.ts's keydown handlers so a key
// mashed during the hit-stop freeze is ignored, not queued mid-turn.
const HIT_STOP_MS = 100;
let busy = false;
export function isTurnBusy(): boolean {
  return busy;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Pure CSS, on #game only — never the HUD, so numbers stay readable. */
function triggerScreenShake(): void {
  const el = document.querySelector('#game');
  if (!el) return;
  el.classList.remove('screen-shake');
  void (el as HTMLElement).offsetWidth; // restart the CSS animation
  el.classList.add('screen-shake');
}

/** Call once per turn-costing player action, after the Player Move Phase has already applied. */
export async function resolvePlayerTurn(state: GameState, actionKind: PlayerActionKind): Promise<void> {
  busy = true;
  if (consumeHitStopFlag()) {
    triggerScreenShake();
    await delay(HIT_STOP_MS);
  }
  runEnemyPhase(state);
  runTickPhase(state, actionKind);
  // Heal to full after Enemy/Tick Phase so Cheat Mode covers every HP-loss
  // source (bump attacks, hazard ticks, telegraph AOE) in one place.
  if (state.persistent.cheatModeEnabled) state.run.currentHp = state.run.maxHp;
  runCheckPhase(state);
  // Snapshot unconditionally (Hub, death, timeout all included) — the read
  // side's validation decides whether a given snapshot is resumable.
  saveRunSnapshot(state);
  busy = false;
}
