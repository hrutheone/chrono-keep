// Enemy Phase and AI behavior.

import { createEnemy, discoverEnemy, ENEMY_NAME, scaleEnemyForNgPlus } from './content';
import type { EnemyKind } from './content';
import { applyPlayerStatus, computeDamage, enemyAttackPlayer, killEnemy, playerElement } from './combat';
import { isWalkableAt, TILE } from './mapgen';
import { miniBossRepeatNumber, STORM_CALLER_PILLARS } from './arenas';
import { totalDef } from './inventory';
import { markFloorDamageTaken } from './echoes';
import { logLine } from './turns';
import { playBossTelegraphSfx } from './audio';
import { notifyBeam, triggerScreenShake } from './animation';
import { notifyFloatingText } from './floatingText';
import { ELEMENT_COLOR } from './palette';
import type { Enemy, GameState } from './types';

/** Direct unavoidable-unless-sheltered boss damage (Supernova/Overload Rain), bypassing the normal bump-attack path. */
function dealDirectBossDamage(state: GameState, enemy: Enemy, rawAtk: number, label: string): void {
  const dmg = computeDamage(rawAtk, totalDef(state), enemy.element, playerElement(state));
  state.run.lastDamageSource = { kind: enemy.kind, element: enemy.element };
  state.run.currentHp = Math.max(0, state.run.currentHp - dmg);
  markFloorDamageTaken(state);
  logLine(state, `${label} hits you for ${dmg}!`);
  notifyFloatingText(state.run.playerX, state.run.playerY, `${dmg}`, 'damage');
  triggerScreenShake();
}

const WAKE_RADIUS = 7;
const ORTHO: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
const DIAGONAL: ReadonlyArray<readonly [number, number]> = [
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];
const ALL_8: ReadonlyArray<readonly [number, number]> = [...ORTHO, ...DIAGONAL];

// Enemy cadence counter.
const activationCounters = new Map<string, number>();

// Colossal affix turn counter.
const colossalTurnCounters = new Map<string, number>();

function pruneActivationCounters(state: GameState): void {
  const liveIds = new Set(state.dungeon.enemies.map((e) => e.id));
  for (const id of activationCounters.keys()) if (!liveIds.has(id)) activationCounters.delete(id);
  for (const id of colossalTurnCounters.keys()) if (!liveIds.has(id)) colossalTurnCounters.delete(id);
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
    discoverEnemy(state, enemy.kind);
  }
}

/** Greedy chase toward the player. */
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

/** Flees away from the player. */
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

