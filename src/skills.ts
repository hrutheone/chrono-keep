// Skill execution.

import { SKILLS, rollRandomConsumable } from './content';
import { elementSynergyBonus, pickupItemsAt, totalAtk } from './inventory';
import { applyEnemyStatus, applyKnockback, skillDamageEnemy } from './combat';
import { isWalkableAt, TILE } from './mapgen';
import { consumeStunnedAction, tryDescendIfOnStairs } from './movement';
import { isTurnBusy, resolvePlayerTurn } from './turnController';
import { isRunOver, logLine, spendTurn } from './turns';
import { playSkillSfx } from './audio';
import { spawnEffectParticles } from './animation';
import { ELEMENT_COLOR } from './palette';
import type { Enemy, GameState } from './types';

type Facing = GameState['run']['facing'];

const FACING_DELTA: Record<Facing, { dx: number; dy: number }> = {
  UP: { dx: 0, dy: -1 },
  DOWN: { dx: 0, dy: 1 },
  LEFT: { dx: -1, dy: 0 },
  RIGHT: { dx: 1, dy: 0 },
};

const ORTHO_DELTA: ReadonlyArray<{ dx: number; dy: number }> = [
  { dx: 1, dy: 0 },
  { dx: -1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: 0, dy: -1 },
];

// Diagonal-inclusive delta array.
const ALL_8_DELTA: ReadonlyArray<{ dx: number; dy: number }> = [
  ...ORTHO_DELTA,
  { dx: 1, dy: 1 },
  { dx: 1, dy: -1 },
  { dx: -1, dy: 1 },
  { dx: -1, dy: -1 },
];

const FLAME_ARC_HAZARD_TURNS = 4;

function walkableAt(state: GameState, x: number, y: number): boolean {
  return isWalkableAt(state, x, y);
}

function enemyAt(state: GameState, x: number, y: number): Enemy | undefined {
  return state.dungeon.enemies.find((e) => e.x === x && e.y === y);
}

// Track Ultima stamina.
let ultimaStaminaSpent = 0;

/** Returns stamina cost for a skill. */
function skillStaminaCost(state: GameState, skillId: string, level: number): number {
  if (state.run.equippedAccessory?.passive === 'adrenaline' && state.run.currentHp < 10) return 0;
  if (skillId === 'ultima') {
    ultimaStaminaSpent = state.run.currentStamina;
    return state.run.currentStamina;
  }
  if (skillId === 'static_shift' && level >= 3) return 2;
  if (skillId === 'dragoon_jump' && level >= 3) return 2;
  if (skillId === 'dash' && state.run.equippedAccessory?.passive === 'dash_discount') return 1;
  return SKILLS[skillId].stamina;
}

function castDash(state: GameState, level: number): void {
  const dist = level >= 2 ? 3 : 2;
  const { dx, dy } = FACING_DELTA[state.run.facing];
  const startX = state.run.playerX;
  const startY = state.run.playerY;
  let moved = 0;
  for (let i = 0; i < dist; i++) {
    const nx = state.run.playerX + dx;
    const ny = state.run.playerY + dy;
    if (!walkableAt(state, nx, ny) || enemyAt(state, nx, ny)) break;
    state.run.playerX = nx;
    state.run.playerY = ny;
    moved++;
  }
  logLine(state, moved > 0 ? `Dash! Moved ${moved} tile(s).` : 'Dash has nowhere to go.');
  playSkillSfx('dash');
  for (let i = 0; i <= moved; i++) spawnEffectParticles(startX + dx * i, startY + dy * i, ELEMENT_COLOR.PHYSICAL);
  if (moved > 0) {
    pickupItemsAt(state, state.run.playerX, state.run.playerY);
    const descended = tryDescendIfOnStairs(state);
    if (!descended && level >= 3) {
      state.run.turnsRemaining += 1;
      logLine(state, 'Dash Lvl 3 refunds a turn.');
    }
  }
}

