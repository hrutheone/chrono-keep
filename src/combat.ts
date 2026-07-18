// Bumping combat, the Elemental Wheel, and status effects. Turn-phase
// orchestration lives in turnController.ts; enemy movement/targeting in enemyAI.ts.

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
import { elementSynergyBonus, totalAtk, totalDef } from './inventory';
import { TILE, isWalkableAt } from './mapgen';
import { openBossGate } from './arenas';
import { logLine } from './turns';
import { awardEchoes, markFloorDamageTaken } from './echoes';
import { triggerVictory } from './victory';
import { playAttackSfx, playEnemyHitPlayerSfx, playStatusApplySfx } from './audio';
import { PLAYER_ID, notifyAttack, notifyDeath, spawnDeathParticles } from './animation';
import { notifyFloatingText } from './floatingText';
import type { Element, Enemy, GameState, StatusEffect } from './types';

// Set on a Weakness hit or killing blow; turnController.ts consumes it to
// freeze briefly + screen-shake before the Enemy Phase.
let hitStopPending = false;
export function consumeHitStopFlag(): boolean {
  const v = hitStopPending;
  hitStopPending = false;
  return v;
}
function markHitStop(): void {
  hitStopPending = true;
}

// The Deep-Biome Regulars are Regular tier, not Elite — must be in this set
// or kills silently award 0 Echoes and never drop Time Shards.
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

/** 2.0x (rounded up) attacking down the wheel, 0.5x (rounded down) attacking up it, else 1x. Chrono is exempt either way. */
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

/** The player has no fixed element — the equipped weapon's element (Physical
 * if unarmed) stands in for it on both offense and defense. */
export function playerElement(state: GameState): Element {
  return state.run.equippedWeapon?.element ?? 'PHYSICAL';
}

const ALL_ELEMENTS: Element[] = ['PHYSICAL', 'FIRE', 'VOLT', 'FROST', 'CHRONO'];
function randomElement(): Element {
  return ALL_ELEMENTS[Math.floor(Math.random() * ALL_ELEMENTS.length)];
}

/** Pushes the *defender* away from the player up to `tiles`, stopping at the
 * first wall/enemy/player. Exported for skills.ts's Bash. */
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

/** Pull (Tesla Gauntlets): yanks the defender past the player, to the tile on
 * the far side — repositioning them, since they're already adjacent. */
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

/** Gambler's Dice doubles the Time Shard drop chance. */
function timeShardChance(state: GameState): number {
  return state.run.equippedAccessory?.passive === 'gamblers_dice' ? TIME_SHARD_DROP_CHANCE * 2 : TIME_SHARD_DROP_CHANCE;
}

// --- Weapon passive parameter maps ---
// Small per-mechanic lookups (mirrors inventory.ts's DEF_BONUS/HP_BONUS) —
// several weapons share a mechanic at different amounts, so a map avoids
// repeating the same branch per weapon in playerAttackEnemy.

// Enemies have no Stamina stat, so Mage Masher's drain is reinterpreted as
// the player recovering Stamina instead.
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
// Every weapon passive that also damages whatever's behind the target.
const PIERCE_PASSIVES = new Set(['pierce_ranged_2', 'pierce_ranged_3_fire_hazard', 'pierce_ranged_2_dash', 'pierce_ranged_2_lifesteal_3']);
const KNOCKBACK_1_PASSIVES = new Set(['knockback_1', 'ranged_push_3']);
const HEAVY_STAMINA_PASSIVES = new Set(['heavy_stamina', 'execute_20_heavy']);
const KILL_TURN_REFUND: Partial<Record<string, number>> = { kill_refund_turn: 1, kill_refund_turns_3: 3 };
// Mini-Bosses/Chrono-Lich are exempt from execute/instant-kill passives —
// hand-tuned fights, not meant to be skipped by a lucky roll. Listed
// directly (not via MINI_BOSS_KINDS below) to avoid a temporal-dead-zone.
const BOSS_KINDS = new Set<Enemy['kind']>(['INFERNO_GOLEM', 'STORM_CALLER', 'GLACIAL_KNIGHT', 'CHRONO_LICH']);

// --- Chronofact/Elite Affix combat hooks ---
// Only relics with a numeric parameter get their own constant here; the
// rest are checked inline via `state.run.relics.includes(...)`.
const EXECUTIONERS_COIN_THRESHOLD = 0.3;
const EXECUTIONERS_COIN_MULT = 1.5;
const DUELISTS_GLOVE_RADIUS = 5;
const DUELISTS_GLOVE_MULT = 1.5;
const BLINKING_DODGE_CHANCE = 0.3;

