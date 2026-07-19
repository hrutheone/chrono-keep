// Combat, elemental mechanics, and statuses.

import {
  ENEMY_NAME,
  TIME_SHARD_DROP_CHANCE,
  WEAPON_RANGE,
  createAnchorItem,
  createRelicItemByEffect,
  createTimeShard,
  createWeapon,
  pickRandomUnheldRelic,
  rollEliteDrop,
  rollEnemyDrop,
  weaknessOf,
} from './content';
import type { WeaponKey } from './content';
import { elementSynergyBonus, hasAccessoryPassive, totalAtk, totalDef } from './inventory';
import { TILE, isWalkableAt } from './mapgen';
import { openBossGate } from './arenas';
import { logLine } from './turns';
import { awardEchoes, markFloorDamageTaken } from './echoes';
import { triggerVictory } from './victory';
import { playAttackSfx, playEnemyHitPlayerSfx, playStatusApplySfx } from './audio';
import { PLAYER_ID, notifyAttack, notifyDeath, spawnDeathParticles } from './animation';
import { notifyFloatingText } from './floatingText';
import type { Element, Enemy, GameState, StatusEffect } from './types';

// Flag for hit-stop effect on weak hits or kills.
let hitStopPending = false;
export function consumeHitStopFlag(): boolean {
  const v = hitStopPending;
  hitStopPending = false;
  return v;
}
function markHitStop(): void {
  hitStopPending = true;
}

// Regular enemies that award Echoes and drop Time Shards.
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

/** Elemental damage multiplier. */
export function elementalMultiplier(attackerEl: Element, defenderEl: Element): number {
  if (attackerEl === 'CHRONO' || defenderEl === 'CHRONO') return 1;
  if (weaknessOf(defenderEl) === attackerEl) return 2.0;
  if (weaknessOf(attackerEl) === defenderEl) return 0.5;
  return 1;
}

export function computeDamage(atk: number, def: number, attackerEl: Element, defenderEl: Element): number {
  const raw = Math.max(1, atk - def);
  const mult = elementalMultiplier(attackerEl, defenderEl);
  const modified = mult > 1 ? Math.ceil(raw * mult) : mult < 1 ? Math.floor(raw * mult) : raw;
  return Math.max(1, modified);
}

/** Returns the player's current element. */
export function playerElement(state: GameState): Element {
  return state.run.equippedWeapon?.element ?? 'PHYSICAL';
}

const ALL_ELEMENTS: Element[] = ['PHYSICAL', 'FIRE', 'VOLT', 'FROST', 'CHRONO'];
function randomElement(): Element {
  return ALL_ELEMENTS[Math.floor(Math.random() * ALL_ELEMENTS.length)];
}