function castCleave(state: GameState, level: number): void {
  const mult = level >= 2 ? 1.5 : 1.2;
  const base = Math.round(totalAtk(state) * mult) + elementSynergyBonus(state, 'PHYSICAL');
  const { dx, dy } = FACING_DELTA[state.run.facing];
  for (let i = 1; i <= 3; i++) {
    const tx = state.run.playerX + dx * i;
    const ty = state.run.playerY + dy * i;
    if (!walkableAt(state, tx, ty)) break;
    spawnEffectParticles(tx, ty, ELEMENT_COLOR.PHYSICAL);
    const enemy = enemyAt(state, tx, ty);
    if (!enemy) continue;
    const killed = skillDamageEnemy(state, enemy, base, 'PHYSICAL', 'Cleave');
    if (!killed && level >= 3) {
      const bx = enemy.x + dx;
      const by = enemy.y + dy;
      if (walkableAt(state, bx, by) && !enemyAt(state, bx, by)) {
        enemy.x = bx;
        enemy.y = by;
        logLine(state, 'Knockback!');
      }
    }
  }
  playSkillSfx('cleave');
}

function castFlameArc(state: GameState, level: number): void {
  const base = 5 + elementSynergyBonus(state, 'FIRE');
  for (const { dx, dy } of ORTHO_DELTA) {
    spawnEffectParticles(state.run.playerX + dx, state.run.playerY + dy, ELEMENT_COLOR.FIRE);
    const enemy = enemyAt(state, state.run.playerX + dx, state.run.playerY + dy);
    if (!enemy) continue;
    const killed = skillDamageEnemy(state, enemy, base, 'FIRE', 'Flame Arc');
    if (!killed && level >= 2 && Math.random() < 0.5) {
      applyEnemyStatus(enemy, 'BURN', 3);
      logLine(state, `${enemy.kind} catches fire!`);
    }
  }
  if (level >= 3) {
    for (const { dx, dy } of ORTHO_DELTA) {
      const tx = state.run.playerX + dx;
      const ty = state.run.playerY + dy;
      if (!walkableAt(state, tx, ty)) continue;
      const existing = state.dungeon.expiringTiles.find((t) => t.x === tx && t.y === ty);
      if (existing) existing.turnsLeft = FLAME_ARC_HAZARD_TURNS;
      else state.dungeon.expiringTiles.push({ x: tx, y: ty, turnsLeft: FLAME_ARC_HAZARD_TURNS, tileType: TILE.FIRE_HAZARD });
    }
    logLine(state, 'Flame Arc leaves a fire hazard.');
  }
  playSkillSfx('flame_arc');
}

function castStaticShift(state: GameState, level: number): void {
  const dist = level >= 2 ? 4 : 3;
  const { dx, dy } = FACING_DELTA[state.run.facing];
  const startX = state.run.playerX;
  const startY = state.run.playerY;
  let landed = false;
  let lastX = state.run.playerX;
  let lastY = state.run.playerY;
  for (let i = 1; i <= dist; i++) {
    const nx = state.run.playerX + dx * i;
    const ny = state.run.playerY + dy * i;
    if (!walkableAt(state, nx, ny) || enemyAt(state, nx, ny)) break;
    lastX = nx;
    lastY = ny;
    landed = true;
  }
  state.run.playerX = lastX;
  state.run.playerY = lastY;
  logLine(state, landed ? 'Static Shift!' : 'Static Shift fizzles — no room to teleport.');
  playSkillSfx('static_shift');
  if (landed) {
    spawnEffectParticles(startX, startY, ELEMENT_COLOR.VOLT);
    spawnEffectParticles(lastX, lastY, ELEMENT_COLOR.VOLT);
    pickupItemsAt(state, lastX, lastY);
    tryDescendIfOnStairs(state);
  }
  for (const { dx: adx, dy: ady } of ORTHO_DELTA) {
    const enemy = enemyAt(state, state.run.playerX + adx, state.run.playerY + ady);
    if (enemy) {
      applyEnemyStatus(enemy, 'STUN', 1);
      logLine(state, `${enemy.kind} is stunned by the arrival!`);
    }
  }
}