/** Kotetsu: +1 ATK per consecutive hit on the same enemy, reset the instant a
 * different enemy is struck. Module-level — only one active combo exists. */
let comboEnemyId: string | null = null;
let comboCount = 0;
function comboBonusDamage(enemy: Enemy): number {
  comboCount = comboEnemyId === enemy.id ? comboCount + 1 : 1;
  comboEnemyId = enemy.id;
  return comboCount - 1;
}

/** For weapons with an attack range beyond/instead-of adjacency. Scans
 * (dx, dy) from the player, stopping at the first wall; returns the first
 * enemy in [min, max] range, or null (incl. adjacent-only weapons). */
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

/** `attacker` is optional — only enemyAttackPlayer's direct hits have one to
 * give Mirror Shield to reflect onto; other sources (hazards, AOE, skills)
 * skip the reflect check entirely. */
export function applyPlayerStatus(state: GameState, status: StatusEffect, turns: number, attacker?: Enemy): void {
  if (state.run.equippedAccessory?.passive === STATUS_IMMUNITY[status]) {
    notifyFloatingText(state.run.playerX, state.run.playerY, 'IMMUNE', 'immune');
    return;
  }
  // Aura: a temporary blanket immunity window, distinct from any single
  // accessory's fixed-element immunity above.
  if (state.run.statusImmuneTurns > 0) {
    notifyFloatingText(state.run.playerX, state.run.playerY, 'IMMUNE', 'immune');
    return;
  }
  // Mirror Shield: Bracing (Wait) reflects any status back onto the attacker.
  if (state.run.braced && attacker && state.run.relics.includes('mirror_shield')) {
    applyEnemyStatus(attacker, status, turns);
    logLine(state, `Mirror Shield reflects it back onto ${ENEMY_NAME[attacker.kind]}!`);
    return;
  }
  state.run.status = status;
  state.run.statusTurns = turns;
  playStatusApplySfx(status);

  // Glass Sword breaks permanently if the player is Stunned — destroyed
  // outright, not unequipped back into inventory.
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

/** [Blinking] affix: warps the enemy to a random empty adjacent tile instead
 * of taking the hit. Returns false (dodge fizzles) if no tile is open. */
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

/** [Shielded] affix: the first 3 hits it takes do nothing. */
function tryShieldBlock(state: GameState, enemy: Enemy): boolean {
  if (!enemy.shieldedHitsLeft) return false;
  enemy.shieldedHitsLeft -= 1;
  logLine(state, `${ENEMY_NAME[enemy.kind]}'s shield absorbs the hit!`);
  notifyFloatingText(enemy.x, enemy.y, 'BLOCKED', 'immune');
  return true;
}

/** Duelist's Glove: true if no other awake enemy is within
 * DUELISTS_GLOVE_RADIUS of the defender — a real 1-on-1. */
function isDuelingAlone(state: GameState, defender: Enemy): boolean {
  return !state.dungeon.enemies.some(
    (e) => e !== defender && e.awake && Math.abs(e.x - defender.x) + Math.abs(e.y - defender.y) <= DUELISTS_GLOVE_RADIUS,
  );
}

const ELITE_ENEMY_KINDS = new Set<Enemy['kind']>(['TIME_WEAVER']);

// Mini-Bosses: guaranteed drops (themed weapon + Anchor + 2 Time Shards, not
// the usual ENEMY_DROPS roll) + flat 25 Echoes, handled in killEnemy's own
// branch below (neither NORMAL_ENEMY_KINDS nor ELITE_ENEMY_KINDS applies).
const MINI_BOSS_KINDS = new Set<Enemy['kind']>(['INFERNO_GOLEM', 'STORM_CALLER', 'GLACIAL_KNIGHT']);
const MINI_BOSS_WEAPON: Partial<Record<Enemy['kind'], WeaponKey>> = {
  INFERNO_GOLEM: 'IFRITS_BLADE',
  STORM_CALLER: 'BLITZ_WHIP',
  GLACIAL_KNIGHT: 'ICE_BRAND',
};

/** Killing blow source: the Execution Stamina Refund only fires for `'skill'`. */
export function killEnemy(state: GameState, enemy: Enemy, source: 'bump' | 'skill' = 'bump'): void {
  markHitStop();
  state.dungeon.enemies = state.dungeon.enemies.filter((e) => e.id !== enemy.id);
  notifyDeath(enemy.id, enemy.kind, enemy.x, enemy.y);
  spawnDeathParticles(enemy.x, enemy.y);

  // A regular-kind Elite guarantees a Relic-or-Tier-3-Weapon instead of its
  // kind's normal ENEMY_DROPS roll. [Wealthy] is checked first below since
  // it replaces this entirely (guaranteed Relic + 50 Echoes, no normal drop).
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

  // Gunpowder Flask: a Burning death explodes in a 3x3, dealing your ATK to
  // nearby enemies (not the player).
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

  // [Volatile] affix: explodes on death, hitting the player for its own ATK
  // + a Stun if within the 3x3 blast.
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

  if (state.run.equippedAccessory?.passive === 'lifesteal_1') {
    state.run.currentHp = Math.min(state.run.maxHp, state.run.currentHp + 1);
    logLine(state, 'Vampire Tooth pulses — +1 HP.');
  }

  // Vampire's Cape: bump kills specifically, not skill kills.
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

/** Computes/applies damage, plays SFX/floating text/Hit-Stop, kills on lethal.
 * `source` gates whether a kill grants the Execution Stamina Refund. */
function applyDamageInstance(
  state: GameState,
  enemy: Enemy,
  rawAtk: number,
  element: Element,
  label: string,
  source: 'bump' | 'skill',
): boolean {
  // Dodge/block checks apply to every damage instance, not just the primary
  // target — Pierce/Arc/Chain-Lightning can hit a [Blinking]/[Shielded]
  // Elite standing behind/beside the main target too.
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

/** Skill damage to an enemy (Cleave/Flame Arc): the skill's own element, not the
 * equipped weapon's. Returns true if the hit killed the enemy. */
export function skillDamageEnemy(state: GameState, enemy: Enemy, rawAtk: number, element: Element, label: string): boolean {
  return applyDamageInstance(state, enemy, rawAtk, element, label, 'skill');
}

function placeFireHazard(state: GameState, x: number, y: number, turns: number): void {
  const existing = state.dungeon.expiringTiles.find((t) => t.x === x && t.y === y);
  if (existing) existing.turnsLeft = turns;
  else state.dungeon.expiringTiles.push({ x, y, turnsLeft: turns, tileType: TILE.FIRE_HAZARD });
}

/** Player bump- or ranged-attacks an enemy: weapon element/procs, elemental
 * wheel, death & drops, and every on-hit/on-kill weapon passive. */
export function playerAttackEnemy(state: GameState, enemy: Enemy): void {
  const dx = Math.sign(enemy.x - state.run.playerX);
  const dy = Math.sign(enemy.y - state.run.playerY);
  notifyAttack(PLAYER_ID, dx, dy);

  // Checked before anything else, including Execute — a dodged/blocked hit
  // never happened, full stop.
  if (tryBlinkDodge(state, enemy) || tryShieldBlock(state, enemy)) return;

  const weapon = state.run.equippedWeapon;
  const element = playerElement(state);
  const mult = elementalMultiplier(element, enemy.element);
  const atk = totalAtk(state) + elementSynergyBonus(state, element);

  // Execute (Rune Axe's HP-threshold, Deathbringer's flat chance) — checked
  // before normal damage; exempt from Mini-Bosses/the Chrono-Lich.
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
  // Executioner's Coin: +50% vs. a target below 30% HP.
  if (state.run.relics.includes('executioners_coin') && enemy.hp / enemy.maxHp < EXECUTIONERS_COIN_THRESHOLD) {
    dmg = Math.round(dmg * EXECUTIONERS_COIN_MULT);
  }
  // Duelist's Glove: +50% in a real 1-on-1.
  if (state.run.relics.includes('duelists_glove') && isDuelingAlone(state, enemy)) {
    dmg = Math.round(dmg * DUELISTS_GLOVE_MULT);
  }

  enemy.hp -= dmg;
  logLine(state, `You hit the ${ENEMY_NAME[enemy.kind]} for ${dmg}.`);
  playAttackSfx(element, mult);
  if (mult > 1) markHitStop();
  notifyFloatingText(enemy.x, enemy.y, mult > 1 ? `${dmg} CRIT!` : `${dmg}`, mult > 1 ? 'crit' : 'damage');

  // Ranged Stamina Tax: any weapon that can attack from range costs 1
  // Stamina per basic attack (capped at 0) — limits pure kiting, since
  // running dry blocks Dash/skills too.
  if (WEAPON_RANGE[weapon?.passive ?? '']) {
    state.run.currentStamina = Math.max(0, state.run.currentStamina - 1);
  }

  // Static Generator: consumes its charge (built by movement.ts's step
  // counter) to auto-Stun this hit's target.
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

  // Pierce: also damages whatever's directly behind the target, as its own
  // damage instance (never grants an Execution Refund).
  if (PIERCE_PASSIVES.has(weapon?.passive ?? '')) {
    const bx = enemy.x + dx;
    const by = enemy.y + dy;
    const behind = state.dungeon.enemies.find((e) => e.x === bx && e.y === by);
    if (behind) applyDamageInstance(state, behind, atk, element, 'The pierce', 'bump');
    if (weapon?.passive === 'pierce_ranged_3_fire_hazard' && isWalkableAt(state, bx, by)) placeFireHazard(state, bx, by, 3);
  }

  // Arc (Thunder Rod): also hits the two tiles flanking the target,
  // perpendicular to the attack direction.
  if (weapon?.passive === 'arc_3') {
    const flanks = dx !== 0 ? [{ x: enemy.x, y: enemy.y - 1 }, { x: enemy.x, y: enemy.y + 1 }] : [{ x: enemy.x - 1, y: enemy.y }, { x: enemy.x + 1, y: enemy.y }];
    for (const f of flanks) {
      const side = state.dungeon.enemies.find((e) => e.x === f.x && e.y === f.y);
      if (side) applyDamageInstance(state, side, atk, element, 'The arc', 'bump');
    }
  }

  // Cleave-front (Ifrit's Blade): hits the 2 tiles beyond the primary
  // target for an extra 1 Stamina. Bump-only weapon, so counting from the
  // player's own tile is correct.
  if (weapon?.passive === 'cleave_3_front' && state.run.currentStamina >= 1) {
    state.run.currentStamina -= 1;
    for (let i = 2; i <= 3; i++) {
      const tx = state.run.playerX + dx * i;
      const ty = state.run.playerY + dy * i;
      const further = state.dungeon.enemies.find((e) => e.x === tx && e.y === ty);
      if (further) applyDamageInstance(state, further, atk, element, weapon.name, 'bump');
    }
  }

  // Chain Lightning (Blitz Whip): one other nearby enemy, at reduced damage.
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

  // Knockback / Pull: repositions the defender, not the attacker.
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

  // A weapon that can't hit adjacent (min range > 1, e.g. Ash Wand/Elven Bow)
  // shoves its target back on every hit — otherwise a closing enemy
  // permanently jams the weapon once it reaches adjacency.
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

/** Enemy bump-attacks the player: wheel modifier vs. the player's weapon
 * element, status procs. Ice Aegis blocks the hit entirely while charged. */
export function enemyAttackPlayer(state: GameState, enemy: Enemy): void {
  notifyAttack(enemy.id, Math.sign(state.run.playerX - enemy.x), Math.sign(state.run.playerY - enemy.y));

  if (state.run.iceAegisCharges > 0) {
    state.run.iceAegisCharges -= 1;
    logLine(state, `Ice Aegis blocks ${ENEMY_NAME[enemy.kind]}'s attack!`);
    playStatusApplySfx('CHILLED');
    if (state.run.iceAegisChillsAttacker) applyEnemyStatus(enemy, 'CHILLED', 3);
    return;
  }

  // Reflect Barrier: blocks the hit and returns 3x the player's current ATK
  // as damage — its own independent charge pool from Ice Aegis.
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

  // Save the Queen: negates the first HP damage taken on every floor —
  // checked after Ice Aegis so a hit never burns a charge AND the negation.
  if (state.run.equippedWeapon?.passive === 'negate_first_hit_per_floor' && !state.run.floorFirstHitNegated) {
    state.run.floorFirstHitNegated = true;
    logLine(state, `${state.run.equippedWeapon.name} negates ${ENEMY_NAME[enemy.kind]}'s blow!`);
    notifyFloatingText(state.run.playerX, state.run.playerY, 'NEGATED', 'immune');
    return;
  }

  // [Cursed] affix: deals no HP damage — steals 3 Turns instead. Checked
  // after every full-block above (still stoppable by them).
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

  // [Vampiric] Elite Affix (Phase 19): heals itself for 50% of damage dealt.
  if (enemy.affix === 'vampiric') {
    const heal = Math.round(dmg * 0.5);
    enemy.hp = Math.min(enemy.maxHp, enemy.hp + heal);
    notifyFloatingText(enemy.x, enemy.y, `+${heal}`, 'immune');
  }

  if (enemy.kind === 'FROST_WRAITH' && Math.random() < 0.25) {
    applyPlayerStatus(state, 'CHILLED', 3, enemy);
    logLine(state, 'You are Chilled!');
  }

  // Volt-Hound (Section 6C, Phase 14): 25% Stun chance on hit.
  if (enemy.kind === 'VOLT_HOUND' && Math.random() < 0.25) {
    applyPlayerStatus(state, 'STUN', 1, enemy);
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