/** Flees toward the stairs. */
function fleeTowardStairs(state: GameState, enemy: Enemy, steps: number): void {
  for (let i = 0; i < steps; i++) {
    const ddx = state.dungeon.stairsX - enemy.x;
    const ddy = state.dungeon.stairsY - enemy.y;
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

/** Toxic trail placement. */
function placeToxicTrail(state: GameState, x: number, y: number): void {
  const existing = state.dungeon.expiringTiles.find((t) => t.x === x && t.y === y);
  if (existing) existing.turnsLeft = 2;
  else state.dungeon.expiringTiles.push({ x, y, turnsLeft: 2, tileType: TILE.FROST_HAZARD });
}

/** Erratic movement. */
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

/** Skittish behavior: flees once the player is adjacent instead of bump-attacking, so it must be herded into chokepoints. */
function scarabAct(state: GameState, enemy: Enemy): void {
  const dist = Math.abs(enemy.x - state.run.playerX) + Math.abs(enemy.y - state.run.playerY);
  if (dist <= 1) {
    fleeStep(state, enemy, enemy.speed);
    return;
  }
  chaseStep(state, enemy, enemy.speed, true);
}

/** Turret behavior. */
function turretAct(state: GameState, enemy: Enemy, range = 4): void {
  const count = (activationCounters.get(enemy.id) ?? 0) + 1;
  activationCounters.set(enemy.id, count);
  if (count % 2 !== 0) return;

  const sameRow = enemy.y === state.run.playerY;
  const sameCol = enemy.x === state.run.playerX;
  if (!sameRow && !sameCol) return;
  const dx = sameRow ? Math.sign(state.run.playerX - enemy.x) : 0;
  const dy = sameCol ? Math.sign(state.run.playerY - enemy.y) : 0;

  // Track beam endpoint.
  let endX = enemy.x;
  let endY = enemy.y;
  let hit = false;
  for (let i = 1; i <= range; i++) {
    const tx = enemy.x + dx * i;
    const ty = enemy.y + dy * i;
    if (tx === state.run.playerX && ty === state.run.playerY) {
      endX = tx;
      endY = ty;
      hit = true;
      break;
    }
    if (!inBounds(state, tx, ty) || !isWalkableAt(state, tx, ty)) break;
    endX = tx;
    endY = ty;
  }
  notifyBeam(enemy.x, enemy.y, endX, endY, ELEMENT_COLOR.VOLT);
  if (hit) enemyAttackPlayer(state, enemy);
}

// Turns before telegraphed AOE detonates.
const AREA_BOMB_TELEGRAPH_TURNS = 2;

interface AreaBombOptions {
  radius: number; // 1 = 3x3, 2 = 5x5
  damageMultiplier: number;
  hazardTurns: number;
  logMessage: string;
  isBossAoe?: boolean;
}

function castAreaBomb(state: GameState, enemy: Enemy, opts: AreaBombOptions): void {
  const cx = state.run.playerX;
  const cy = state.run.playerY;
  for (let dx = -opts.radius; dx <= opts.radius; dx++) {
    for (let dy = -opts.radius; dy <= opts.radius; dy++) {
      const tx = cx + dx;
      const ty = cy + dy;
      if (!inBounds(state, tx, ty) || !isWalkableAt(state, tx, ty)) continue;
      state.dungeon.telegraphTiles.push({
        x: tx,
        y: ty,
        turnsUntil: AREA_BOMB_TELEGRAPH_TURNS,
        payload: 'fire_aoe',
        sourceAttack: Math.round(enemy.attack * opts.damageMultiplier),
        hazard: dx === 0 && dy === 0,
        hazardTurns: opts.hazardTurns,
        isBossAoe: opts.isBossAoe,
      });
    }
  }
  logLine(state, opts.logMessage);
  playBossTelegraphSfx();
}

function castFirebomb(state: GameState, enemy: Enemy): void {
  castAreaBomb(state, enemy, {
    radius: 1,
    damageMultiplier: 1,
    hazardTurns: 2,
    logMessage: `${ENEMY_NAME[enemy.kind]} lobs a firebomb at your position!`,
  });
}

/** Cast Magma Slam: a `radius`-tile square AOE centered on the player (1 = 3x3, 2 = 5x5). */
function castMagmaSlam(state: GameState, enemy: Enemy, radius: number): void {
  castAreaBomb(state, enemy, {
    radius,
    damageMultiplier: 1.5,
    hazardTurns: 3,
    logMessage: `${ENEMY_NAME[enemy.kind]} rears back for a Magma Slam!`,
    isBossAoe: true,
  });
}

/** Mk II: a cross/plus-shaped Magma Slam instead of a square. */
function castMagmaSlamCross(state: GameState, enemy: Enemy): void {
  const cx = state.run.playerX;
  const cy = state.run.playerY;
  const radius = 2;
  const seen = new Set<string>();
  for (let d = -radius; d <= radius; d++) {
    for (const [tx, ty] of [[cx + d, cy], [cx, cy + d]] as const) {
      const key = `${tx},${ty}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (!inBounds(state, tx, ty) || !isWalkableAt(state, tx, ty)) continue;
      state.dungeon.telegraphTiles.push({
        x: tx,
        y: ty,
        turnsUntil: AREA_BOMB_TELEGRAPH_TURNS,
        payload: 'fire_aoe',
        sourceAttack: Math.round(enemy.attack * 1.5),
        hazard: tx === cx && ty === cy,
        hazardTurns: 3,
        isBossAoe: true,
      });
    }
  }
  logLine(state, `${ENEMY_NAME[enemy.kind]} rears back for a Cross Magma Slam!`);
  playBossTelegraphSfx();
}

// Ember Aura: an instant (1-turn telegraph) pulse hitting the 8 tiles adjacent to the Golem itself.
const EMBER_AURA_TELEGRAPH_TURNS = 1;

/** Mk II: Ember Aura — a self-centered pulse, distinct from Magma Slam's player-centered AOE. */
function castEmberAura(state: GameState, enemy: Enemy): void {
  for (const [dx, dy] of ALL_8) {
    const tx = enemy.x + dx;
    const ty = enemy.y + dy;
    if (!inBounds(state, tx, ty) || !isWalkableAt(state, tx, ty)) continue;
    state.dungeon.telegraphTiles.push({
      x: tx,
      y: ty,
      turnsUntil: EMBER_AURA_TELEGRAPH_TURNS,
      payload: 'fire_aoe',
      sourceAttack: Math.round(enemy.attack * 0.75),
      isBossAoe: true,
    });
  }
  logLine(state, `${ENEMY_NAME[enemy.kind]}'s Ember Aura flares!`);
  playBossTelegraphSfx();
}

// Mk III Supernova: a 3-turn channel that wipes the player unless they shelter beside the spawned Obsidian Pillar.
const SUPERNOVA_CHARGE_TURNS = 3;
const SUPERNOVA_DAMAGE_MULT = 4;
const supernovaCharge = new Map<string, { turnsLeft: number; pillarX: number; pillarY: number }>();

function pruneSupernova(state: GameState): void {
  const liveIds = new Set(state.dungeon.enemies.map((e) => e.id));
  for (const id of supernovaCharge.keys()) if (!liveIds.has(id)) supernovaCharge.delete(id);
}

/** Finds a free tile near the player to raise the Obsidian Pillar on. */
function findPillarSpot(state: GameState): { x: number; y: number } | null {
  const offsets: readonly [number, number][] = [[2, 0], [-2, 0], [0, 2], [0, -2], [1, 1], [-1, -1], [1, -1], [-1, 1]];
  for (const [dx, dy] of offsets) {
    const tx = state.run.playerX + dx;
    const ty = state.run.playerY + dy;
    if (!inBounds(state, tx, ty) || !isWalkableAt(state, tx, ty)) continue;
    if (state.dungeon.enemies.some((e) => e.x === tx && e.y === ty)) continue;
    return { x: tx, y: ty };
  }
  return null;
}

function startSupernova(state: GameState, enemy: Enemy): void {
  const spot = findPillarSpot(state);
  if (!spot) return;
  state.dungeon.expiringTiles.push({ x: spot.x, y: spot.y, turnsLeft: SUPERNOVA_CHARGE_TURNS + 1, tileType: TILE.WALL });
  supernovaCharge.set(enemy.id, { turnsLeft: SUPERNOVA_CHARGE_TURNS, pillarX: spot.x, pillarY: spot.y });
  logLine(state, `${ENEMY_NAME[enemy.kind]} channels a Supernova! Shelter behind the Obsidian Pillar!`);
  playBossTelegraphSfx();
}

/** Ticks a pending Supernova. Returns true if the Golem is charging/just detonated (skip its normal action this turn). */
function tickSupernova(state: GameState, enemy: Enemy): boolean {
  const charge = supernovaCharge.get(enemy.id);
  if (!charge) return false;
  charge.turnsLeft -= 1;
  if (charge.turnsLeft > 0) return true;

  supernovaCharge.delete(enemy.id);
  const sheltered = Math.abs(state.run.playerX - charge.pillarX) <= 1 && Math.abs(state.run.playerY - charge.pillarY) <= 1;
  state.dungeon.expiringTiles = state.dungeon.expiringTiles.filter((t) => !(t.x === charge.pillarX && t.y === charge.pillarY));
  if (sheltered) {
    logLine(state, 'The Obsidian Pillar shields you from the Supernova!');
    notifyFloatingText(charge.pillarX, charge.pillarY, 'SHELTERED', 'immune');
  } else {
    dealDirectBossDamage(state, enemy, enemy.attack * SUPERNOVA_DAMAGE_MULT, 'The Supernova');
  }
  return true;
}

/** Golem behavior — Mk I/II/III moveset selected by `miniBossRepeatNumber`. */
function golemAct(state: GameState, enemy: Enemy): void {
  if (tickSupernova(state, enemy)) return;

  const count = (activationCounters.get(enemy.id) ?? 0) + 1;
  activationCounters.set(enemy.id, count);

  const adjacent = Math.abs(enemy.x - state.run.playerX) + Math.abs(enemy.y - state.run.playerY) <= 1;
  if (adjacent) {
    enemyAttackPlayer(state, enemy);
    return;
  }

  const enraged = enemy.hp <= enemy.maxHp * 0.5;
  const slamCadence = enraged ? 4 : 5;
  const repeat = miniBossRepeatNumber(state.run.currentFloor);

  if (repeat === 0) {
    if (count % slamCadence === 0) {
      castMagmaSlam(state, enemy, 1);
      return;
    }
  } else if (repeat === 1) {
    if (count % slamCadence === 0) {
      castMagmaSlamCross(state, enemy);
      return;
    }
    if (count % 4 === 0) {
      castEmberAura(state, enemy);
      return;
    }
    if (count % 7 === 0 && state.dungeon.enemies.filter((e) => e.kind === 'ASH_FIEND').length < 2) {
      summonAlly(state, enemy, 'ASH_FIEND', `${ENEMY_NAME[enemy.kind]} summons an Ash-Fiend!`);
      return;
    }
  } else {
    if (count % slamCadence === 0) {
      castMagmaSlam(state, enemy, 2);
      return;
    }
    if (count % 6 === 0) {
      startSupernova(state, enemy);
      return;
    }
    if (count % 8 === 0 && state.dungeon.enemies.filter((e) => e.kind === 'HELLFIRE_MAGUS').length < 2) {
      summonAlly(state, enemy, 'HELLFIRE_MAGUS', `${ENEMY_NAME[enemy.kind]} summons a Hellfire-Magus!`);
      return;
    }
  }

  chaseStep(state, enemy, enemy.speed, true);
}

/** Shaman behavior. */
function shamanAct(state: GameState, enemy: Enemy, castCadence = 3): void {
  const count = (activationCounters.get(enemy.id) ?? 0) + 1;
  activationCounters.set(enemy.id, count);

  const dist = Math.abs(enemy.x - state.run.playerX) + Math.abs(enemy.y - state.run.playerY);
  if (dist <= 1) enemyAttackPlayer(state, enemy);
  else if (dist < 4) fleeStep(state, enemy, enemy.speed);
  else if (dist > 6) chaseStep(state, enemy, enemy.speed, true);

  if (count % castCadence === 0) castFirebomb(state, enemy);
}

/** Chain Bolt cast: a 4-tile line that forks 90 degrees off a wall, up to `maxForks` times (Mk I: 1, Mk II/III: 2). */
function castChainBolt(state: GameState, enemy: Enemy, stunChance: number, maxForks = 1): void {
  const ddx = state.run.playerX - enemy.x;
  const ddy = state.run.playerY - enemy.y;
  let dx = 0;
  let dy = 0;
  if (Math.abs(ddx) >= Math.abs(ddy)) dx = Math.sign(ddx) || 1;
  else dy = Math.sign(ddy) || 1;

  let x = enemy.x;
  let y = enemy.y;
  const joints: { x: number; y: number }[] = [{ x, y }];
  let forksUsed = 0;
  let hitPlayer = false;
  let remaining = 4;

  while (remaining > 0) {
    const nx = x + dx;
    const ny = y + dy;
    if (!inBounds(state, nx, ny) || !isWalkableAt(state, nx, ny)) {
      if (forksUsed >= maxForks) break;
      forksUsed++;
      joints.push({ x, y });
      if (dx !== 0) {
        dy = Math.sign(state.run.playerY - y) || 1;
        dx = 0;
      } else {
        dx = Math.sign(state.run.playerX - x) || 1;
        dy = 0;
      }
      continue;
    }
    x = nx;
    y = ny;
    remaining--;
    if (x === state.run.playerX && y === state.run.playerY) {
      hitPlayer = true;
      break;
    }
  }
  joints.push({ x, y });

  for (let i = 0; i < joints.length - 1; i++) {
    notifyBeam(joints[i].x, joints[i].y, joints[i + 1].x, joints[i + 1].y, ELEMENT_COLOR.VOLT);
  }

  if (hitPlayer) {
    enemyAttackPlayer(state, enemy);
    if (Math.random() < stunChance) {
      applyPlayerStatus(state, 'STUN', 1);
      logLine(state, 'The Chain Bolt leaves you Stunned!');
    }
  } else {
    logLine(state, `${ENEMY_NAME[enemy.kind]}'s Chain Bolt crackles into the wall.`);
  }
}

// Mk II: Magnetic Pull drags the player to the nearest copper pillar and Stuns them.
const MAGNETIC_PULL_STUN_TURNS = 1;

function castMagneticPull(state: GameState, enemy: Enemy): void {
  let nearest: readonly [number, number] = STORM_CALLER_PILLARS[0];
  let best = Infinity;
  for (const pillar of STORM_CALLER_PILLARS) {
    const d = Math.abs(pillar[0] - state.run.playerX) + Math.abs(pillar[1] - state.run.playerY);
    if (d < best) {
      best = d;
      nearest = pillar;
    }
  }
  const [px, py] = nearest;
  for (const [dx, dy] of ORTHO) {
    const tx = px + dx;
    const ty = py + dy;
    if (!inBounds(state, tx, ty) || !isWalkableAt(state, tx, ty)) continue;
    if (state.dungeon.enemies.some((e) => e.x === tx && e.y === ty)) continue;
    state.run.playerX = tx;
    state.run.playerY = ty;
    break;
  }
  applyPlayerStatus(state, 'STUN', MAGNETIC_PULL_STUN_TURNS);
  logLine(state, `${ENEMY_NAME[enemy.kind]}'s Magnetic Pull drags you to the pillars!`);
  playBossTelegraphSfx();
}

// Mk III: Overload Rain — a 3-turn channel, safe only beside a surviving copper pillar. Each cast shatters one more.
const OVERLOAD_CHARGE_TURNS = 3;
const OVERLOAD_DAMAGE_MULT = 3.5;
const overloadCharge = new Map<string, number>();
const shatteredPillars = new Map<string, Set<string>>();

function pruneStormCallerState(state: GameState): void {
  const liveIds = new Set(state.dungeon.enemies.map((e) => e.id));
  for (const id of overloadCharge.keys()) if (!liveIds.has(id)) overloadCharge.delete(id);
  for (const id of shatteredPillars.keys()) if (!liveIds.has(id)) shatteredPillars.delete(id);
}

function remainingPillars(enemy: Enemy): readonly (readonly [number, number])[] {
  const shattered = shatteredPillars.get(enemy.id);
  if (!shattered) return STORM_CALLER_PILLARS;
  return STORM_CALLER_PILLARS.filter(([x, y]) => !shattered.has(`${x},${y}`));
}

function shatterOnePillar(state: GameState, enemy: Enemy): void {
  const remaining = remainingPillars(enemy);
  if (remaining.length === 0) return;
  const [x, y] = remaining[Math.floor(Math.random() * remaining.length)];
  let shattered = shatteredPillars.get(enemy.id);
  if (!shattered) {
    shattered = new Set();
    shatteredPillars.set(enemy.id, shattered);
  }
  shattered.add(`${x},${y}`);
  state.dungeon.tiles[y][x] = TILE.FLOOR;
  logLine(state, 'A copper pillar shatters — the cover thins!');
}

function startOverloadRain(state: GameState, enemy: Enemy): void {
  overloadCharge.set(enemy.id, OVERLOAD_CHARGE_TURNS);
  logLine(state, `${ENEMY_NAME[enemy.kind]} channels an Overload Rain! Get behind cover!`);
  playBossTelegraphSfx();
}

/** Ticks a pending Overload Rain. Returns true if charging/just detonated (skip the Caller's normal action). */
function tickOverloadRain(state: GameState, enemy: Enemy): boolean {
  const turnsLeft = overloadCharge.get(enemy.id);
  if (turnsLeft === undefined) return false;
  if (turnsLeft > 1) {
    overloadCharge.set(enemy.id, turnsLeft - 1);
    return true;
  }
  overloadCharge.delete(enemy.id);
  const sheltered = remainingPillars(enemy).some(
    ([px, py]) => Math.abs(px - state.run.playerX) <= 1 && Math.abs(py - state.run.playerY) <= 1,
  );
  if (sheltered) {
    logLine(state, 'You weather the Overload Rain behind cover!');
  } else {
    dealDirectBossDamage(state, enemy, enemy.attack * OVERLOAD_DAMAGE_MULT, 'The Overload Rain');
  }
  shatterOnePillar(state, enemy);
  return true;
}

/** Caller behavior — Mk I/II/III moveset selected by `miniBossRepeatNumber`. */
function callerAct(state: GameState, enemy: Enemy): void {
  const repeat = miniBossRepeatNumber(state.run.currentFloor);
  if (repeat === 2 && tickOverloadRain(state, enemy)) return;

  const count = (activationCounters.get(enemy.id) ?? 0) + 1;
  activationCounters.set(enemy.id, count);

  const adjacent = Math.abs(enemy.x - state.run.playerX) + Math.abs(enemy.y - state.run.playerY) <= 1;
  if (adjacent) {
    enemyAttackPlayer(state, enemy);
    return;
  }

  const enraged = enemy.hp <= enemy.maxHp * 0.5;

  if (repeat === 0) {
    if (count % 3 === 0) {
      castChainBolt(state, enemy, enraged ? 0.25 : 0, 1);
      return;
    }
    if (count % 5 === 0 && state.dungeon.enemies.filter((e) => e.kind === 'VOLT_HOUND').length < 2) {
      summonAlly(state, enemy, 'VOLT_HOUND', `${ENEMY_NAME[enemy.kind]} summons a Volt-Hound!`);
      return;
    }
  } else if (repeat === 1) {
    if (count % 3 === 0) {
      castChainBolt(state, enemy, 0.25, 2);
      return;
    }
    if (count % 4 === 0) {
      castMagneticPull(state, enemy);
      return;
    }
    if (count % 6 === 0 && state.dungeon.enemies.filter((e) => e.kind === 'STORM_STALKER').length < 2) {
      summonAlly(state, enemy, 'STORM_STALKER', `${ENEMY_NAME[enemy.kind]} summons a Storm-Stalker!`);
      return;
    }
  } else {
    if (count % 6 === 0) {
      startOverloadRain(state, enemy);
      return;
    }
    if (count % 3 === 0) {
      castChainBolt(state, enemy, 0.25, 2);
      return;
    }
    if (count % 5 === 0 && state.dungeon.enemies.filter((e) => e.kind === 'TESLA_COIL').length < 2) {
      summonAlly(state, enemy, 'TESLA_COIL', `${ENEMY_NAME[enemy.kind]} summons a Tesla-Coil!`);
      return;
    }
  }

  const dist = Math.abs(enemy.x - state.run.playerX) + Math.abs(enemy.y - state.run.playerY);
  if (dist < 4) fleeStep(state, enemy, enemy.speed);
  else if (dist > 6) chaseStep(state, enemy, enemy.speed, true);
}

// Frost pulse telegraph duration.
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

/** Sentinel behavior. */
function sentinelAct(state: GameState, enemy: Enemy): void {
  const count = (activationCounters.get(enemy.id) ?? 0) + 1;
  activationCounters.set(enemy.id, count);
  if (count % 2 !== 0) return;
  castFrostPulse(state, enemy);
}

/** Blizzard Pulse: a stationary 3x3 square AOE centered on self, instead of a cross. */
function castBlizzardPulse(state: GameState, enemy: Enemy): void {
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      if (dx === 0 && dy === 0) continue;
      const tx = enemy.x + dx;
      const ty = enemy.y + dy;
      if (!inBounds(state, tx, ty) || !isWalkableAt(state, tx, ty)) continue;
      state.dungeon.telegraphTiles.push({
        x: tx,
        y: ty,
        turnsUntil: FROST_PULSE_TELEGRAPH_TURNS,
        payload: 'chill_pulse',
        sourceAttack: enemy.attack,
      });
    }
  }
  logLine(state, `${ENEMY_NAME[enemy.kind]} channels a blizzard pulse!`);
  playBossTelegraphSfx();
}

/** Monolith behavior. */
function monolithAct(state: GameState, enemy: Enemy): void {
  const count = (activationCounters.get(enemy.id) ?? 0) + 1;
  activationCounters.set(enemy.id, count);
  if (count % 2 !== 0) return;
  castBlizzardPulse(state, enemy);
}

/** Frozen Sweep cast. */
function castFrozenSweep(state: GameState, enemy: Enemy): void {
  const hitsPlayer = ALL_8.some(([dx, dy]) => enemy.x + dx === state.run.playerX && enemy.y + dy === state.run.playerY);
  if (!hitsPlayer) return;
  enemyAttackPlayer(state, enemy);
  if (Math.random() < 0.5) {
    applyPlayerStatus(state, 'CHILLED', 3);
    logLine(state, 'The Frozen Sweep chills you!');
  }
}

// Ice Barricade durations.
const ICE_BARRICADE_TURNS = 5;
const ICE_BARRICADE_PERMANENT_TURNS = 999;

/** Cast Ice Barricade. */
function castIceBarricade(state: GameState, enemy: Enemy): void {
  const ddx = state.run.playerX - enemy.x;
  const ddy = state.run.playerY - enemy.y;
  const dx = Math.abs(ddx) >= Math.abs(ddy) ? Math.sign(ddx) || 1 : 0;
  const dy = dx === 0 ? Math.sign(ddy) || 1 : 0;
  // The 3-tile segment runs perpendicular.
  const px = dx === 0 ? 1 : 0;
  const py = dy === 0 ? 1 : 0;

  const centerX = state.run.playerX + dx;
  const centerY = state.run.playerY + dy;
  const permanent = miniBossRepeatNumber(state.run.currentFloor) >= 2;
  const turns = permanent ? ICE_BARRICADE_PERMANENT_TURNS : ICE_BARRICADE_TURNS;

  for (let i = -1; i <= 1; i++) {
    const tx = centerX + px * i;
    const ty = centerY + py * i;
    if (!inBounds(state, tx, ty)) continue;
    if (tx === state.run.playerX && ty === state.run.playerY) continue;
    const existing = state.dungeon.expiringTiles.find((t) => t.x === tx && t.y === ty);
    if (existing) existing.turnsLeft = turns;
    else state.dungeon.expiringTiles.push({ x: tx, y: ty, turnsLeft: turns, tileType: TILE.WALL });
  }
  logLine(state, `${ENEMY_NAME[enemy.kind]} raises an Ice-Barricade!`);
  playBossTelegraphSfx();
}

/** Doom-Guard behavior: below 50% HP, its Speed permanently rises to 2. */
function doomGuardAct(state: GameState, enemy: Enemy): void {
  const speed = enemy.status === 'CHILLED' ? Math.max(1, Math.floor(enemy.speed / 2)) : enemy.speed;
  const enraged = enemy.hp <= enemy.maxHp * 0.5;
  chaseStep(state, enemy, enraged ? 2 : speed, true);
}

// Mk II: Glacial Lunge — a straight-line charge that smashes Ice-Barricades and slides the player back on impact.
const LUNGE_MAX_RANGE = 6;
const LUNGE_SLIDE_TILES = 2;

function castGlacialLunge(state: GameState, enemy: Enemy): void {
  const ddx = state.run.playerX - enemy.x;
  const ddy = state.run.playerY - enemy.y;
  if (ddx !== 0 && ddy !== 0) return; // Only lines up on a clean orthogonal lane.
  const dx = Math.sign(ddx);
  const dy = Math.sign(ddy);
  if (dx === 0 && dy === 0) return;

  logLine(state, `${ENEMY_NAME[enemy.kind]} charges into a Glacial Lunge!`);
  playBossTelegraphSfx();

  let x = enemy.x;
  let y = enemy.y;
  let hit = false;
  for (let i = 0; i < LUNGE_MAX_RANGE; i++) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx === state.run.playerX && ny === state.run.playerY) {
      hit = true;
      break;
    }
    const barricade = state.dungeon.expiringTiles.find((t) => t.x === nx && t.y === ny && t.tileType === TILE.WALL);
    if (barricade) {
      state.dungeon.expiringTiles = state.dungeon.expiringTiles.filter((t) => t !== barricade);
      logLine(state, 'The Lunge smashes through an Ice-Barricade!');
    } else if (!inBounds(state, nx, ny) || !isWalkableAt(state, nx, ny)) {
      break;
    }
    x = nx;
    y = ny;
  }
  enemy.x = x;
  enemy.y = y;

  if (!hit) return;
  enemyAttackPlayer(state, enemy);
  for (let i = 0; i < LUNGE_SLIDE_TILES; i++) {
    const nx = state.run.playerX + dx;
    const ny = state.run.playerY + dy;
    if (!inBounds(state, nx, ny) || !isWalkableAt(state, nx, ny)) break;
    if (state.dungeon.enemies.some((e) => e.x === nx && e.y === ny)) break;
    state.run.playerX = nx;
    state.run.playerY = ny;
  }
  logLine(state, 'You slide across the ice!');
}