function castIceAegis(state: GameState, level: number): void {
  state.run.iceAegisCharges = level >= 2 ? 2 : 1;
  state.run.iceAegisChillsAttacker = level >= 3;
  logLine(state, `Ice Aegis raised (${state.run.iceAegisCharges} charge${state.run.iceAegisCharges > 1 ? 's' : ''}).`);
  playSkillSfx('ice_aegis');
  spawnEffectParticles(state.run.playerX, state.run.playerY, ELEMENT_COLOR.FROST);
}

// --- Active Skills ---

function castBash(state: GameState, level: number): void {
  const { dx, dy } = FACING_DELTA[state.run.facing];
  const tx = state.run.playerX + dx;
  const ty = state.run.playerY + dy;
  spawnEffectParticles(tx, ty, ELEMENT_COLOR.PHYSICAL);
  playSkillSfx('bash');
  const enemy = enemyAt(state, tx, ty);
  if (!enemy) {
    logLine(state, 'Bash hits nothing but air.');
    return;
  }
  const mult = level >= 2 ? 1.5 : 1;
  const base = Math.round(totalAtk(state) * mult) + elementSynergyBonus(state, 'PHYSICAL');
  if (skillDamageEnemy(state, enemy, base, 'PHYSICAL', 'Bash')) return;
  const beforeX = enemy.x;
  const beforeY = enemy.y;
  applyKnockback(state, enemy, dx, dy, 2);
  if (enemy.x === beforeX && enemy.y === beforeY && level >= 3) {
    applyEnemyStatus(enemy, 'STUN', 1);
    logLine(state, `${enemy.kind} is stunned against the wall!`);
  }
}

/** Dragoon Jump cast. */
function castDragoonJump(state: GameState, level: number): void {
  const dist = level >= 2 ? 4 : 3;
  const { dx, dy } = FACING_DELTA[state.run.facing];
  const startX = state.run.playerX;
  const startY = state.run.playerY;
  let landed = false;
  let lastX = startX;
  let lastY = startY;
  for (let i = 1; i <= dist; i++) {
    const nx = state.run.playerX + dx * i;
    const ny = state.run.playerY + dy * i;
    if (!walkableAt(state, nx, ny) || enemyAt(state, nx, ny)) break;
    lastX = nx;
    lastY = ny;
    landed = true;
  }
  state.run.playerX = lastX;
  state.run.playerY = lastY;
  logLine(state, landed ? 'Dragoon Jump!' : 'Dragoon Jump fizzles — no room to leap.');
  playSkillSfx('dragoon_jump');
  if (!landed) return;
  spawnEffectParticles(startX, startY, ELEMENT_COLOR.VOLT);
  spawnEffectParticles(lastX, lastY, ELEMENT_COLOR.VOLT);
  pickupItemsAt(state, lastX, lastY);
  tryDescendIfOnStairs(state);
  for (const { dx: adx, dy: ady } of ORTHO_DELTA) {
    const enemy = enemyAt(state, startX + adx, startY + ady);
    if (enemy) {
      applyEnemyStatus(enemy, 'STUN', 1);
      logLine(state, `${enemy.kind} is caught in the trap!`);
    }
  }
}

function castBlizzardWave(state: GameState, level: number): void {
  const mult = level >= 2 ? 1.3 : 1;
  const base = Math.round(4 * mult) + elementSynergyBonus(state, 'FROST');
  for (let ddx = -1; ddx <= 1; ddx++) {
    for (let ddy = -1; ddy <= 1; ddy++) {
      if (ddx === 0 && ddy === 0) continue;
      const tx = state.run.playerX + ddx;
      const ty = state.run.playerY + ddy;
      spawnEffectParticles(tx, ty, ELEMENT_COLOR.FROST);
      const enemy = enemyAt(state, tx, ty);
      if (!enemy) continue;
      if (skillDamageEnemy(state, enemy, base, 'FROST', 'Blizzard Wave')) continue;
      applyEnemyStatus(enemy, 'CHILLED', 3);
      if (level >= 3) applyKnockback(state, enemy, Math.sign(ddx), Math.sign(ddy), 1);
    }
  }
  playSkillSfx('blizzard_wave');
}

