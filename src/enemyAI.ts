// Enemy Phase (GDD Sections 6C & 7): wake radius, per-kind behavior, and the
// status effects that gate a turn (Burn tick, Stun skip, Chilled half-speed).

import { createEnemy, ENEMY_NAME } from './content';
import { enemyAttackPlayer, killEnemy } from './combat';
import { isWalkableAt } from './mapgen';
import { logLine } from './turns';
import { playBossTelegraphSfx } from './audio';
import type { Enemy, GameState } from './types';

const WAKE_RADIUS = 7;
const ORTHO: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

// Volt-Turret's "fires every 2nd turn" cadence, keyed by enemy id (pruned each phase).
const turretTimers = new Map<string, number>();

function pruneTurretTimers(state: GameState): void {
  const liveIds = new Set(state.dungeon.enemies.map((e) => e.id));
  for (const id of turretTimers.keys()) if (!liveIds.has(id)) turretTimers.delete(id);
}

function inBounds(state: GameState, x: number, y: number): boolean {
  return x >= 0 && x < state.dungeon.width && y >= 0 && y < state.dungeon.height;
}

function occupiedByOtherEnemy(state: GameState, self: Enemy, x: number, y: number): boolean {
  return state.dungeon.enemies.some((e) => e !== self && e.x === x && e.y === y);
}

