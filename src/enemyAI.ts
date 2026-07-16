// Enemy Phase (GDD Sections 6C & 7): wake radius, per-kind behavior, and the
// status effects that gate a turn (Burn tick, Stun skip, Chilled half-speed).

import { createEnemy, ENEMY_NAME, scaleEnemyForNgPlus } from './content';
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

// Per-id "every Nth activation" cadence counter, pruned each phase. Shared by
// every enemy whose behavior fires on a fixed cycle rather than every turn —
// Volt-Turret (every 2nd), Cinder-Shaman (every 3rd), Frost-Sentinel (every
// 2nd) — since it's the same counting pattern regardless of what it gates.
const activationCounters = new Map<string, number>();

function pruneActivationCounters(state: GameState): void {
  const liveIds = new Set(state.dungeon.enemies.map((e) => e.id));
  for (const id of activationCounters.keys()) if (!liveIds.has(id)) activationCounters.delete(id);
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
    // Fun & Feel #1: the Bestiary tab only shows what's actually been fought.
    if (!state.persistent.bestiaryKnown.includes(enemy.kind)) state.persistent.bestiaryKnown.push(enemy.kind);
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

/** Cinder-Shaman's kite (Phase 14): the mirror of chaseStep — steps AWAY from
 * the player along the longer axis first, never attacking (fleeing should
 * never accidentally bump into the player) and never stepping onto them. */
function fleeStep(state: GameState, enemy: Enemy, steps: number): void {
  for (let i = 0; i < steps; i++) {
    const ddx = enemy.x - state.run.playerX;
    const ddy = enemy.y - state.run.playerY;
    const stepX: readonly [number, number] = [Math.sign(ddx), 0];
    const stepY: readonly [number, number] = [0, Math.sign(ddy)];
    const attempts = Math.abs(ddx) >= Math.abs(ddy) ? [stepX, stepY] : [stepY, stepX];

    let moved = false;
    for (const [ax, ay] of attempts) {
      if (ax === 0 && ay === 0) continue;
      const nx = enemy.x + ax;
      const ny = enemy.y + ay;
      if (nx === state.run.playerX && ny === state.run.playerY) continue;
      if (!inBounds(state, nx, ny) || !isWalkableAt(state, nx, ny)) continue;
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
  const count = (activationCounters.get(enemy.id) ?? 0) + 1;
  activationCounters.set(enemy.id, count);
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

// Cinder-Shaman's firebomb (Section 6C, Phase 14): a 1-turn telegraph on the
// player's CURRENT tile + its 3x3 neighborhood, matching the GDD's spelled-
// out "after a 1-turn telegraph, it detonates in a 3x3 area" wording. Set to
// 2, not 1: tickTelegraphTiles decrements a freshly-cast entry in the SAME
// resolvePlayerTurn call that created it (see Chrono-Lich's identically-
// shaped TIME_BLAST_WARNING_TURNS below), so turnsUntil=1 would detonate
// with zero visible warning — 2 gives exactly one real turn to react.
const FIREBOMB_TELEGRAPH_TURNS = 2;

function castFirebomb(state: GameState, enemy: Enemy): void {
  const cx = state.run.playerX;
  const cy = state.run.playerY;
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const tx = cx + dx;
      const ty = cy + dy;
      if (!inBounds(state, tx, ty) || !isWalkableAt(state, tx, ty)) continue;
      state.dungeon.telegraphTiles.push({
        x: tx,
        y: ty,
        turnsUntil: FIREBOMB_TELEGRAPH_TURNS,
        payload: 'fire_aoe',
        sourceAttack: enemy.attack,
        hazard: dx === 0 && dy === 0, // only the center tile keeps burning afterward
      });
    }
  }
  logLine(state, `${ENEMY_NAME[enemy.kind]} lobs a firebomb at your position!`);
  playBossTelegraphSfx();
}

/** Cinder-Shaman: kites to keep 4-6 tiles from the player (fleeing below 4,
 * closing in past 6 so it isn't stranded off-screen after waking), lobbing
 * its telegraphed firebomb every 3rd activation regardless of exact range —
 * the GDD's behavior text ties the bomb to a turn cadence, not a distance
 * check, unlike Volt-Turret's line shot. */
function shamanAct(state: GameState, enemy: Enemy): void {
  const count = (activationCounters.get(enemy.id) ?? 0) + 1;
  activationCounters.set(enemy.id, count);

  const dist = Math.abs(enemy.x - state.run.playerX) + Math.abs(enemy.y - state.run.playerY);
  if (dist <= 1) enemyAttackPlayer(state, enemy);
  else if (dist < 4) fleeStep(state, enemy, enemy.speed);
  else if (dist > 6) chaseStep(state, enemy, enemy.speed, true);

  if (count % 3 === 0) castFirebomb(state, enemy);
}

// Frost-Sentinel's cross pulse (Section 6C, Phase 14): same 1-turn telegraph
// treatment as the firebomb above — the GDD doesn't spell one out for this
// enemy, but firing a 12-tile AOE with zero warning read as an unfair
// "gotcha" in testing, and the Bestiary-facing acceptance bar for this phase
// wants every new AOE to read clearly before it lands. 2, not 1 — see
// FIREBOMB_TELEGRAPH_TURNS's comment for why.
const FROST_PULSE_TELEGRAPH_TURNS = 2;

function castFrostPulse(state: GameState, enemy: Enemy): void {
  for (const [dx, dy] of ORTHO) {
    for (let i = 1; i <= 3; i++) {
      const tx = enemy.x + dx * i;
      const ty = enemy.y + dy * i;
      if (!inBounds(state, tx, ty) || !isWalkableAt(state, tx, ty)) break;
      state.dungeon.telegraphTiles.push({
        x: tx,
        y: ty,
        turnsUntil: FROST_PULSE_TELEGRAPH_TURNS,
        payload: 'chill_pulse',
        sourceAttack: enemy.attack,
      });
    }
  }
  logLine(state, `${ENEMY_NAME[enemy.kind]} channels a frost pulse!`);
  playBossTelegraphSfx();
}

/** Frost-Sentinel: stationary, fires its cross pulse every 2nd activation. */
function sentinelAct(state: GameState, enemy: Enemy): void {
  const count = (activationCounters.get(enemy.id) ?? 0) + 1;
  activationCounters.set(enemy.id, count);
  if (count % 2 !== 0) return;
  castFrostPulse(state, enemy);
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
    state.dungeon.telegraphTiles.push({
      x: t.x,
      y: t.y,
      turnsUntil: TIME_BLAST_WARNING_TURNS,
      payload: 'stun',
      sourceAttack: enemy.attack, // unused by the 'stun' payload, kept for a uniform shape
    });
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
    scaleEnemyForNgPlus(grunt, state.persistent.ngPlusLevel);
    state.dungeon.enemies.push(grunt);
    logLine(state, `${ENEMY_NAME[enemy.kind]} summons a Bone-Grunt!`);
    return;
  }
}

/** Chrono-Lich: bump-attacks when adjacent, otherwise cycles between chasing,
 * a telegraphed Time-Blast, and summoning Grunt reinforcements. Fun & Feel
 * #3: below 50% HP the pattern tightens (an "enrage" phase, since the fight
 * would otherwise run its whole length on one flat cadence), and a small
 * random skip keeps the exact turn-count pattern from being purely
 * memorized loop after loop. */
function bossAct(state: GameState, enemy: Enemy): void {
  const count = (bossTimers.get(enemy.id) ?? 0) + 1;
  bossTimers.set(enemy.id, count);

  const adjacent = Math.abs(enemy.x - state.run.playerX) + Math.abs(enemy.y - state.run.playerY) <= 1;
  if (adjacent) {
    enemyAttackPlayer(state, enemy);
    return;
  }

  const enraged = enemy.hp <= enemy.maxHp * 0.5;
  const blastCadence = enraged ? 3 : 4;
  const summonCadence = enraged ? 4 : 6;
  const summonCap = enraged ? 6 : 5;
  const jitter = Math.random() < 0.2 ? (Math.random() < 0.5 ? -1 : 1) : 0;

  if ((count + jitter) % blastCadence === 0) {
    castTimeBlast(state, enemy);
    return;
  }
  if ((count + jitter) % summonCadence === 0 && state.dungeon.enemies.length < summonCap) {
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
    case 'BONE_KNIGHT': // Phase 14: DEF 6 is a stat-only wall, no AI difference from Bone-Grunt.
    case 'VOLT_HOUND': // Phase 14: speed 2 chase; the 25% Stun-on-hit lives in combat.ts.
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
    case 'CINDER_SHAMAN':
      shamanAct(state, enemy);
      break;
    case 'FROST_SENTINEL':
      sentinelAct(state, enemy);
      break;
    case 'CHRONO_LICH':
      bossAct(state, enemy);
      break;
  }
}

/** Runs one Enemy Phase: wake checks, Burn/Stun gating, then each awake enemy's behavior. */
export function runEnemyPhase(state: GameState): void {
  pruneActivationCounters(state);
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