const METEOR_TELEGRAPH_TURNS = 2;
const METEOR_RANGE = 4;

function castMeteor(state: GameState, level: number): void {
  const { dx, dy } = FACING_DELTA[state.run.facing];
  let targetX = state.run.playerX;
  let targetY = state.run.playerY;
  for (let i = 1; i <= METEOR_RANGE; i++) {
    const tx = state.run.playerX + dx * i;
    const ty = state.run.playerY + dy * i;
    if (!walkableAt(state, tx, ty)) break;
    targetX = tx;
    targetY = ty;
  }
  const mult = level >= 2 ? 1.3 : 1;
  const sourceAttack = Math.round((totalAtk(state) + elementSynergyBonus(state, 'FIRE')) * mult);
  for (let ax = -1; ax <= 1; ax++) {
    for (let ay = -1; ay <= 1; ay++) {
      const tx = targetX + ax;
      const ty = targetY + ay;
      if (!walkableAt(state, tx, ty)) continue;
      state.dungeon.telegraphTiles.push({
        x: tx,
        y: ty,
        turnsUntil: METEOR_TELEGRAPH_TURNS,
        payload: 'fire_aoe',
        sourceAttack,
        hazard: level >= 3 && ax === 0 && ay === 0,
        hazardTurns: 3,
      });
    }
  }
  logLine(state, 'Meteor begins to fall!');
  playSkillSfx('meteor');
}

function castChakra(state: GameState, level: number): void {
  const pct = level >= 2 ? 0.3 : 0.2;
  const heal = Math.round(state.run.maxHp * pct);
  state.run.currentHp = Math.min(state.run.maxHp, state.run.currentHp + heal);
  logLine(state, `Chakra restores ${heal} HP.`);
  playSkillSfx('chakra');
  spawnEffectParticles(state.run.playerX, state.run.playerY, ELEMENT_COLOR.PHYSICAL);
  state.run.turnsRemaining += 1;
  if (level >= 3) {
    state.run.tempAtkBonus = 2;
    state.run.tempAtkBonusTurns = 3;
    logLine(state, '+2 ATK for 3 turns.');
  }
}

function castRecall(state: GameState, level: number): void {
  playSkillSfx('recall');
  if (state.run.recallMarkX === null || state.run.recallMarkY === null) {
    state.run.recallMarkX = state.run.playerX;
    state.run.recallMarkY = state.run.playerY;
    logLine(state, 'Recall rune marked.');
    spawnEffectParticles(state.run.playerX, state.run.playerY, ELEMENT_COLOR.CHRONO);
    return;
  }
  const mx = state.run.recallMarkX;
  const my = state.run.recallMarkY;
  spawnEffectParticles(state.run.playerX, state.run.playerY, ELEMENT_COLOR.CHRONO);
  state.run.playerX = mx;
  state.run.playerY = my;
  state.run.recallMarkX = null;
  state.run.recallMarkY = null;
  spawnEffectParticles(mx, my, ELEMENT_COLOR.CHRONO);
  logLine(state, 'Recalled to the rune!');
  pickupItemsAt(state, mx, my);
  tryDescendIfOnStairs(state);
  if (level >= 2) {
    state.run.currentStamina = Math.min(state.run.maxStamina, state.run.currentStamina + 1);
    logLine(state, '+1 Stamina.');
  }
  if (level >= 3) state.run.turnsRemaining += 1;
}