/** Knight behavior — Mk I/II/III moveset selected by `miniBossRepeatNumber`. */
function knightAct(state: GameState, enemy: Enemy): void {
  const repeat = miniBossRepeatNumber(state.run.currentFloor);
  const count = (activationCounters.get(enemy.id) ?? 0) + 1;
  activationCounters.set(enemy.id, count);

  if (repeat >= 1) {
    if (count % 5 === 0) {
      castGlacialLunge(state, enemy);
      return;
    }
    const summonKind: EnemyKind = repeat >= 2 ? 'GLACIAL_MONOLITH' : 'VOID_SPIRIT';
    if (count % 8 === 0 && state.dungeon.enemies.filter((e) => e.kind === summonKind).length < 2) {
      summonAlly(state, enemy, summonKind, `${ENEMY_NAME[enemy.kind]} summons a ${ENEMY_NAME[summonKind]}!`);
      return;
    }
  }

  const specialFired = count % 3 === 0 || count % 6 === 0;
  if (count % 3 === 0) castFrozenSweep(state, enemy);
  if (count % 6 === 0) castIceBarricade(state, enemy);
  if (specialFired) return;

  const adjacent = Math.abs(enemy.x - state.run.playerX) + Math.abs(enemy.y - state.run.playerY) <= 1;
  if (adjacent) {
    enemyAttackPlayer(state, enemy);
    return;
  }

  // Speed modifications.
  const baseSpeed = enemy.status === 'CHILLED' ? Math.max(1, Math.floor(enemy.speed / 2)) : enemy.speed;
  const enraged = enemy.hp <= enemy.maxHp * 0.5;
  const speed = enraged && state.run.status === 'CHILLED' ? baseSpeed + 1 : baseSpeed;
  chaseStep(state, enemy, speed, true);
}

