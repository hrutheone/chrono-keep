// Turn Controller (GDD Section 7): Player Move Phase already happened by the
// time resolvePlayerTurn is called (movement.ts/combat.ts applied it) — this
// runs Enemy Phase -> Tick Phase -> Check Phase for every turn-costing action.
// Inventory actions follow Phase 3's separate context-sensitive rule and
// never go through here.

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

// Phase 18 (Scourge skill): Frost Hazard, the direct-damage counterpart to
// Fire Hazard's Burn-status one — deals flat DEF-piercing chip damage each
// Tick Phase instead of applying a status effect, so it stays lethal even
// against Chilled/Stun-immune builds.
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

/** Phase 18 (Chakra Lv3/Provoke): temporary ATK/DEF buffs and Aura's status
 * immunity window, all counted down once per Tick Phase and cleared at 0 —
 * the same shape as tickPlayerStatus's statusTurns countdown. */
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

/** Phase 18 (Defuse/Slow skills): restores the enemy's original DEF/Speed
 * once the temporary override's timer runs out. */
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

/** Troll Blood (Phase 19 Relic): auto-restores 1 HP every 10 real dungeon
 * turns (Hub excluded, same as every other Tick-Phase-gated counter here). */
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

// Cinder-Shaman's firebomb (Section 6C, Phase 14) and Inferno-Golem's Magma
// Slam (Phase 15): the Fire Hazard left on the AOE's center tile burns for
// `t.hazardTurns` turns if set (Magma Slam: 3), or this default (Cinder-
// Shaman: 2, same duration Flame Arc Lvl 3 uses in skills.ts) if not.
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

/** Telegraphed AOE tiles (Phase 6 Chrono-Lich Time-Blast; Phase 14
 * Cinder-Shaman's firebomb / Frost-Sentinel's cross pulse): decrements each
 * tile's warning, then detonates whichever hit 0 per their `payload`. */
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
  // The Hub's turn counter is frozen (GDD Section 7) — no hazards, statuses,
  // or expiring tiles exist there either, so skipping the whole phase is
  // equivalent to (and simpler than) ticking everything and zeroing the
  // final decrement.
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

  // Section 7: "+1 Stamina at the end of any turn in which no Stamina was
  // spent." Only skills spend Stamina today, so a skill turn skips regen.
  if (actionKind !== 'skill') {
    state.run.currentStamina = Math.min(state.run.maxStamina, state.run.currentStamina + 1);
  }

  // Quicksilver Flask (Section 6E): "your next 3 Moves or Attacks" only —
  // not skills, and not the Tactical Consumable use that grants the charges
  // (which always costs its own 1 turn per Section 6E/7, unless Alchemist's
  // Belt makes it free through a separate path).
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

/** CRT Time-Warp (Section 11): CSS-only, on the #game canvas element and the
 * HUD bars, kicked off the instant a loss triggers. */
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

/** Check Phase (Section 7): plays the CRT Time-Warp, then shows the DEATH
 * screen once it finishes, preserving the just-ended run's stats (floor,
 * turns) for display. The actual Full Loop Reset happens in
 * continueAfterDeath(), once the player dismisses it. */
/** Shattered Hourglass (Section 6D, Phase 8): a Check-Phase interception —
 * turns hitting 0 restores 15 and destroys the item instead of triggering
 * the loop reset. Checked before the loss-reset path; doesn't apply to
 * dying from HP loss, only the turn-timeout case. */
function tryShatteredHourglass(state: GameState): boolean {
  if (state.run.turnsRemaining > 0 || state.run.currentHp <= 0) return false;
  if (state.run.equippedAccessory?.passive !== 'safety_net_15') return false;
  state.run.equippedAccessory = null;
  state.run.turnsRemaining = 15;
  logLine(state, 'The Shattered Hourglass shatters completely — 15 Turns restored!');
  return true;
}

/** Phoenix Feather (Phase 19 Relic): "on fatal damage, revive at 50% HP,
 * then the relic is destroyed" — an HP-death-only save (not the turn-
 * timeout case, which isn't "fatal damage"), one-time-per-run (removed from
 * `run.relics` the instant it fires, so a re-pickup elsewhere in the run
 * would be needed to save a second time). */
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

/** Full Loop Reset (GDD Section 7, Phase 11/13): bank Echoes (already banked
 * live as earned), keep unlockedAnchors/upgrades/skills (all in
 * `persistent`), drop the run's inventory/equipment, then return to the Hub
 * — the Upgrade Shop terminal and Shortcut Gate live there now, not behind
 * an automatic screen transition. Called from the DEATH screen's Continue
 * action. */
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
  // Phase 20: write the fresh Hub run immediately — the on-disk snapshot from
  // right before death fails loadRunSnapshot's currentHp>0 check anyway, but
  // saving here means a reload before the next move resumes straight back
  // into the Hub instead of falling through to TITLE for an extra click.
  saveRunSnapshot(state);
}

// Hit-Stop & Screen Shake (Section 11 #1): the engine's first genuinely async
// turn-resolution step. `busy` is checked by movement.ts/skills.ts's keydown
// handlers so a key mashed during the freeze is cleanly ignored, not queued
// or dropped mid-turn (which could otherwise overlap two Enemy Phases).
const HIT_STOP_MS = 100;
let busy = false;
export function isTurnBusy(): boolean {
  return busy;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Screen Shake: pure CSS on #game only (never the HUD, so numbers stay readable). */
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
  // Cheat Mode (Inventory toggle, testing/QA only): heal to full before the
  // Check Phase can evaluate a loss — after Enemy/Tick Phase so it covers
  // every HP-loss source in one place (bump attacks, Burn/Frost Hazard
  // ticks, telegraph AOE damage) rather than hooking each individually.
  if (state.persistent.cheatModeEnabled) state.run.currentHp = state.run.maxHp;
  runCheckPhase(state);
  // Phase 20 (mobile background/reload survival): snapshot the live run after
  // every turn so a discarded/reloaded tab can resume mid-floor instead of
  // dropping back to TITLE. Saved unconditionally (Hub included, death/
  // timeout included) — loadRunSnapshot's validation on the read side is what
  // decides whether a given snapshot is actually resumable.
  saveRunSnapshot(state);
  busy = false;
}