function castDarkWave(state: GameState, level: number): void {
  const mult = level >= 2 ? 1.5 : 1.2;
  const base = Math.round(totalAtk(state) * mult) + elementSynergyBonus(state, 'PHYSICAL');
  let hits = 0;
  for (const { dx, dy } of ALL_8_DELTA) {
    const tx = state.run.playerX + dx;
    const ty = state.run.playerY + dy;
    spawnEffectParticles(tx, ty, ELEMENT_COLOR.PHYSICAL);
    const enemy = enemyAt(state, tx, ty);
    if (!enemy) continue;
    skillDamageEnemy(state, enemy, base, 'PHYSICAL', 'Dark Wave');
    hits += 1;
  }
  playSkillSfx('dark_wave');
  if (level >= 3 && hits > 0) {
    state.run.currentHp = Math.min(state.run.maxHp, state.run.currentHp + hits);
    logLine(state, `Dark Wave heals ${hits} HP.`);
  }
}

function castReflectBarrier(state: GameState, level: number): void {
  state.run.reflectBarrierCharges = level >= 2 ? 2 : 1;
  state.run.reflectBarrierStuns = level >= 3;
  logLine(state, `Reflect Barrier raised (${state.run.reflectBarrierCharges} charge${state.run.reflectBarrierCharges > 1 ? 's' : ''}).`);
  playSkillSfx('reflect_barrier');
  spawnEffectParticles(state.run.playerX, state.run.playerY, ELEMENT_COLOR.VOLT);
}

function castVanish(state: GameState, level: number): void {
  state.run.vanishCharges = level >= 2 ? 2 : 1;
  logLine(state, 'You phase out of reality.');
  playSkillSfx('vanish');
  spawnEffectParticles(state.run.playerX, state.run.playerY, ELEMENT_COLOR.CHRONO);
  if (level >= 3) {
    state.run.turnsRemaining += 1;
    logLine(state, '+1 Turn.');
  }
}

function castOmnislash(state: GameState, level: number): void {
  const { dx, dy } = FACING_DELTA[state.run.facing];
  const tx = state.run.playerX + dx;
  const ty = state.run.playerY + dy;
  spawnEffectParticles(tx, ty, ELEMENT_COLOR.PHYSICAL);
  playSkillSfx('omnislash');
  const enemy = enemyAt(state, tx, ty);
  if (!enemy) {
    logLine(state, 'Omnislash finds no target.');
    return;
  }
  const vulnerable = enemy.status === 'STUN' || enemy.status === 'CHILLED';
  const baseMult = level >= 2 ? 2 : 1.5;
  const mult = vulnerable ? baseMult * 2 : baseMult;
  const base = Math.round(totalAtk(state) * mult) + elementSynergyBonus(state, 'PHYSICAL');
  const killed = skillDamageEnemy(state, enemy, base, 'PHYSICAL', 'Omnislash');
  if (killed && level >= 3) {
    state.run.currentStamina = state.run.maxStamina;
    logLine(state, 'Stamina fully restored!');
  }
}

function castMug(state: GameState, level: number): void {
  const { dx, dy } = FACING_DELTA[state.run.facing];
  const tx = state.run.playerX + dx;
  const ty = state.run.playerY + dy;
  spawnEffectParticles(tx, ty, ELEMENT_COLOR.PHYSICAL);
  playSkillSfx('mug');
  const enemy = enemyAt(state, tx, ty);
  if (!enemy) {
    logLine(state, 'Mug finds no target.');
    return;
  }
  const base = Math.round(totalAtk(state) * 0.5) + elementSynergyBonus(state, 'PHYSICAL');
  const killed = skillDamageEnemy(state, enemy, base, 'PHYSICAL', 'Mug');
  const chance = level >= 3 ? 0.5 : level >= 2 ? 0.35 : 0.25;
  if (!killed && Math.random() < chance) {
    const dropped = rollRandomConsumable(`mug-${enemy.id}-${Date.now()}`);
    state.dungeon.items.push({ item: dropped, x: enemy.x, y: enemy.y });
    logLine(state, `${enemy.kind} drops ${dropped.name}!`);
  }
}