/** Pushes the defender away from the player. */
export function applyKnockback(state: GameState, enemy: Enemy, dx: number, dy: number, tiles: number): void {
  // [Armored] affix: immune to Knockback.
  if (enemy.affix === 'armored') return;
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

/** Pulls the defender past the player. */
function applyPull(state: GameState, enemy: Enemy, dx: number, dy: number): void {
  // [Armored] affix covers Pull too.
  if (enemy.affix === 'armored') return;
  const nx = state.run.playerX - dx;
  const ny = state.run.playerY - dy;
  if (!isWalkableAt(state, nx, ny)) return;
  if (state.dungeon.enemies.some((e) => e !== enemy && e.x === nx && e.y === ny)) return;
  enemy.x = nx;
  enemy.y = ny;
  logLine(state, `${ENEMY_NAME[enemy.kind]} is yanked past you!`);
}

/** Calculates Time Shard drop chance. */
function timeShardChance(state: GameState): number {
  return hasAccessoryPassive(state, 'gamblers_dice') ? TIME_SHARD_DROP_CHANCE * 2 : TIME_SHARD_DROP_CHANCE;
}

// --- Weapon passive parameter maps ---
// Stamina drain amounts.
const STAMINA_LEECH_CHANCE: Partial<Record<string, number>> = { stamina_leech_10: 0.1 };
const SELF_DAMAGE_PER_HIT: Partial<Record<string, number>> = { blood_magic_2: 2 };
const LIFESTEAL_ON_HIT: Partial<Record<string, number>> = { lifesteal_2_on_hit: 2, pierce_ranged_2_lifesteal_3: 3 };
const BONUS_VS_STATUS: Partial<Record<string, { status: StatusEffect; mult: number }>> = {
  bonus_vs_chilled_2x: { status: 'CHILLED', mult: 2 },
  bonus_vs_burning_2x: { status: 'BURN', mult: 2 },
};
const STUN_VS_CHILLED_CHANCE: Partial<Record<string, number>> = { stun_50_vs_chilled: 0.5 };
const EXECUTE_HP_THRESHOLD: Partial<Record<string, number>> = { execute_20_heavy: 0.2 };
const EXECUTE_CHANCE: Partial<Record<string, number>> = { execute_chance_5: 0.05 };
const IGNORE_DEF_PCT: Partial<Record<string, number>> = { ignore_def_50: 0.5 };
// Passive groupings.
const PIERCE_PASSIVES = new Set(['pierce_ranged_2', 'pierce_ranged_3_fire_hazard', 'pierce_ranged_2_dash', 'pierce_ranged_2_lifesteal_3']);
const KNOCKBACK_1_PASSIVES = new Set(['knockback_1', 'ranged_push_3']);
const HEAVY_STAMINA_PASSIVES = new Set(['heavy_stamina', 'execute_20_heavy']);
const KILL_TURN_REFUND: Partial<Record<string, number>> = { kill_refund_turn: 1, kill_refund_turns_3: 3 };
// Bosses exempt from execute passives.
const BOSS_KINDS = new Set<Enemy['kind']>(['INFERNO_GOLEM', 'STORM_CALLER', 'GLACIAL_KNIGHT', 'CHRONO_LICH']);

// --- Relic/Elite Affix combat hooks ---
const EXECUTIONERS_COIN_THRESHOLD = 0.3;
const EXECUTIONERS_COIN_MULT = 1.5;
const DUELISTS_GLOVE_RADIUS = 5;
const DUELISTS_GLOVE_MULT = 1.5;
const BLINKING_DODGE_CHANCE = 0.3;

/** Kotetsu combo tracker. */
let comboEnemyId: string | null = null;
let comboCount = 0;
function comboBonusDamage(enemy: Enemy): number {
  comboCount = comboEnemyId === enemy.id ? comboCount + 1 : 1;
  comboEnemyId = enemy.id;
  return comboCount - 1;
}

/** Finds the first enemy in ranged attack path. */
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

/** Checks if weapon minimum range blocks attack. */
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

/** Applies a status effect to the player. */
export function applyPlayerStatus(state: GameState, status: StatusEffect, turns: number, attacker?: Enemy): void {
  const immunityPassive = STATUS_IMMUNITY[status];
  if (immunityPassive && hasAccessoryPassive(state, immunityPassive)) {
    notifyFloatingText(state.run.playerX, state.run.playerY, 'IMMUNE', 'immune');
    return;
  }
  // Aura blanket immunity.
  if (state.run.statusImmuneTurns > 0) {
    notifyFloatingText(state.run.playerX, state.run.playerY, 'IMMUNE', 'immune');
    return;
  }
  // Mirror Shield reflection.
  if (state.run.braced && attacker && state.run.relics.includes('mirror_shield')) {
    applyEnemyStatus(attacker, status, turns);
    logLine(state, `Mirror Shield reflects it back onto ${ENEMY_NAME[attacker.kind]}!`);
    return;
  }
  state.run.status = status;
  state.run.statusTurns = turns;
  playStatusApplySfx(status);

  // Glass Sword breaking on stun.
  if (status === 'STUN' && state.run.equippedWeapon?.passive === 'glass_cannon') {
    logLine(state, `${state.run.equippedWeapon.name} shatters!`);
    state.run.equippedWeapon = null;
  }
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

/** Enemy blink dodge check. */
function tryBlinkDodge(state: GameState, enemy: Enemy): boolean {
  if (enemy.affix !== 'blinking' || Math.random() >= BLINKING_DODGE_CHANCE) return false;
  const open = ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const)
    .map(([dx, dy]) => ({ x: enemy.x + dx, y: enemy.y + dy }))
    .filter(
      (p) =>
        isWalkableAt(state, p.x, p.y) &&
        !(p.x === state.run.playerX && p.y === state.run.playerY) &&
        !state.dungeon.enemies.some((e) => e !== enemy && e.x === p.x && e.y === p.y),
    );
  if (open.length === 0) return false;
  const dest = open[Math.floor(Math.random() * open.length)];
  enemy.x = dest.x;
  enemy.y = dest.y;
  logLine(state, `${ENEMY_NAME[enemy.kind]} blinks out of the way!`);
  notifyFloatingText(dest.x, dest.y, 'DODGE', 'immune');
  return true;
}

/** Enemy shield block check. */
function tryShieldBlock(state: GameState, enemy: Enemy): boolean {
  if (!enemy.shieldedHitsLeft) return false;
  enemy.shieldedHitsLeft -= 1;
  logLine(state, `${ENEMY_NAME[enemy.kind]}'s shield absorbs the hit!`);
  notifyFloatingText(enemy.x, enemy.y, 'BLOCKED', 'immune');
  return true;
}

/** Checks if duel conditions are met. */
function isDuelingAlone(state: GameState, defender: Enemy): boolean {
  return !state.dungeon.enemies.some(
    (e) => e !== defender && e.awake && Math.abs(e.x - defender.x) + Math.abs(e.y - defender.y) <= DUELISTS_GLOVE_RADIUS,
  );
}

const ELITE_ENEMY_KINDS = new Set<Enemy['kind']>(['TIME_WEAVER']);

// Mini-Boss definitions.
const MINI_BOSS_KINDS = new Set<Enemy['kind']>(['INFERNO_GOLEM', 'STORM_CALLER', 'GLACIAL_KNIGHT']);
const MINI_BOSS_WEAPON: Partial<Record<Enemy['kind'], WeaponKey>> = {
  INFERNO_GOLEM: 'IFRITS_BLADE',
  STORM_CALLER: 'BLITZ_WHIP',
  GLACIAL_KNIGHT: 'ICE_BRAND',
};

/** Handles enemy death and drops. */
export function killEnemy(state: GameState, enemy: Enemy, source: 'bump' | 'skill' = 'bump'): void {
  markHitStop();
  state.dungeon.enemies = state.dungeon.enemies.filter((e) => e.id !== enemy.id);
  notifyDeath(enemy.id, enemy.kind, enemy.x, enemy.y);
  spawnDeathParticles(enemy.x, enemy.y);

  // Handle elite or normal drops.
  if (enemy.affix === 'wealthy') {
    awardEchoes(state, 50, 'Wealthy Elite kill');
    const relic = pickRandomUnheldRelic(state.run.relics);
    if (relic) {
      state.dungeon.items.push({ item: createRelicItemByEffect(relic, `${enemy.id}-relic`), x: enemy.x, y: enemy.y });
    } else {
      awardEchoes(state, 25, 'Wealthy Elite kill (all Relics held)');
    }
  } else {
    const drop = enemy.affix
      ? rollEliteDrop(`${enemy.id}-drop`, state.run.relics)
      : rollEnemyDrop(Math.random, enemy.kind, `${enemy.id}-drop`);
    if (drop) state.dungeon.items.push({ item: drop, x: enemy.x, y: enemy.y });
  }

  if (NORMAL_ENEMY_KINDS.has(enemy.kind) && Math.random() < timeShardChance(state)) {
    state.dungeon.items.push({ item: createTimeShard(`${enemy.id}-shard`), x: enemy.x, y: enemy.y });
  }

  // Gunpowder Flask explosion.
  if (enemy.status === 'BURN' && state.run.relics.includes('gunpowder_flask')) {
    const blastAtk = totalAtk(state);
    for (const other of state.dungeon.enemies) {
      if (Math.abs(other.x - enemy.x) <= 1 && Math.abs(other.y - enemy.y) <= 1) {
        other.hp -= blastAtk;
        notifyFloatingText(other.x, other.y, `${blastAtk}`, 'damage');
        if (other.hp <= 0) killEnemy(state, other, 'bump');
      }
    }
    logLine(state, 'Gunpowder Flask detonates the corpse!');
  }

  // Volatile death explosion.
  if (enemy.affix === 'volatile' && Math.abs(state.run.playerX - enemy.x) <= 1 && Math.abs(state.run.playerY - enemy.y) <= 1) {
    const blastDmg = computeDamage(enemy.attack, totalDef(state), enemy.element, playerElement(state));
    state.run.currentHp = Math.max(0, state.run.currentHp - blastDmg);
    markFloorDamageTaken(state);
    logLine(state, `${ENEMY_NAME[enemy.kind]} explodes for ${blastDmg}!`);
    notifyFloatingText(state.run.playerX, state.run.playerY, `${blastDmg}`, 'damage');
    applyPlayerStatus(state, 'STUN', 1, enemy);
  }

  const turnRefund = KILL_TURN_REFUND[state.run.equippedWeapon?.passive ?? ''];
  if (turnRefund) {
    state.run.turnsRemaining += turnRefund;
    logLine(state, `${state.run.equippedWeapon!.name} steals back ${turnRefund} Turn${turnRefund > 1 ? 's' : ''}.`);
  }

  if (comboEnemyId === enemy.id) comboEnemyId = null;

  if (NORMAL_ENEMY_KINDS.has(enemy.kind)) awardEchoes(state, 1, 'kill');
  else if (ELITE_ENEMY_KINDS.has(enemy.kind)) awardEchoes(state, 5, 'Elite kill');

  if (source === 'skill') {
    state.run.currentStamina = Math.min(state.run.maxStamina, state.run.currentStamina + 1);
    logLine(state, 'Execution refund: +1 Stamina.');
  }

  if (hasAccessoryPassive(state, 'lifesteal_1')) {
    state.run.currentHp = Math.min(state.run.maxHp, state.run.currentHp + 1);
    logLine(state, 'Vampire Tooth pulses — +1 HP.');
  }

  // Vampire's Cape heal.
  if (source === 'bump' && state.run.relics.includes('vampires_cape')) {
    state.run.currentHp = Math.min(state.run.maxHp, state.run.currentHp + 1);
    logLine(state, "Vampire's Cape pulses — +1 HP.");
  }

  if (MINI_BOSS_KINDS.has(enemy.kind)) {
    const weaponKey = MINI_BOSS_WEAPON[enemy.kind]!;
    state.dungeon.items.push({ item: createWeapon(weaponKey, `${enemy.id}-weapon`), x: enemy.x, y: enemy.y });
    state.dungeon.items.push({ item: createAnchorItem(`${enemy.id}-anchor`), x: enemy.x, y: enemy.y });
    state.dungeon.items.push({ item: createTimeShard(`${enemy.id}-shard-1`), x: enemy.x, y: enemy.y });
    state.dungeon.items.push({ item: createTimeShard(`${enemy.id}-shard-2`), x: enemy.x, y: enemy.y });
    awardEchoes(state, 25, 'Mini-Boss kill');
    openBossGate(state);
    logLine(state, `${ENEMY_NAME[enemy.kind]} falls — the way down opens.`);
    return;
  }

  if (enemy.kind === 'CHRONO_LICH') {
    logLine(state, 'The Chrono-Lich unravels...');
    triggerVictory(state);
    return;
  }

  logLine(state, `${ENEMY_NAME[enemy.kind]} defeated!`);
}

/** Applies a single damage instance. */
function applyDamageInstance(
  state: GameState,
  enemy: Enemy,
  rawAtk: number,
  element: Element,
  label: string,
  source: 'bump' | 'skill',
): boolean {
  // Check dodge/block before applying damage.
  if (tryBlinkDodge(state, enemy) || tryShieldBlock(state, enemy)) return false;
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

/** Applies skill damage to an enemy. */
export function skillDamageEnemy(state: GameState, enemy: Enemy, rawAtk: number, element: Element, label: string): boolean {
  return applyDamageInstance(state, enemy, rawAtk, element, label, 'skill');
}

function placeFireHazard(state: GameState, x: number, y: number, turns: number): void {
  const existing = state.dungeon.expiringTiles.find((t) => t.x === x && t.y === y);
  if (existing) existing.turnsLeft = turns;
  else state.dungeon.expiringTiles.push({ x, y, turnsLeft: turns, tileType: TILE.FIRE_HAZARD });
}

/** Performs player attack against an enemy. */
export function playerAttackEnemy(state: GameState, enemy: Enemy): void {
  const dx = Math.sign(enemy.x - state.run.playerX);
  const dy = Math.sign(enemy.y - state.run.playerY);
  notifyAttack(PLAYER_ID, dx, dy);

  // Early exit if attack is dodged or blocked.
  if (tryBlinkDodge(state, enemy) || tryShieldBlock(state, enemy)) return;

  const weapon = state.run.equippedWeapon;
  const element = playerElement(state);
  const mult = elementalMultiplier(element, enemy.element);
  const atk = totalAtk(state) + elementSynergyBonus(state, element);

  // Weapon execute check.
  if (weapon && !BOSS_KINDS.has(enemy.kind)) {
    const execThreshold = EXECUTE_HP_THRESHOLD[weapon.passive];
    const execChance = EXECUTE_CHANCE[weapon.passive];
    const thresholdMet = execThreshold !== undefined && enemy.hp / enemy.maxHp <= execThreshold;
    const chanceMet = execChance !== undefined && Math.random() < execChance;
    if (thresholdMet || chanceMet) {
      logLine(state, `${weapon.name} executes ${ENEMY_NAME[enemy.kind]}!`);
      notifyFloatingText(enemy.x, enemy.y, 'EXECUTED', 'crit');
      markHitStop();
      enemy.hp = 0;
      killEnemy(state, enemy, 'bump');
      return;
    }
  }

  let effectiveDef = enemy.defense;
  const ignoreDefPct = IGNORE_DEF_PCT[weapon?.passive ?? ''];
  if (ignoreDefPct) effectiveDef = Math.round(effectiveDef * (1 - ignoreDefPct));
  let dmg = computeDamage(atk, effectiveDef, element, enemy.element);

  const statusBonus = BONUS_VS_STATUS[weapon?.passive ?? ''];
  if (statusBonus && enemy.status === statusBonus.status) dmg *= statusBonus.mult;
  if (weapon?.passive === 'combo_stack') dmg += comboBonusDamage(enemy);
  if (state.run.whetstoneCharge) {
    dmg *= 2;
    state.run.whetstoneCharge = false;
    logLine(state, 'Whetstone doubles the blow!');
  }
  // Executioner's Coin bonus.
  if (state.run.relics.includes('executioners_coin') && enemy.hp / enemy.maxHp < EXECUTIONERS_COIN_THRESHOLD) {
    dmg = Math.round(dmg * EXECUTIONERS_COIN_MULT);
  }
  // Duelist's Glove bonus.
  if (state.run.relics.includes('duelists_glove') && isDuelingAlone(state, enemy)) {
    dmg = Math.round(dmg * DUELISTS_GLOVE_MULT);
  }

  enemy.hp -= dmg;
  logLine(state, `You hit the ${ENEMY_NAME[enemy.kind]} for ${dmg}.`);
  playAttackSfx(element, mult);
  if (mult > 1) markHitStop();
  notifyFloatingText(enemy.x, enemy.y, mult > 1 ? `${dmg} CRIT!` : `${dmg}`, mult > 1 ? 'crit' : 'damage');

  // Ranged weapon stamina cost.
  if (WEAPON_RANGE[weapon?.passive ?? '']) {
    state.run.currentStamina = Math.max(0, state.run.currentStamina - 1);
  }

  // Static Generator proc.
  if (state.run.staticGenCharged) {
    state.run.staticGenCharged = false;
    applyEnemyStatus(enemy, 'STUN', 1);
    logLine(state, 'Static Generator discharges — Stunned!');
  }

  if (weapon?.passive === 'cure_chill_on_attack' && state.run.status === 'CHILLED') {
    state.run.status = 'NONE';
    state.run.statusTurns = 0;
    logLine(state, `${weapon.name} burns away the Chill.`);
  }
  if (HEAVY_STAMINA_PASSIVES.has(weapon?.passive ?? '')) {
    state.run.currentStamina = Math.max(0, state.run.currentStamina - 1);
  }
  const selfDmg = SELF_DAMAGE_PER_HIT[weapon?.passive ?? ''];
  if (selfDmg) {
    state.run.currentHp = Math.max(0, state.run.currentHp - selfDmg);
    markFloorDamageTaken(state);
    logLine(state, `${weapon!.name} drinks your blood.`);
  }
  const leech = LIFESTEAL_ON_HIT[weapon?.passive ?? ''];
  if (leech) {
    state.run.currentHp = Math.min(state.run.maxHp, state.run.currentHp + leech);
    logLine(state, `${weapon!.name} drains ${leech} HP.`);
  }
  const leechChance = STAMINA_LEECH_CHANCE[weapon?.passive ?? ''];
  if (leechChance && Math.random() < leechChance) {
    state.run.currentStamina = Math.min(state.run.maxStamina, state.run.currentStamina + 1);
    logLine(state, `${weapon!.name} siphons a spark of Stamina back.`);
  }
  const stunVsChilledChance = STUN_VS_CHILLED_CHANCE[weapon?.passive ?? ''];
  if (stunVsChilledChance && enemy.status === 'CHILLED' && Math.random() < stunVsChilledChance) {
    applyEnemyStatus(enemy, 'STUN', 1);
    logLine(state, `${ENEMY_NAME[enemy.kind]} is Stunned!`);
  }
  if (weapon?.passive === 'permanent_def_reduction_1') {
    enemy.defense = Math.max(0, enemy.defense - 1);
  }
  if (weapon?.passive === 'ignite_behind') {
    const bx = enemy.x + dx;
    const by = enemy.y + dy;
    if (isWalkableAt(state, bx, by)) placeFireHazard(state, bx, by, 4);
  }

  // Pierce passive effect.
  if (PIERCE_PASSIVES.has(weapon?.passive ?? '')) {
    const bx = enemy.x + dx;
    const by = enemy.y + dy;
    const behind = state.dungeon.enemies.find((e) => e.x === bx && e.y === by);
    if (behind) applyDamageInstance(state, behind, atk, element, 'The pierce', 'bump');
    if (weapon?.passive === 'pierce_ranged_3_fire_hazard' && isWalkableAt(state, bx, by)) placeFireHazard(state, bx, by, 3);
  }

  // Arc passive effect.
  if (weapon?.passive === 'arc_3') {
    const flanks = dx !== 0 ? [{ x: enemy.x, y: enemy.y - 1 }, { x: enemy.x, y: enemy.y + 1 }] : [{ x: enemy.x - 1, y: enemy.y }, { x: enemy.x + 1, y: enemy.y }];
    for (const f of flanks) {
      const side = state.dungeon.enemies.find((e) => e.x === f.x && e.y === f.y);
      if (side) applyDamageInstance(state, side, atk, element, 'The arc', 'bump');
    }
  }

  // Cleave-front passive effect.
  if (weapon?.passive === 'cleave_3_front' && state.run.currentStamina >= 1) {
    state.run.currentStamina -= 1;
    for (let i = 2; i <= 3; i++) {
      const tx = state.run.playerX + dx * i;
      const ty = state.run.playerY + dy * i;
      const further = state.dungeon.enemies.find((e) => e.x === tx && e.y === ty);
      if (further) applyDamageInstance(state, further, atk, element, weapon.name, 'bump');
    }
  }

  // Chain Lightning passive effect.
  if (weapon?.passive === 'chain_lightning_1') {
    const other = state.dungeon.enemies.find((e) => e.id !== enemy.id && Math.abs(e.x - enemy.x) + Math.abs(e.y - enemy.y) <= 2);
    if (other) applyDamageInstance(state, other, Math.round(atk * 0.5), element, 'Chain Lightning', 'bump');
  }

  if (enemy.hp <= 0) {
    if (weapon?.passive === 'heal_missing_10_on_kill') {
      const heal = Math.round((state.run.maxHp - state.run.currentHp) * 0.1);
      if (heal > 0) {
        state.run.currentHp = Math.min(state.run.maxHp, state.run.currentHp + heal);
        logLine(state, `${weapon.name} restores ${heal} HP.`);
      }
    }
    if (weapon?.passive === 'chill_spread_on_kill' && enemy.status === 'CHILLED') {
      for (const [adx, ady] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const adj = state.dungeon.enemies.find((e) => e.x === enemy.x + adx && e.y === enemy.y + ady);
        if (adj) {
          applyEnemyStatus(adj, 'CHILLED', 3);
          logLine(state, `The cold spreads to ${ENEMY_NAME[adj.kind]}!`);
        }
      }
    }
    killEnemy(state, enemy, 'bump');
    return;
  }

  // Knockback and pull effects.
  if (KNOCKBACK_1_PASSIVES.has(weapon?.passive ?? '')) {
    applyKnockback(state, enemy, dx, dy, 1);
  } else if (weapon?.passive === 'knockback_2_randomize_element') {
    applyKnockback(state, enemy, dx, dy, 2);
    enemy.element = randomElement();
    enemy.weakness = weaknessOf(enemy.element);
    logLine(state, `${ENEMY_NAME[enemy.kind]}'s element shifts unpredictably!`);
  } else if (weapon?.passive === 'pull_1_stun_25') {
    applyPull(state, enemy, dx, dy);
    if (Math.random() < 0.25) {
      applyEnemyStatus(enemy, 'STUN', 1);
      logLine(state, `${ENEMY_NAME[enemy.kind]} is Stunned!`);
    }
  } else if (weapon?.passive === 'wall_slam_bonus') {
    const tx = enemy.x + dx;
    const ty = enemy.y + dy;
    if (isWalkableAt(state, tx, ty)) {
      applyKnockback(state, enemy, dx, dy, 1);
    } else {
      const bonus = Math.round(dmg * 0.5);
      enemy.hp -= bonus;
      logLine(state, `${weapon.name} slams ${ENEMY_NAME[enemy.kind]} into the wall for ${bonus} more!`);
      notifyFloatingText(enemy.x, enemy.y, `${bonus}`, 'damage');
      if (enemy.hp <= 0) {
        killEnemy(state, enemy, 'bump');
        return;
      }
    }
  }

  // Minimum range knockback.
  const rangeProfile = WEAPON_RANGE[weapon?.passive ?? ''];
  if (rangeProfile && rangeProfile.min > 1) {
    applyKnockback(state, enemy, dx, dy, 1);
  }

  if (weapon?.passive === 'pierce_ranged_2_dash') {
    const nx = state.run.playerX + dx;
    const ny = state.run.playerY + dy;
    if (isWalkableAt(state, nx, ny) && !state.dungeon.enemies.some((e) => e.x === nx && e.y === ny)) {
      state.run.playerX = nx;
      state.run.playerY = ny;
      logLine(state, `${weapon.name} carries you forward.`);
    }
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

/** Handles enemy attack against player. */
export function enemyAttackPlayer(state: GameState, enemy: Enemy): void {
  notifyAttack(enemy.id, Math.sign(state.run.playerX - enemy.x), Math.sign(state.run.playerY - enemy.y));

  if (state.run.iceAegisCharges > 0) {
    state.run.iceAegisCharges -= 1;
    logLine(state, `Ice Aegis blocks ${ENEMY_NAME[enemy.kind]}'s attack!`);
    playStatusApplySfx('CHILLED');
    if (state.run.iceAegisChillsAttacker) applyEnemyStatus(enemy, 'CHILLED', 3);
    return;
  }

  // Reflect Barrier logic.
  if (state.run.reflectBarrierCharges > 0) {
    state.run.reflectBarrierCharges -= 1;
    const reflectDmg = computeDamage(totalAtk(state) * 3, enemy.defense, playerElement(state), enemy.element);
    enemy.hp -= reflectDmg;
    logLine(state, `Reflect Barrier blocks ${ENEMY_NAME[enemy.kind]} and returns ${reflectDmg}!`);
    notifyFloatingText(enemy.x, enemy.y, `${reflectDmg}`, 'damage');
    if (state.run.reflectBarrierStuns) applyEnemyStatus(enemy, 'STUN', 1);
    if (enemy.hp <= 0) killEnemy(state, enemy, 'bump');
    return;
  }

  // Save the Queen hit negation.
  if (state.run.equippedWeapon?.passive === 'negate_first_hit_per_floor' && !state.run.floorFirstHitNegated) {
    state.run.floorFirstHitNegated = true;
    logLine(state, `${state.run.equippedWeapon.name} negates ${ENEMY_NAME[enemy.kind]}'s blow!`);
    notifyFloatingText(state.run.playerX, state.run.playerY, 'NEGATED', 'immune');
    return;
  }

  // Cursed turn steal.
  if (enemy.affix === 'cursed') {
    state.run.turnsRemaining = Math.max(0, state.run.turnsRemaining - 3);
    logLine(state, `${ENEMY_NAME[enemy.kind]} steals 3 Turns from you!`);
    notifyFloatingText(state.run.playerX, state.run.playerY, '-3 TURNS', 'damage');
    return;
  }

  const dmg = computeDamage(enemy.attack, totalDef(state), enemy.element, playerElement(state));
  state.run.currentHp = Math.max(0, state.run.currentHp - dmg);
  markFloorDamageTaken(state);
  logLine(state, `${ENEMY_NAME[enemy.kind]} hits you for ${dmg}.`);
  playEnemyHitPlayerSfx();
  notifyFloatingText(state.run.playerX, state.run.playerY, `${dmg}`, 'damage');

  // Vampiric heal.
  if (enemy.affix === 'vampiric') {
    const heal = Math.round(dmg * 0.5);
    enemy.hp = Math.min(enemy.maxHp, enemy.hp + heal);
    notifyFloatingText(enemy.x, enemy.y, `+${heal}`, 'immune');
  }

  if (enemy.kind === 'FROST_WRAITH' && Math.random() < 0.25) {
    applyPlayerStatus(state, 'CHILLED', 3, enemy);
    logLine(state, 'You are Chilled!');
  }

  // Volt-Hound stun proc.
  if (enemy.kind === 'VOLT_HOUND' && Math.random() < 0.25) {
    applyPlayerStatus(state, 'STUN', 1, enemy);
    logLine(state, 'You are Stunned!');
  }

  if (hasAccessoryPassive(state, 'retaliation_2')) {
    const retaliateDmg = computeDamage(2, enemy.defense, 'PHYSICAL', enemy.element);
    enemy.hp -= retaliateDmg;
    logLine(state, `Spiked Pauldrons retaliate for ${retaliateDmg}.`);
    notifyFloatingText(enemy.x, enemy.y, `${retaliateDmg}`, 'damage');
    if (enemy.hp <= 0) killEnemy(state, enemy, 'bump');
  }
}
