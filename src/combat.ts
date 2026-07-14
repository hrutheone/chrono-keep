// Bumping combat, the Elemental Wheel, and status-effect application
// (GDD Sections 5 & 7). Turn-phase orchestration lives in turnController.ts;
// per-enemy movement/targeting lives in enemyAI.ts.

import { ENEMY_NAME, TIME_SHARD_DROP_CHANCE, createTimeShard, rollEnemyDrop, weaknessOf } from './content';
import { totalAtk, totalDef } from './inventory';
import { TILE } from './mapgen';
import { logLine } from './turns';
import type { Element, Enemy, GameState, StatusEffect } from './types';

const NORMAL_ENEMY_KINDS = new Set<Enemy['kind']>(['BONE_GRUNT', 'EMBER_BAT', 'VOLT_TURRET', 'FROST_WRAITH']);

/** 1.5x (rounded up) attacking down the wheel, 0.5x (rounded down) attacking up it, else 1x. Chrono is exempt either way. */
export function elementalMultiplier(attackerEl: Element, defenderEl: Element): number {
  if (attackerEl === 'CHRONO' || defenderEl === 'CHRONO') return 1;
  if (weaknessOf(defenderEl) === attackerEl) return 1.5;
  if (weaknessOf(attackerEl) === defenderEl) return 0.5;
  return 1;
}

export function computeDamage(atk: number, def: number, attackerEl: Element, defenderEl: Element): number {
  const raw = Math.max(1, atk - def);
  const mult = elementalMultiplier(attackerEl, defenderEl);
  const modified = mult > 1 ? Math.ceil(raw * mult) : mult < 1 ? Math.floor(raw * mult) : raw;
  return Math.max(1, modified);
}

/** The player has no fixed element; their equipped weapon's element (Physical if unarmed)
 * stands in for it on both offense and defense, per Section 5's "both directions" rule. */
function playerElement(state: GameState): Element {
  return state.run.equippedWeapon?.element ?? 'PHYSICAL';
}

export function applyEnemyStatus(enemy: Enemy, status: StatusEffect, turns: number): void {
  enemy.status = status;
  enemy.statusTurns = turns;
}

const STATUS_IMMUNITY: Partial<Record<StatusEffect, string>> = {
  BURN: 'burn_immune',
  CHILLED: 'chill_immune',
  STUN: 'stun_immune',
};

export function applyPlayerStatus(state: GameState, status: StatusEffect, turns: number): void {
  if (state.run.equippedAccessory?.passive === STATUS_IMMUNITY[status]) return;
  state.run.status = status;
  state.run.statusTurns = turns;
}

function randomWalkableTileAwayFrom(state: GameState, x: number, y: number, minDist: number): { x: number; y: number } | null {
  const { tiles, width, height } = state.dungeon;
  const candidates: { x: number; y: number }[] = [];
  for (let ty = 0; ty < height; ty++) {
    for (let tx = 0; tx < width; tx++) {
      if (tiles[ty][tx] !== TILE.FLOOR) continue;
      if (Math.abs(tx - x) + Math.abs(ty - y) < minDist) continue;
      if (state.dungeon.enemies.some((e) => e.x === tx && e.y === ty)) continue;
      if (tx === state.run.playerX && ty === state.run.playerY) continue;
      candidates.push({ x: tx, y: ty });
    }
  }
  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

export function killEnemy(state: GameState, enemy: Enemy): void {
  state.dungeon.enemies = state.dungeon.enemies.filter((e) => e.id !== enemy.id);

  const drop = rollEnemyDrop(Math.random, enemy.kind, `${enemy.id}-drop`);
  if (drop) state.dungeon.items.push({ item: drop, x: enemy.x, y: enemy.y });

  if (NORMAL_ENEMY_KINDS.has(enemy.kind) && Math.random() < TIME_SHARD_DROP_CHANCE) {
    state.dungeon.items.push({ item: createTimeShard(`${enemy.id}-shard`), x: enemy.x, y: enemy.y });
  }

  if (state.run.equippedWeapon?.passive === 'kill_refund_turn') {
    state.run.turnsRemaining += 1;
    logLine(state, 'The Chrono-Blade steals back a turn.');
  }

  logLine(state, `${ENEMY_NAME[enemy.kind]} defeated!`);
}

/** Player bump-attacks an enemy: weapon element/procs, elemental wheel, death & drops. */
export function playerAttackEnemy(state: GameState, enemy: Enemy): void {
  const weapon = state.run.equippedWeapon;
  const dmg = computeDamage(totalAtk(state), enemy.defense, playerElement(state), enemy.element);
  enemy.hp -= dmg;
  logLine(state, `You hit the ${ENEMY_NAME[enemy.kind]} for ${dmg}.`);

  if (weapon?.passive === 'burn_25' && Math.random() < 0.25) {
    applyEnemyStatus(enemy, 'BURN', 3);
    logLine(state, `${ENEMY_NAME[enemy.kind]} catches fire!`);
  }

  if (enemy.hp <= 0) {
    killEnemy(state, enemy);
    return;
  }

  if (enemy.kind === 'TIME_WEAVER') {
    const away = randomWalkableTileAwayFrom(state, enemy.x, enemy.y, 5);
    if (away) {
      enemy.x = away.x;
      enemy.y = away.y;
      logLine(state, `${ENEMY_NAME[enemy.kind]} slips backwards through the timeline.`);
    }
  }
}

/** Enemy bump-attacks the player: wheel modifier vs. the player's weapon element, status procs. */
export function enemyAttackPlayer(state: GameState, enemy: Enemy): void {
  const dmg = computeDamage(enemy.attack, totalDef(state), enemy.element, playerElement(state));
  state.run.currentHp = Math.max(0, state.run.currentHp - dmg);
  logLine(state, `${ENEMY_NAME[enemy.kind]} hits you for ${dmg}.`);

  if (enemy.kind === 'FROST_WRAITH' && Math.random() < 0.25) {
    applyPlayerStatus(state, 'CHILLED', 3);
    logLine(state, 'You are Chilled!');
  }
}
