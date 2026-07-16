// Bumping combat, the Elemental Wheel, and status-effect application
// (GDD Sections 5 & 7). Turn-phase orchestration lives in turnController.ts;
// per-enemy movement/targeting lives in enemyAI.ts.

import { ENEMY_NAME, TIME_SHARD_DROP_CHANCE, WEAPON_RANGE, createTimeShard, rollEnemyDrop, weaknessOf } from './content';
import { elementSynergyBonus, totalAtk, totalDef } from './inventory';
import { TILE, isWalkableAt } from './mapgen';
import { logLine } from './turns';
import { awardEchoes, markFloorDamageTaken } from './echoes';
import { triggerVictory } from './victory';
import { playAttackSfx, playEnemyHitPlayerSfx, playStatusApplySfx } from './audio';
import { PLAYER_ID, notifyAttack, notifyDeath, spawnDeathParticles } from './animation';
import { notifyFloatingText } from './floatingText';
import type { Element, Enemy, GameState, StatusEffect } from './types';

// Hit-Stop (Section 11 #1): set whenever a Weakness hit or a killing blow
// lands; turnController.ts's resolvePlayerTurn consumes it to freeze for
// 100ms + Screen Shake before running the Enemy Phase.
let hitStopPending = false;
export function consumeHitStopFlag(): boolean {
  const v = hitStopPending;
  hitStopPending = false;
  return v;
}
function markHitStop(): void {
  hitStopPending = true;
}

// Phase 14: the Deep-Biome Regulars are "Regular" tier per the GDD (not
// Elite), so they belong in this set too — otherwise killing them would
// silently award 0 Echoes and never drop Time Shards.
const NORMAL_ENEMY_KINDS = new Set<Enemy['kind']>([
  'BONE_GRUNT',
  'EMBER_BAT',
  'VOLT_TURRET',
  'FROST_WRAITH',
  'BONE_KNIGHT',
  'CINDER_SHAMAN',
  'VOLT_HOUND',
  'FROST_SENTINEL',
]);

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
export function playerElement(state: GameState): Element {
  return state.run.equippedWeapon?.element ?? 'PHYSICAL';
}

const ALL_ELEMENTS: Element[] = ['PHYSICAL', 'FIRE', 'VOLT', 'FROST', 'CHRONO'];
function randomElement(): Element {
  return ALL_ELEMENTS[Math.floor(Math.random() * ALL_ELEMENTS.length)];
}

/** Knockback (Glacial Mace, Paradox Staff): pushes the *defender* away from the
 * player, up to `tiles`, stopping at the first wall/enemy/player. */
function applyKnockback(state: GameState, enemy: Enemy, dx: number, dy: number, tiles: number): void {
  for (let i = 0; i < tiles; i++) {
    const nx = enemy.x + dx;
    const ny = enemy.y + dy;
    if (!isWalkableAt(state, nx, ny)) break;
    if (state.dungeon.enemies.some((e) => e !== enemy && e.x === nx && e.y === ny)) break;
    if (nx === state.run.playerX && ny === state.run.playerY) break;
    enemy.x = nx;
    enemy.y = ny;
  }
}

/** Pull (Tesla Gauntlets): yanks the defender past the player, to the tile on
 * the far side — repositioning them, since they're already adjacent. */
function applyPull(state: GameState, enemy: Enemy, dx: number, dy: number): void {
  const nx = state.run.playerX - dx;
  const ny = state.run.playerY - dy;
  if (!isWalkableAt(state, nx, ny)) return;
  if (state.dungeon.enemies.some((e) => e !== enemy && e.x === nx && e.y === ny)) return;
  enemy.x = nx;
  enemy.y = ny;
  logLine(state, `${ENEMY_NAME[enemy.kind]} is yanked past you!`);
}

/** Gambler's Dice doubles the Time Shard drop chance (Section 6C/6D). */
function timeShardChance(state: GameState): number {
  return state.run.equippedAccessory?.passive === 'gamblers_dice' ? TIME_SHARD_DROP_CHANCE * 2 : TIME_SHARD_DROP_CHANCE;
}