// Chrono-Lich attack cadence timers.
const bossTimers = new Map<string, number>();
const TIME_BLAST_WARNING_TURNS = 2;

// Rewind state.
const bossRewindPending = new Map<string, number>();
const bossRewindUsed = new Set<string>();
const REWIND_WARNING_TURNS = 2;

function pruneBossTimers(state: GameState): void {
  const liveIds = new Set(state.dungeon.enemies.map((e) => e.id));
  for (const id of bossTimers.keys()) if (!liveIds.has(id)) bossTimers.delete(id);
  for (const id of bossRewindPending.keys()) if (!liveIds.has(id)) bossRewindPending.delete(id);
  for (const id of bossRewindUsed) if (!liveIds.has(id)) bossRewindUsed.delete(id);
}

/** Resets boss state for a new attempt. */
export function resetChronoLichEncounter(id: string): void {
  bossTimers.delete(id);
  bossRewindPending.delete(id);
  bossRewindUsed.delete(id);
}

/** Ticks pending rewind. */
export function tickBossRewind(state: GameState): void {
  for (const enemy of state.dungeon.enemies) {
    if (enemy.kind !== 'CHRONO_LICH') continue;
    const pending = bossRewindPending.get(enemy.id);
    if (pending === undefined) continue;
    const next = pending - 1;
    if (next > 0) {
      bossRewindPending.set(enemy.id, next);
      continue;
    }
    bossRewindPending.delete(enemy.id);
    if (enemy.status === 'STUN') {
      logLine(state, `${ENEMY_NAME[enemy.kind]}'s Rewind unravels — interrupted!`);
      continue;
    }
    const healed = Math.round(enemy.maxHp * 0.15);
    enemy.hp = Math.min(enemy.maxHp, enemy.hp + healed);
    state.run.turnsRemaining = Math.max(0, state.run.turnsRemaining - 10);
    logLine(state, `${ENEMY_NAME[enemy.kind]} rewinds time — healing ${healed} HP and stealing 10 Turns!`);
  }
}

