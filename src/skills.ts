// Skill execution (GDD Sections 6B, 7, 8): Q/E fire the mapped skill toward
// `run.facing` (self/adjacent skills ignore it), costing Stamina + 1 turn —
// same Player Move Phase -> resolvePlayerTurn sequence as a move or attack.

import { SKILLS } from './content';
import { elementSynergyBonus, pickupItemsAt, totalAtk } from './inventory';
import { applyEnemyStatus, skillDamageEnemy } from './combat';
import { isWalkableAt, TILE } from './mapgen';
import { consumeStunnedAction, tryDescendIfOnStairs } from './movement';
import { isTurnBusy, resolvePlayerTurn } from './turnController';
import { isRunOver, logLine } from './turns';
import { playSkillSfx } from './audio';
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

const FLAME_ARC_HAZARD_TURNS = 4;

function walkableAt(state: GameState, x: number, y: number): boolean {
  return isWalkableAt(state, x, y);
}

function enemyAt(state: GameState, x: number, y: number): Enemy | undefined {
  return state.dungeon.enemies.find((e) => e.x === x && e.y === y);
}

/** Static Shift Lvl 3 (2 Stamina instead of 3), Boots of Haste (Dash 1 instead
 * of 2), and Adrenaline Gland (Section 6D, Phase 8): below 10 HP, all Active
 * Skills cost 0 Stamina. */
function skillStaminaCost(state: GameState, skillId: string, level: number): number {
  if (state.run.equippedAccessory?.passive === 'adrenaline' && state.run.currentHp < 10) return 0;
  if (skillId === 'static_shift' && level >= 3) return 2;
  if (skillId === 'dash' && state.run.equippedAccessory?.passive === 'dash_discount') return 1;
  return SKILLS[skillId].stamina;
}

function castDash(state: GameState, level: number): void {
  const dist = level >= 2 ? 3 : 2;
  const { dx, dy } = FACING_DELTA[state.run.facing];
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
}

const CASTERS: Record<string, (state: GameState, level: number) => void> = {
  dash: castDash,
  cleave: castCleave,
  flame_arc: castFlameArc,
  static_shift: castStaticShift,
  ice_aegis: castIceAegis,
};

/** Fires the skill mapped to hotkey Q/E/R/F (0-3, Small Improvements: 2 slots
 * -> 4). Returns the resolvePlayerTurn() promise (or a resolved no-op) so
 * programmatic callers can await full resolution. */
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
  state.run.currentStamina -= cost;

  const floorBeforeCast = state.run.currentFloor;
  caster(state, level);
  if (state.run.currentFloor !== floorBeforeCast) return Promise.resolve();

  return resolvePlayerTurn(state, 'skill');
}

/** Q/E/R/F -> slots 0-3 (Small Improvements). */
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