/** Frost Wand/Volt Spear (existing) and Ashwood Bow/Static Whip (Phase 8) all
 * grant an attack range beyond/instead-of adjacency. Scans (dx, dy) from the
 * player, stopping at the first wall; returns the first enemy found within
 * [min, max] range, or null (including when the equipped weapon has no
 * range profile, i.e. adjacent-only). */
export function findRangedTarget(state: GameState, dx: number, dy: number): Enemy | null {
  const profile = WEAPON_RANGE[state.run.equippedWeapon?.passive ?? ''];
  if (!profile || profile.max <= 1) return null;
  for (let dist = 1; dist <= profile.max; dist++) {
    const tx = state.run.playerX + dx * dist;
    const ty = state.run.playerY + dy * dist;
    if (!isWalkableAt(state, tx, ty)) break;
    if (dist < profile.min) continue;
    const enemy = state.dungeon.enemies.find((e) => e.x === tx && e.y === ty);
    if (enemy) return enemy;
  }
  return null;
}

/** True if the equipped weapon's minimum range excludes the given (adjacent) distance. */
export function weaponBlockedAtRange(state: GameState, distance: number): boolean {
  const profile = WEAPON_RANGE[state.run.equippedWeapon?.passive ?? ''];
  return profile !== undefined && distance < profile.min;
}

export function applyEnemyStatus(enemy: Enemy, status: StatusEffect, turns: number): void {
  enemy.status = status;
  enemy.statusTurns = turns;
  playStatusApplySfx(status);
}

const STATUS_IMMUNITY: Partial<Record<StatusEffect, string>> = {
  BURN: 'burn_immune',
  CHILLED: 'chill_immune',
  STUN: 'stun_immune',
};