function castHaste(state: GameState, level: number): void {
  const charges = level >= 3 ? 3 : 2;
  state.run.quicksilverCharges += charges;
  logLine(state, `Haste — your next ${charges} actions are free.`);
  playSkillSfx('haste');
  spawnEffectParticles(state.run.playerX, state.run.playerY, ELEMENT_COLOR.CHRONO);
  if (level >= 2) {
    state.run.currentStamina = Math.min(state.run.maxStamina, state.run.currentStamina + 1);
    logLine(state, '+1 Stamina.');
  }
}

function castProvoke(state: GameState, level: number): void {
  state.run.tempDefBonus = level >= 2 ? 7 : 5;
  state.run.tempDefBonusTurns = 1;
  for (const enemy of state.dungeon.enemies) {
    const dist = Math.abs(enemy.x - state.run.playerX) + Math.abs(enemy.y - state.run.playerY);
    if (dist === 0 || dist > 5) continue;
    if (Math.abs(enemy.x - state.run.playerX) >= Math.abs(enemy.y - state.run.playerY)) {
      const nx = enemy.x + Math.sign(state.run.playerX - enemy.x);
      if (walkableAt(state, nx, enemy.y) && !enemyAt(state, nx, enemy.y) && !(nx === state.run.playerX && enemy.y === state.run.playerY)) enemy.x = nx;
    } else {
      const ny = enemy.y + Math.sign(state.run.playerY - enemy.y);
      if (walkableAt(state, enemy.x, ny) && !enemyAt(state, enemy.x, ny) && !(enemy.x === state.run.playerX && ny === state.run.playerY)) enemy.y = ny;
    }
  }
  logLine(state, 'Provoke draws every eye to you!');
  playSkillSfx('provoke');
  spawnEffectParticles(state.run.playerX, state.run.playerY, ELEMENT_COLOR.FIRE);
  if (level >= 3) {
    for (const { dx, dy } of ORTHO_DELTA) {
      const enemy = enemyAt(state, state.run.playerX + dx, state.run.playerY + dy);
      if (enemy) {
        applyEnemyStatus(enemy, 'BURN', 3);
        logLine(state, `${enemy.kind} catches fire!`);
      }
    }
  }
}

function placeFrostHazard(state: GameState, x: number, y: number, turns: number): void {
  const existing = state.dungeon.expiringTiles.find((t) => t.x === x && t.y === y);
  if (existing) existing.turnsLeft = turns;
  else state.dungeon.expiringTiles.push({ x, y, turnsLeft: turns, tileType: TILE.FROST_HAZARD });
}

function castScourge(state: GameState, level: number): void {
  const turns = level >= 3 ? 5 : level >= 2 ? 4 : 3;
  for (let ddx = -1; ddx <= 1; ddx++) {
    for (let ddy = -1; ddy <= 1; ddy++) {
      const tx = state.run.playerX + ddx;
      const ty = state.run.playerY + ddy;
      if (!walkableAt(state, tx, ty)) continue;
      placeFrostHazard(state, tx, ty, turns);
      spawnEffectParticles(tx, ty, ELEMENT_COLOR.FROST);
    }
  }
  logLine(state, 'Scourge blights the ground beneath you.');
  playSkillSfx('scourge');
}

function castLancet(state: GameState, level: number): void {
  const { dx, dy } = FACING_DELTA[state.run.facing];
  let target: Enemy | undefined;
  for (let i = 1; i <= 3; i++) {
    const tx = state.run.playerX + dx * i;
    const ty = state.run.playerY + dy * i;
    if (!walkableAt(state, tx, ty)) break;
    target = enemyAt(state, tx, ty);
    if (target) break;
  }
  playSkillSfx('lancet');
  if (!target) {
    logLine(state, 'Lancet finds no target.');
    return;
  }
  const base = (level >= 2 ? 5 : 3) + elementSynergyBonus(state, 'VOLT');
  const killed = skillDamageEnemy(state, target, base, 'VOLT', 'Lancet');
  state.run.currentStamina = Math.min(state.run.maxStamina, state.run.currentStamina + 1);
  logLine(state, 'Lancet siphons a spark — +1 Stamina.');
  if (!killed && level >= 3) {
    applyEnemyStatus(target, 'STUN', 1);
    logLine(state, `${target.kind} is Stunned!`);
  }
}