function shuffled<T>(arr: readonly T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function wakeIfNear(state: GameState, enemy: Enemy): void {
  if (enemy.awake) return;
  const dist = Math.abs(enemy.x - state.run.playerX) + Math.abs(enemy.y - state.run.playerY);
  if (dist <= WAKE_RADIUS) {
    enemy.awake = true;
    logLine(state, `${ENEMY_NAME[enemy.kind]} wakes up!`);
  }
}

/** Greedy chase: steps toward the player along the longer axis first, attacking on contact. */
function chaseStep(state: GameState, enemy: Enemy, steps: number, respectWalls: boolean): void {
  for (let i = 0; i < steps; i++) {
    const ddx = state.run.playerX - enemy.x;
    const ddy = state.run.playerY - enemy.y;
    const stepX: readonly [number, number] = [Math.sign(ddx), 0];
    const stepY: readonly [number, number] = [0, Math.sign(ddy)];
    const attempts = Math.abs(ddx) >= Math.abs(ddy) ? [stepX, stepY] : [stepY, stepX];

    let moved = false;
    for (const [ax, ay] of attempts) {
      if (ax === 0 && ay === 0) continue;
      const nx = enemy.x + ax;
      const ny = enemy.y + ay;
      if (nx === state.run.playerX && ny === state.run.playerY) {
        enemyAttackPlayer(state, enemy);
        return;
      }
      if (!inBounds(state, nx, ny)) continue;
      if (respectWalls && !isWalkableAt(state, nx, ny)) continue;
      if (occupiedByOtherEnemy(state, enemy, nx, ny)) continue;
      enemy.x = nx;
      enemy.y = ny;
      moved = true;
      break;
    }
    if (!moved) return;
  }
}

/** Ember-Bat: erratic — a random valid direction each step, still attacking on contact. */
function erraticStep(state: GameState, enemy: Enemy, steps: number): void {
  for (let i = 0; i < steps; i++) {
    for (const [ax, ay] of shuffled(ORTHO)) {
      const nx = enemy.x + ax;
      const ny = enemy.y + ay;
      if (nx === state.run.playerX && ny === state.run.playerY) {
        enemyAttackPlayer(state, enemy);
        return;
      }
      if (!inBounds(state, nx, ny)) continue;
      if (!isWalkableAt(state, nx, ny)) continue;
      if (occupiedByOtherEnemy(state, enemy, nx, ny)) continue;
      enemy.x = nx;
      enemy.y = ny;
      break;
    }
  }
}

/** Volt-Turret: stationary, fires a 4-tile line every 2nd activation if aligned with the player. */
function turretAct(state: GameState, enemy: Enemy): void {
  const count = (turretTimers.get(enemy.id) ?? 0) + 1;
  turretTimers.set(enemy.id, count);
  if (count % 2 !== 0) return;

  const sameRow = enemy.y === state.run.playerY;
  const sameCol = enemy.x === state.run.playerX;
  if (!sameRow && !sameCol) return;
  const dx = sameRow ? Math.sign(state.run.playerX - enemy.x) : 0;
  const dy = sameCol ? Math.sign(state.run.playerY - enemy.y) : 0;

  for (let i = 1; i <= 4; i++) {
    const tx = enemy.x + dx * i;
    const ty = enemy.y + dy * i;
    if (tx === state.run.playerX && ty === state.run.playerY) {
      enemyAttackPlayer(state, enemy);
      return;
    }
    if (!inBounds(state, tx, ty) || !isWalkableAt(state, tx, ty)) return;
  }
}

// Chrono-Lich (GDD Section 6C): activation counter driving its attack cadence,
// keyed by enemy id (a single boss today, but keyed the same way as turrets).
const bossTimers = new Map<string, number>();
const TIME_BLAST_WARNING_TURNS = 2;

function pruneBossTimers(state: GameState): void {
  const liveIds = new Set(state.dungeon.enemies.map((e) => e.id));
  for (const id of bossTimers.keys()) if (!liveIds.has(id)) bossTimers.delete(id);
}

/** Marks the player's tile and its 4 neighbors; turnController.ts's Tick Phase
 * detonates them (Stun on hit) after 2 turns of warning. */
function castTimeBlast(state: GameState, enemy: Enemy): void {
  const targets = [
    { x: state.run.playerX, y: state.run.playerY },
    ...ORTHO.map(([dx, dy]) => ({ x: state.run.playerX + dx, y: state.run.playerY + dy })),
  ];
  for (const t of targets) {
    if (!inBounds(state, t.x, t.y) || !isWalkableAt(state, t.x, t.y)) continue;
    state.dungeon.telegraphTiles.push({ x: t.x, y: t.y, turnsUntil: TIME_BLAST_WARNING_TURNS });
  }
  logLine(state, `${ENEMY_NAME[enemy.kind]} channels a Time-Blast!`);
  playBossTelegraphSfx();
}

function summonGrunt(state: GameState, enemy: Enemy): void {
  for (const [dx, dy] of shuffled(ORTHO)) {
    const nx = enemy.x + dx;
    const ny = enemy.y + dy;
    if (!inBounds(state, nx, ny) || !isWalkableAt(state, nx, ny)) continue;
    if (occupiedByOtherEnemy(state, enemy, nx, ny) || (nx === state.run.playerX && ny === state.run.playerY)) continue;
    const grunt = createEnemy('BONE_GRUNT', `${enemy.id}-summon-${state.dungeon.enemies.length}-${Date.now()}`, nx, ny);
    grunt.awake = true;
    state.dungeon.enemies.push(grunt);
    logLine(state, `${ENEMY_NAME[enemy.kind]} summons a Bone-Grunt!`);
    return;
  }
}

/** Chrono-Lich: bump-attacks when adjacent, otherwise cycles between chasing,
 * a telegraphed Time-Blast, and summoning Grunt reinforcements. */
function bossAct(state: GameState, enemy: Enemy): void {
  const count = (bossTimers.get(enemy.id) ?? 0) + 1;
  bossTimers.set(enemy.id, count);

  const adjacent = Math.abs(enemy.x - state.run.playerX) + Math.abs(enemy.y - state.run.playerY) <= 1;
  if (adjacent) {
    enemyAttackPlayer(state, enemy);
    return;
  }
  if (count % 4 === 0) {
    castTimeBlast(state, enemy);
    return;
  }
  if (count % 6 === 0 && state.dungeon.enemies.length < 5) {
    summonGrunt(state, enemy);
    return;
  }
  chaseStep(state, enemy, enemy.speed, true);
}

function actEnemy(state: GameState, enemy: Enemy): void {
  const speed = enemy.status === 'CHILLED' ? Math.max(1, Math.floor(enemy.speed / 2)) : enemy.speed;
  switch (enemy.kind) {
    case 'BONE_GRUNT':
    case 'TIME_WEAVER':
      chaseStep(state, enemy, speed, true);
      break;
    case 'EMBER_BAT':
      erraticStep(state, enemy, speed);
      break;
    case 'FROST_WRAITH':
      chaseStep(state, enemy, speed, false);
      break;
    case 'VOLT_TURRET':
      turretAct(state, enemy);
      break;
    case 'CHRONO_LICH':
      bossAct(state, enemy);
      break;
  }
}

/** Runs one Enemy Phase: wake checks, Burn/Stun gating, then each awake enemy's behavior. */
export function runEnemyPhase(state: GameState): void {
  pruneTurretTimers(state);
  pruneBossTimers(state);

  for (const enemy of state.dungeon.enemies) {
    wakeIfNear(state, enemy);
    if (!enemy.awake) continue;

    if (enemy.status === 'BURN') {
      enemy.hp -= 2;
      logLine(state, `${ENEMY_NAME[enemy.kind]} burns for 2.`);
      if (enemy.hp <= 0) {
        killEnemy(state, enemy);
        continue;
      }
    }

    if (enemy.status === 'STUN') {
      logLine(state, `${ENEMY_NAME[enemy.kind]} is stunned.`);
      continue;
    }

    actEnemy(state, enemy);
  }
}