export function applyPlayerStatus(state: GameState, status: StatusEffect, turns: number): void {
  if (state.run.equippedAccessory?.passive === STATUS_IMMUNITY[status]) {
    notifyFloatingText(state.run.playerX, state.run.playerY, 'IMMUNE', 'immune');
    return;
  }
  state.run.status = status;
  state.run.statusTurns = turns;
  playStatusApplySfx(status);
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

const ELITE_ENEMY_KINDS = new Set<Enemy['kind']>(['TIME_WEAVER']);

/** Killing blow source: Execution Stamina Refund (Section 7) only fires for `'skill'`. */
export function killEnemy(state: GameState, enemy: Enemy, source: 'bump' | 'skill' = 'bump'): void {
  markHitStop();
  state.dungeon.enemies = state.dungeon.enemies.filter((e) => e.id !== enemy.id);
  notifyDeath(enemy.id, enemy.kind, enemy.x, enemy.y);
  spawnDeathParticles(enemy.x, enemy.y);

  const drop = rollEnemyDrop(Math.random, enemy.kind, `${enemy.id}-drop`);
  if (drop) state.dungeon.items.push({ item: drop, x: enemy.x, y: enemy.y });

  if (NORMAL_ENEMY_KINDS.has(enemy.kind) && Math.random() < timeShardChance(state)) {
    state.dungeon.items.push({ item: createTimeShard(`${enemy.id}-shard`), x: enemy.x, y: enemy.y });
  }

  if (state.run.equippedWeapon?.passive === 'kill_refund_turn') {
    state.run.turnsRemaining += 1;
    logLine(state, 'The Chrono-Blade steals back a turn.');
  }

  if (NORMAL_ENEMY_KINDS.has(enemy.kind)) awardEchoes(state, 1, 'kill');
  else if (ELITE_ENEMY_KINDS.has(enemy.kind)) awardEchoes(state, 5, 'Elite kill');

  if (source === 'skill') {
    state.run.currentStamina = Math.min(state.run.maxStamina, state.run.currentStamina + 1);
    logLine(state, 'Execution refund: +1 Stamina.');
  }

  if (state.run.equippedAccessory?.passive === 'lifesteal_1') {
    state.run.currentHp = Math.min(state.run.maxHp, state.run.currentHp + 1);
    logLine(state, 'Vampire Tooth pulses — +1 HP.');
  }

  if (enemy.kind === 'CHRONO_LICH') {
    logLine(state, 'The Chrono-Lich unravels...');
    triggerVictory(state);
    return;
  }

  logLine(state, `${ENEMY_NAME[enemy.kind]} defeated!`);
}

/** Shared damage-instance resolver: computes/applies damage, plays SFX/floating
 * text/Hit-Stop, and kills on lethal. `source` decides whether a kill grants
 * the Execution Stamina Refund ('skill') or not ('bump', incl. weapon pierce). */
function applyDamageInstance(
  state: GameState,
  enemy: Enemy,
  rawAtk: number,
  element: Element,
  label: string,
  source: 'bump' | 'skill',
): boolean {
  const dmg = computeDamage(rawAtk, enemy.defense, element, enemy.element);
  const mult = elementalMultiplier(element, enemy.element);
  enemy.hp -= dmg;
  logLine(state, `${label} hits ${ENEMY_NAME[enemy.kind]} for ${dmg}.`);
  playAttackSfx(element, mult);
  if (mult > 1) markHitStop();
  notifyFloatingText(enemy.x, enemy.y, mult > 1 ? `${dmg} CRIT!` : `${dmg}`, mult > 1 ? 'crit' : 'damage');
  if (enemy.hp <= 0) {
    killEnemy(state, enemy, source);
    return true;
  }
  return false;
}

/** Skill damage to an enemy (Cleave/Flame Arc): the skill's own element, not the
 * equipped weapon's. Returns true if the hit killed the enemy. */
export function skillDamageEnemy(state: GameState, enemy: Enemy, rawAtk: number, element: Element, label: string): boolean {
  return applyDamageInstance(state, enemy, rawAtk, element, label, 'skill');
}

/** Player bump- or ranged-attacks an enemy: weapon element/procs, elemental
 * wheel, death & drops, plus Phase 8's synergy/pierce/knockback/pull/
 * self-damage/status-on-hit weapon passives. */
export function playerAttackEnemy(state: GameState, enemy: Enemy): void {
  const dx = Math.sign(enemy.x - state.run.playerX);
  const dy = Math.sign(enemy.y - state.run.playerY);
  notifyAttack(PLAYER_ID, dx, dy);

  const weapon = state.run.equippedWeapon;
  const element = playerElement(state);
  const mult = elementalMultiplier(element, enemy.element);
  const atk = totalAtk(state) + elementSynergyBonus(state, element);
  let dmg = computeDamage(atk, enemy.defense, element, enemy.element);

  if (weapon?.passive === 'stun_synergy_2x' && enemy.status === 'STUN') dmg *= 2;
  if (state.run.whetstoneCharge) {
    dmg *= 2;
    state.run.whetstoneCharge = false;
    logLine(state, 'Whetstone doubles the blow!');
  }

  enemy.hp -= dmg;
  logLine(state, `You hit the ${ENEMY_NAME[enemy.kind]} for ${dmg}.`);
  playAttackSfx(element, mult);
  if (mult > 1) markHitStop();
  notifyFloatingText(enemy.x, enemy.y, mult > 1 ? `${dmg} CRIT!` : `${dmg}`, mult > 1 ? 'crit' : 'damage');

  if (weapon?.passive === 'burn_25' && Math.random() < 0.25) {
    applyEnemyStatus(enemy, 'BURN', 3);
    logLine(state, `${ENEMY_NAME[enemy.kind]} catches fire!`);
  }
  if (weapon?.passive === 'chill_50_free_swap' && Math.random() < 0.5) {
    applyEnemyStatus(enemy, 'CHILLED', 3);
    logLine(state, `${ENEMY_NAME[enemy.kind]} is Chilled!`);
  }
  if (weapon?.passive === 'heavy_stamina') {
    state.run.currentStamina = Math.max(0, state.run.currentStamina - 1);
  }
  if (weapon?.passive === 'blood_magic') {
    state.run.currentHp = Math.max(0, state.run.currentHp - 1);
    markFloorDamageTaken(state);
    logLine(state, 'The Obsidian Greatsword drinks your blood.');
  }
  if (weapon?.passive === 'cure_chill_on_attack' && state.run.status === 'CHILLED') {
    state.run.status = 'NONE';
    state.run.statusTurns = 0;
    logLine(state, 'The Torch burns away the Chill.');
  }

  // Pierce (Volt Spear): also damages whatever's directly behind the target,
  // as its own damage instance (never grants an Execution Refund).
  if (weapon?.passive === 'pierce_1') {
    const behind = state.dungeon.enemies.find((e) => e.x === enemy.x + dx && e.y === enemy.y + dy);
    if (behind) applyDamageInstance(state, behind, atk, element, 'The pierce', 'bump');
  }

  if (enemy.hp <= 0) {
    killEnemy(state, enemy, 'bump');
    return;
  }

  // Knockback / Pull (Section 6A/8): repositions the defender, not the attacker.
  if (weapon?.passive === 'knockback_1') {
    applyKnockback(state, enemy, dx, dy, 1);
  } else if (weapon?.passive === 'knockback_2_randomize_element') {
    applyKnockback(state, enemy, dx, dy, 2);
    enemy.element = randomElement();
    enemy.weakness = weaknessOf(enemy.element);
    logLine(state, `${ENEMY_NAME[enemy.kind]}'s element shifts unpredictably!`);
  } else if (weapon?.passive === 'pull_1') {
    applyPull(state, enemy, dx, dy);
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

/** Enemy bump-attacks the player: wheel modifier vs. the player's weapon element, status procs.
 * Ice Aegis (Section 6B) blocks the hit entirely while it has charges. */
export function enemyAttackPlayer(state: GameState, enemy: Enemy): void {
  notifyAttack(enemy.id, Math.sign(state.run.playerX - enemy.x), Math.sign(state.run.playerY - enemy.y));

  if (state.run.iceAegisCharges > 0) {
    state.run.iceAegisCharges -= 1;
    logLine(state, `Ice Aegis blocks ${ENEMY_NAME[enemy.kind]}'s attack!`);
    playStatusApplySfx('CHILLED');
    if (state.run.iceAegisChillsAttacker) applyEnemyStatus(enemy, 'CHILLED', 3);
    return;
  }

  const dmg = computeDamage(enemy.attack, totalDef(state), enemy.element, playerElement(state));
  state.run.currentHp = Math.max(0, state.run.currentHp - dmg);
  markFloorDamageTaken(state);
  logLine(state, `${ENEMY_NAME[enemy.kind]} hits you for ${dmg}.`);
  playEnemyHitPlayerSfx();
  notifyFloatingText(state.run.playerX, state.run.playerY, `${dmg}`, 'damage');

  if (enemy.kind === 'FROST_WRAITH' && Math.random() < 0.25) {
    applyPlayerStatus(state, 'CHILLED', 3);
    logLine(state, 'You are Chilled!');
  }

  // Volt-Hound (Section 6C, Phase 14): 25% Stun chance on hit.
  if (enemy.kind === 'VOLT_HOUND' && Math.random() < 0.25) {
    applyPlayerStatus(state, 'STUN', 1);
    logLine(state, 'You are Stunned!');
  }

  if (state.run.equippedAccessory?.passive === 'retaliation_2') {
    const retaliateDmg = computeDamage(2, enemy.defense, 'PHYSICAL', enemy.element);
    enemy.hp -= retaliateDmg;
    logLine(state, `Spiked Pauldrons retaliate for ${retaliateDmg}.`);
    notifyFloatingText(enemy.x, enemy.y, `${retaliateDmg}`, 'damage');
    if (enemy.hp <= 0) killEnemy(state, enemy, 'bump');
  }
}