function castHoly(state: GameState, level: number): void {
  const { dx, dy } = FACING_DELTA[state.run.facing];
  const tx = state.run.playerX + dx;
  const ty = state.run.playerY + dy;
  spawnEffectParticles(tx, ty, ELEMENT_COLOR.FIRE);
  playSkillSfx('holy');
  spendTurn(state);
  const enemy = enemyAt(state, tx, ty);
  if (!enemy) {
    logLine(state, 'Holy finds no target.');
    return;
  }
  const mult = level >= 2 ? 3 : 2.5;
  const base = Math.round(totalAtk(state) * mult) + elementSynergyBonus(state, 'FIRE');
  const killed = skillDamageEnemy(state, enemy, base, 'FIRE', 'Holy');
  if (killed && level >= 3) {
    const heal = Math.round(state.run.maxHp * 0.2);
    state.run.currentHp = Math.min(state.run.maxHp, state.run.currentHp + heal);
    logLine(state, `Holy restores ${heal} HP.`);
  }
}

function castDefuse(state: GameState, level: number): void {
  const { dx, dy } = FACING_DELTA[state.run.facing];
  const tx = state.run.playerX + dx;
  const ty = state.run.playerY + dy;
  spawnEffectParticles(tx, ty, ELEMENT_COLOR.VOLT);
  playSkillSfx('defuse');
  const enemy = enemyAt(state, tx, ty);
  if (!enemy) {
    logLine(state, 'Defuse finds no target.');
    return;
  }
  if (!enemy.defuseTurnsLeft || enemy.defuseTurnsLeft <= 0) enemy.defuseOriginalDef = enemy.defense;
  enemy.defense = 0;
  enemy.defuseTurnsLeft = level >= 3 ? 3 : level >= 2 ? 2 : 1;
  logLine(state, `${enemy.kind}'s defenses are stripped!`);
}

/** Slow cast. */
function castSlow(state: GameState, level: number): void {
  const targets: Enemy[] = [];
  if (level >= 3) {
    for (let ddx = -1; ddx <= 1; ddx++) {
      for (let ddy = -1; ddy <= 1; ddy++) {
        const e = enemyAt(state, state.run.playerX + ddx, state.run.playerY + ddy);
        if (e) targets.push(e);
      }
    }
  } else {
    const { dx, dy } = FACING_DELTA[state.run.facing];
    const e = enemyAt(state, state.run.playerX + dx, state.run.playerY + dy);
    if (e) targets.push(e);
  }
  spawnEffectParticles(state.run.playerX, state.run.playerY, ELEMENT_COLOR.FROST);
  playSkillSfx('slow');
  if (targets.length === 0) {
    logLine(state, 'Slow finds no target.');
    return;
  }
  const turns = level >= 2 ? 6 : 4;
  for (const enemy of targets) {
    if (!enemy.slowTurnsLeft || enemy.slowTurnsLeft <= 0) enemy.slowOriginalSpeed = enemy.speed;
    enemy.speed = 0;
    enemy.slowTurnsLeft = turns;
    logLine(state, `${enemy.kind} is Slowed!`);
  }
}

function castAura(state: GameState, level: number): void {
  state.run.status = 'NONE';
  state.run.statusTurns = 0;
  state.run.statusImmuneTurns = level >= 2 ? 4 : 3;
  logLine(state, 'Aura cleanses and shields you.');
  playSkillSfx('aura');
  spawnEffectParticles(state.run.playerX, state.run.playerY, ELEMENT_COLOR.PHYSICAL);
  if (level >= 3) {
    state.run.currentHp = Math.min(state.run.maxHp, state.run.currentHp + 20);
    logLine(state, 'Aura heals 20 HP.');
  }
}