/** Cast Time Blast. */
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
      sourceAttack: enemy.attack,
      isBossAoe: true,
    });
  }
  logLine(state, `${ENEMY_NAME[enemy.kind]} channels a Time-Blast!`);
  playBossTelegraphSfx();
}

/** Summons an ally enemy. */
function summonAlly(state: GameState, enemy: Enemy, kind: EnemyKind, message: string): void {
  for (const [dx, dy] of shuffled(ORTHO)) {
    const nx = enemy.x + dx;
    const ny = enemy.y + dy;
    if (!inBounds(state, nx, ny) || !isWalkableAt(state, nx, ny)) continue;
    if (occupiedByOtherEnemy(state, enemy, nx, ny) || (nx === state.run.playerX && ny === state.run.playerY)) continue;
    const ally = createEnemy(kind, `${enemy.id}-summon-${state.dungeon.enemies.length}-${Date.now()}`, nx, ny);
    ally.awake = true;
    scaleEnemyForNgPlus(ally, state.persistent.ngPlusLevel);
    state.dungeon.enemies.push(ally);
    logLine(state, message);
    return;
  }
}

/** Chrono-Lich behavior. */
function bossAct(state: GameState, enemy: Enemy): void {
  const count = (bossTimers.get(enemy.id) ?? 0) + 1;
  bossTimers.set(enemy.id, count);

  const adjacent = Math.abs(enemy.x - state.run.playerX) + Math.abs(enemy.y - state.run.playerY) <= 1;
  if (adjacent) {
    enemyAttackPlayer(state, enemy);
    return;
  }

  // One-time Rewind cast.
  if (!bossRewindUsed.has(enemy.id) && enemy.hp <= enemy.maxHp * 0.25) {
    bossRewindUsed.add(enemy.id);
    bossRewindPending.set(enemy.id, REWIND_WARNING_TURNS);
    logLine(state, `${ENEMY_NAME[enemy.kind]} begins to unravel time itself!`);
    playBossTelegraphSfx();
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
    summonAlly(state, enemy, 'BONE_GRUNT', `${ENEMY_NAME[enemy.kind]} summons a Bone-Grunt!`);
    return;
  }
  chaseStep(state, enemy, enemy.speed, true);
}