function castUltima(state: GameState, level: number): void {
  const mult = level >= 3 ? 3 : level >= 2 ? 2.5 : 2;
  const dmg = Math.round(ultimaStaminaSpent * mult);
  playSkillSfx('ultima');
  for (let ddx = -2; ddx <= 2; ddx++) {
    for (let ddy = -2; ddy <= 2; ddy++) {
      const tx = state.run.playerX + ddx;
      const ty = state.run.playerY + ddy;
      spawnEffectParticles(tx, ty, ELEMENT_COLOR.CHRONO);
      const enemy = enemyAt(state, tx, ty);
      if (enemy) skillDamageEnemy(state, enemy, dmg, 'CHRONO', 'Ultima');
    }
  }
  logLine(state, `Ultima unleashes ${dmg} damage!`);
}

const CASTERS: Record<string, (state: GameState, level: number) => void> = {
  dash: castDash,
  cleave: castCleave,
  flame_arc: castFlameArc,
  static_shift: castStaticShift,
  ice_aegis: castIceAegis,
  bash: castBash,
  dragoon_jump: castDragoonJump,
  blizzard_wave: castBlizzardWave,
  meteor: castMeteor,
  chakra: castChakra,
  recall: castRecall,
  dark_wave: castDarkWave,
  reflect_barrier: castReflectBarrier,
  vanish: castVanish,
  omnislash: castOmnislash,
  mug: castMug,
  haste: castHaste,
  provoke: castProvoke,
  scourge: castScourge,
  lancet: castLancet,
  holy: castHoly,
  defuse: castDefuse,
  slow: castSlow,
  aura: castAura,
  ultima: castUltima,
};

/** Uses an equipped skill. */
export function useSkill(state: GameState, slotIndex: 0 | 1 | 2 | 3): Promise<void> {
  if (consumeStunnedAction(state)) return Promise.resolve();

  const skillId = state.run.activeSkills[slotIndex];
  if (!skillId) {
    logLine(state, 'No skill assigned to that slot.');
    return Promise.resolve();
  }
  const level = state.persistent.skills[skillId] ?? 0;
  if (level <= 0) {
    logLine(state, `${SKILLS[skillId]?.name ?? skillId} is locked.`);
    return Promise.resolve();
  }
  // Dash disable check.
  if (skillId === 'dash' && state.run.relics.includes('giants_anvil')) {
    logLine(state, "Giant's Anvil is too heavy to Dash with.");
    return Promise.resolve();
  }
  const cost = skillStaminaCost(state, skillId, level);
  if (state.run.currentStamina < cost) {
    logLine(state, 'Not enough Stamina.');
    return Promise.resolve();
  }
  const caster = CASTERS[skillId];
  if (!caster) {
    logLine(state, `Unknown skill ${skillId}.`);
    return Promise.resolve();
  }

  state.run.braced = false;
  // Hourglass free cast check.
  const hourglassFree = state.run.relics.includes('hourglass_shard') && Math.random() < 0.15;
  if (hourglassFree) logLine(state, 'Hourglass Shard flickers — this cast is free!');
  else state.run.currentStamina -= cost;

  const floorBeforeCast = state.run.currentFloor;
  caster(state, level);
  if (state.run.currentFloor !== floorBeforeCast) return Promise.resolve();
  if (hourglassFree) state.run.turnsRemaining += 1;

  return resolvePlayerTurn(state, 'skill');
}

/** Slot mappings. */
const SLOT_KEYS: Record<string, 0 | 1 | 2 | 3> = { q: 0, e: 1, r: 2, f: 3 };

/** Wires Q/E/R/F to the game state. */
export function installSkillInput(state: GameState): void {
  window.addEventListener('keydown', (ev) => {
    if (state.ui.currentScreen !== 'GAME' || isRunOver(state) || isTurnBusy()) return;
    const key = ev.key.toLowerCase();
    const slot = SLOT_KEYS[key];
    if (slot === undefined) return;
    ev.preventDefault();
    useSkill(state, slot);
  });
}