function actEnemy(state: GameState, enemy: Enemy): void {
  // Colossal turn skip.
  if (enemy.affix === 'colossal') {
    const count = (colossalTurnCounters.get(enemy.id) ?? 0) + 1;
    colossalTurnCounters.set(enemy.id, count);
    if (count % 2 === 1) return;
  }

  // Wealthy escape behavior.
  if (enemy.affix === 'wealthy') {
    fleeTowardStairs(state, enemy, enemy.speed || 1);
    return;
  }

  const speed = enemy.status === 'CHILLED' ? Math.max(1, Math.floor(enemy.speed / 2)) : enemy.speed;
  switch (enemy.kind) {
    case 'BONE_GRUNT':
    case 'TIME_WEAVER':
    case 'BONE_KNIGHT':
    case 'VOLT_HOUND':
    case 'DREAD_LEGION':
    case 'STORM_STALKER':
      chaseStep(state, enemy, speed, !enemy.isShadowWarden);
      break;
    case 'CLOCKWORK_SCARAB':
      scarabAct(state, enemy);
      break;
    case 'EMBER_BAT':
    case 'ASH_FIEND':
      erraticStep(state, enemy, speed);
      break;
    case 'FROST_WRAITH':
    case 'VOID_SPIRIT':
      chaseStep(state, enemy, speed, false);
      break;
    case 'VOLT_TURRET':
      turretAct(state, enemy, 4);
      break;
    case 'TESLA_COIL':
      turretAct(state, enemy, 8);
      break;
    case 'CINDER_SHAMAN':
      shamanAct(state, enemy, 3);
      break;
    case 'HELLFIRE_MAGUS':
      shamanAct(state, enemy, 2);
      break;
    case 'FROST_SENTINEL':
      sentinelAct(state, enemy);
      break;
    case 'GLACIAL_MONOLITH':
      monolithAct(state, enemy);
      break;
    case 'DOOM_GUARD':
      doomGuardAct(state, enemy);
      break;
    case 'INFERNO_GOLEM':
      golemAct(state, enemy);
      break;
    case 'STORM_CALLER':
      callerAct(state, enemy);
      break;
    case 'GLACIAL_KNIGHT':
      knightAct(state, enemy);
      break;
    case 'CHRONO_LICH':
      bossAct(state, enemy);
      break;
  }
}

/** Executes the Enemy Phase. */
export function runEnemyPhase(state: GameState): void {
  pruneActivationCounters(state);
  pruneBossTimers(state);
  pruneSupernova(state);
  pruneStormCallerState(state);

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

    const beforeX = enemy.x;
    const beforeY = enemy.y;
    actEnemy(state, enemy);

    // Toxic trail on step.
    if (enemy.affix === 'toxic' && (enemy.x !== beforeX || enemy.y !== beforeY)) {
      placeToxicTrail(state, beforeX, beforeY);
    }

    // Wealthy escape check.
    if (enemy.affix === 'wealthy' && enemy.x === state.dungeon.stairsX && enemy.y === state.dungeon.stairsY) {
      state.dungeon.enemies = state.dungeon.enemies.filter((e) => e.id !== enemy.id);
      logLine(state, `${ENEMY_NAME[enemy.kind]} escapes down the Stairs with its hoard!`);
    }
  }
}
