// Enemy Phase (GDD Sections 6C & 7): wake radius, per-kind behavior, and the
// status effects that gate a turn (Burn tick, Stun skip, Chilled half-speed).

import { createEnemy, ENEMY_NAME, scaleEnemyForNgPlus } from './content';
import type { EnemyKind } from './content';
import { applyPlayerStatus, enemyAttackPlayer, killEnemy } from './combat';
import { isWalkableAt, TILE } from './mapgen';
import { miniBossRepeatNumber } from './arenas';
import { logLine } from './turns';
import { playBossTelegraphSfx } from './audio';
import { notifyBeam } from './animation';
import { ELEMENT_COLOR } from './palette';
import type { Enemy, GameState } from './types';

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

// Per-id "every Nth activation" cadence counter, pruned each phase. Shared by
// every enemy whose behavior fires on a fixed cycle rather than every turn —
// Volt-Turret (every 2nd), Cinder-Shaman (every 3rd), Frost-Sentinel (every
// 2nd) — since it's the same counting pattern regardless of what it gates.
const activationCounters = new Map<string, number>();

// [Colossal] Elite Affix (Phase 19): a separate counter from activationCounters
// above — Colossal can roll on a kind (Volt-Turret, Cinder-Shaman, Frost-
// Sentinel) that already uses activationCounters for its own cadence, and
// sharing one counter between "does this turn even happen" and "is this the
// turn my ability fires" would corrupt both.
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

/** [Wealthy] Elite Affix (Phase 19): flees toward the floor's Stairs instead
 * of engaging the player at all — the mirror of chaseStep, but the target is
 * `dungeon.stairsX/Y` instead of the player's position, and it never
 * attacks (matches fleeStep's "fleeing should never bump into anyone" rule,
 * here extended to bumping the player too, not just avoiding them). */
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

/** [Toxic] Elite Affix (Phase 19) support: leaves a short-lived Frost-Hazard-
 * type expiring tile (1 direct DEF-piercing HP per turn standing on it — see
 * turnController.ts's applyFrostHazard) at the tile it just stepped off of,
 * reusing the mechanic Scourge's skill hazard already implements rather than
 * inventing a distinct "Poison" tile type/damage path for one Elite affix. */
function placeToxicTrail(state: GameState, x: number, y: number): void {
  const existing = state.dungeon.expiringTiles.find((t) => t.x === x && t.y === y);
  if (existing) existing.turnsLeft = 2;
  else state.dungeon.expiringTiles.push({ x, y, turnsLeft: 2, tileType: TILE.FROST_HAZARD });
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

  // Track the line's actual endpoint (the player's tile on a hit, otherwise
  // the last open tile before a wall/bound) so the beam VFX below reads as a
  // real shot along the line, not a melee lunge toward a far-off target.
  let endX = enemy.x;
  let endY = enemy.y;
  let hit = false;
  for (let i = 1; i <= 4; i++) {
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

// Telegraphed fire AOE, centered on the player's CURRENT tile (GDD's spelled-
// out "after a 1-turn telegraph, it detonates" wording — Cinder-Shaman's
// firebomb, Phase 14, and Inferno-Golem's Magma Slam, Phase 15, are the same
// mechanic at different radius/damage/hazard-duration). Turns is 2, not 1:
// tickTelegraphTiles decrements a freshly-cast entry in the SAME
// resolvePlayerTurn call that created it (see Chrono-Lich's identically-
// shaped TIME_BLAST_WARNING_TURNS below), so turnsUntil=1 would detonate
// with zero visible warning — 2 gives exactly one real turn to react.
const AREA_BOMB_TELEGRAPH_TURNS = 2;

interface AreaBombOptions {
  radius: number; // 1 = 3x3, 2 = 5x5
  damageMultiplier: number;
  hazardTurns: number;
  logMessage: string;
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
        hazard: dx === 0 && dy === 0, // only the center tile keeps burning afterward
        hazardTurns: opts.hazardTurns,
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

/** Inferno-Golem's Magma Slam (Section 6C, Phase 15): 1.5x ATK, a 3-turn Fire
 * Hazard on the center tile — Mk II+ (F40+) widens it to a 5x5 per the GDD's
 * "Mk II Golem's slam is 5x5" twist. */
function castMagmaSlam(state: GameState, enemy: Enemy): void {
  const radius = miniBossRepeatNumber(state.run.currentFloor) >= 1 ? 2 : 1;
  castAreaBomb(state, enemy, {
    radius,
    damageMultiplier: 1.5,
    hazardTurns: 3,
    logMessage: `${ENEMY_NAME[enemy.kind]} rears back for a Magma Slam!`,
  });
}

/** Inferno-Golem: slow relentless chaser; every 5th turn (every 4th below
 * 50% HP) unleashes Magma Slam instead of moving — same adjacent-bump-first
 * shape as the Chrono-Lich's bossAct below. Balance nerf (first player
 * feedback on this fight): was every 4th/3rd — too little room between
 * casts for a normal melee/ranged exchange, especially once enraged, when
 * a player fighting at range could barely land 2 clean actions before the
 * next telegraph went up. */
function golemAct(state: GameState, enemy: Enemy): void {
  const count = (activationCounters.get(enemy.id) ?? 0) + 1;
  activationCounters.set(enemy.id, count);

  const adjacent = Math.abs(enemy.x - state.run.playerX) + Math.abs(enemy.y - state.run.playerY) <= 1;
  if (adjacent) {
    enemyAttackPlayer(state, enemy);
    return;
  }

  const enraged = enemy.hp <= enemy.maxHp * 0.5;
  const slamCadence = enraged ? 4 : 5;
  if (count % slamCadence === 0) {
    castMagmaSlam(state, enemy);
    return;
  }
  chaseStep(state, enemy, enemy.speed, true);
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

/** Storm-Caller's Chain Bolt (Section 6C, Phase 15): a 4-tile Volt line that
 * forks 90° once off the first wall it hits. Aims along whichever axis has
 * the larger offset to the player (chaseStep's own tie-break), forks toward
 * the player's remaining offset on the perpendicular axis, then keeps
 * traveling until it either hits the player, runs out of its 4-tile budget,
 * or hits a second wall. Draws as one or two `notifyBeam` segments (Skill/
 * Attack VFX) — the fork point splits them when a fork actually happens. */
function castChainBolt(state: GameState, enemy: Enemy, stunChance: number): void {
  const ddx = state.run.playerX - enemy.x;
  const ddy = state.run.playerY - enemy.y;
  let dx = 0;
  let dy = 0;
  if (Math.abs(ddx) >= Math.abs(ddy)) dx = Math.sign(ddx) || 1;
  else dy = Math.sign(ddy) || 1;

  let x = enemy.x;
  let y = enemy.y;
  let forkX = enemy.x;
  let forkY = enemy.y;
  let forked = false;
  let hitPlayer = false;
  let remaining = 4;

  while (remaining > 0) {
    const nx = x + dx;
    const ny = y + dy;
    if (!inBounds(state, nx, ny) || !isWalkableAt(state, nx, ny)) {
      if (forked) break; // a second wall — the bolt just stops here
      forked = true;
      forkX = x;
      forkY = y;
      if (dx !== 0) {
        dy = Math.sign(state.run.playerY - y) || 1;
        dx = 0;
      } else {
        dx = Math.sign(state.run.playerX - x) || 1;
        dy = 0;
      }
      continue; // retry from (x, y) along the new axis — the fork itself doesn't spend a tile
    }
    x = nx;
    y = ny;
    remaining--;
    if (x === state.run.playerX && y === state.run.playerY) {
      hitPlayer = true;
      break;
    }
  }

  if (forked) {
    notifyBeam(enemy.x, enemy.y, forkX, forkY, ELEMENT_COLOR.VOLT);
    notifyBeam(forkX, forkY, x, y, ELEMENT_COLOR.VOLT);
  } else {
    notifyBeam(enemy.x, enemy.y, x, y, ELEMENT_COLOR.VOLT);
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

/** Storm-Caller: keeps mid-range (reusing Cinder-Shaman's 4-6 tile band — the
 * GDD only says "mid-range" for this one, no exact figure, so this is a
 * design call, not a spec transcription). Every 3rd turn: Chain Bolt (+25%
 * Stun below 50% HP). Every 5th turn: summons a pack-mate, capped at 2 alive
 * — Volt-Hound on its Mk I (F20) appearance, Frost-Sentinel from Mk II (F50)
 * onward per the GDD's "Mk II Storm-Caller summons Frost-Sentinels" twist
 * (kept for Mk III too — once introduced, no reason to revert it). */
function callerAct(state: GameState, enemy: Enemy): void {
  const count = (activationCounters.get(enemy.id) ?? 0) + 1;
  activationCounters.set(enemy.id, count);

  const adjacent = Math.abs(enemy.x - state.run.playerX) + Math.abs(enemy.y - state.run.playerY) <= 1;
  if (adjacent) {
    enemyAttackPlayer(state, enemy);
    return;
  }

  const enraged = enemy.hp <= enemy.maxHp * 0.5;
  if (count % 3 === 0) {
    castChainBolt(state, enemy, enraged ? 0.25 : 0);
    return;
  }
  if (count % 5 === 0) {
    const summonKind: EnemyKind = miniBossRepeatNumber(state.run.currentFloor) >= 1 ? 'FROST_SENTINEL' : 'VOLT_HOUND';
    const alive = state.dungeon.enemies.filter((e) => e.kind === summonKind).length;
    if (alive < 2) {
      summonAlly(state, enemy, summonKind, `${ENEMY_NAME[enemy.kind]} summons a ${ENEMY_NAME[summonKind]}!`);
      return;
    }
  }

  const dist = Math.abs(enemy.x - state.run.playerX) + Math.abs(enemy.y - state.run.playerY);
  if (dist < 4) fleeStep(state, enemy, enemy.speed);
  else if (dist > 6) chaseStep(state, enemy, enemy.speed, true);
}

// Frost-Sentinel's cross pulse (Section 6C, Phase 14): same 1-turn telegraph
// treatment as the firebomb above — the GDD doesn't spell one out for this
// enemy, but firing a 12-tile AOE with zero warning read as an unfair
// "gotcha" in testing, and the Bestiary-facing acceptance bar for this phase
// wants every new AOE to read clearly before it lands. 2, not 1 — see
// AREA_BOMB_TELEGRAPH_TURNS's comment for why.
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

/** Glacial-Knight's Frozen Sweep (Section 6C, Phase 15): all 8 adjacent
 * tiles, instant (the GDD doesn't call out a telegraph for this one, unlike
 * Magma Slam/Chain Bolt — it's melee-range, a warning wouldn't add much
 * reactable space). A no-op if the player isn't actually adjacent this turn. */
function castFrozenSweep(state: GameState, enemy: Enemy): void {
  const hitsPlayer = ALL_8.some(([dx, dy]) => enemy.x + dx === state.run.playerX && enemy.y + dy === state.run.playerY);
  if (!hitsPlayer) return;
  enemyAttackPlayer(state, enemy);
  if (Math.random() < 0.5) {
    applyPlayerStatus(state, 'CHILLED', 3);
    logLine(state, 'The Frozen Sweep chills you!');
  }
}

// A very large (not literally infinite) turnsLeft stands in for "doesn't
// melt" (Mk III Knight's twist) — the fight is always over long before this
// many turns pass, and expiringTiles has no dedicated "permanent" concept.
const ICE_BARRICADE_TURNS = 5;
const ICE_BARRICADE_PERMANENT_TURNS = 999;

/** Glacial-Knight's Ice-Barricade (Section 6C, Phase 15): a 3-tile wall
 * segment placed just past the player (from the Knight's side), cutting off
 * a retreat lane — an expiringTiles overlay (isWalkableAt already blocks
 * movement through it for free), melting in 5 turns except on the Mk III
 * (F70+) twist, where it doesn't. */
function castIceBarricade(state: GameState, enemy: Enemy): void {
  const ddx = state.run.playerX - enemy.x;
  const ddy = state.run.playerY - enemy.y;
  const dx = Math.abs(ddx) >= Math.abs(ddy) ? Math.sign(ddx) || 1 : 0;
  const dy = dx === 0 ? Math.sign(ddy) || 1 : 0;
  // The 3-tile segment runs perpendicular to the Knight->player axis.
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
    if (tx === state.run.playerX && ty === state.run.playerY) continue; // never wall the player in
    const existing = state.dungeon.expiringTiles.find((t) => t.x === tx && t.y === ty);
    if (existing) existing.turnsLeft = turns;
    else state.dungeon.expiringTiles.push({ x: tx, y: ty, turnsLeft: turns, tileType: TILE.WALL });
  }
  logLine(state, `${ENEMY_NAME[enemy.kind]} raises an Ice-Barricade!`);
  playBossTelegraphSfx();
}

/** Glacial-Knight: high-DEF duelist. Frozen Sweep (every 3rd turn) and
 * Ice-Barricade (every 6th) are checked — and can both fire on the same
 * turn, since 6 is a multiple of 3 and neither should starve the other's
 * GDD-stated frequency — BEFORE the adjacent-bump shortcut every other boss
 * uses; unlike their ranged abilities, Sweep is a melee-range AOE that needs
 * to fire even (especially) when the Knight is standing right next to the
 * player, so bump-first would silently never let it trigger. Below 50% HP,
 * +1 speed while the player is Chilled. */
function knightAct(state: GameState, enemy: Enemy): void {
  const count = (activationCounters.get(enemy.id) ?? 0) + 1;
  activationCounters.set(enemy.id, count);

  const specialFired = count % 3 === 0 || count % 6 === 0;
  if (count % 3 === 0) castFrozenSweep(state, enemy);
  if (count % 6 === 0) castIceBarricade(state, enemy);
  if (specialFired) return;

  const adjacent = Math.abs(enemy.x - state.run.playerX) + Math.abs(enemy.y - state.run.playerY) <= 1;
  if (adjacent) {
    enemyAttackPlayer(state, enemy);
    return;
  }

  // "+1 speed while the player is Chilled" (GDD) is about the PLAYER's
  // status, layered on top of the Knight's own Chilled-halves-its-speed
  // baseline (the same global rule actEnemy applies to everything else).
  const baseSpeed = enemy.status === 'CHILLED' ? Math.max(1, Math.floor(enemy.speed / 2)) : enemy.speed;
  const enraged = enemy.hp <= enemy.maxHp * 0.5;
  const speed = enraged && state.run.status === 'CHILLED' ? baseSpeed + 1 : baseSpeed;
  chaseStep(state, enemy, speed, true);
}

// Chrono-Lich (GDD Section 6C): activation counter driving its attack cadence,
// keyed by enemy id (a single boss today, but keyed the same way as turrets).
const bossTimers = new Map<string, number>();
const TIME_BLAST_WARNING_TURNS = 2;

// Rewind (GDD Section 6C, Phase 16): a one-time self-cast below 25% HP,
// telegraphed 2 turns ahead like every other cast in this file, but a
// self-buff rather than a tile-targeted AOE — its countdown lives here
// (ticked every Tick Phase by tickBossRewind below, regardless of what the
// boss's own Enemy-Phase turn does) instead of on dungeon.telegraphTiles.
// `bossRewindUsed` makes it fire at most once per fight.
const bossRewindPending = new Map<string, number>();
const bossRewindUsed = new Set<string>();
const REWIND_WARNING_TURNS = 2;

function pruneBossTimers(state: GameState): void {
  const liveIds = new Set(state.dungeon.enemies.map((e) => e.id));
  for (const id of bossTimers.keys()) if (!liveIds.has(id)) bossTimers.delete(id);
  for (const id of bossRewindPending.keys()) if (!liveIds.has(id)) bossRewindPending.delete(id);
  for (const id of bossRewindUsed) if (!liveIds.has(id)) bossRewindUsed.delete(id);
}

/** bossArena.ts calls this on every fresh Floor 99 entry — BOSS_ID is a fixed
 * id reused across every attempt (the fight has no per-loop unique id the
 * way Mini-Boss Arenas do), so a prior failed attempt's cadence position and
 * used-up Rewind must not leak into the next one. */
export function resetChronoLichEncounter(id: string): void {
  bossTimers.delete(id);
  bossRewindPending.delete(id);
  bossRewindUsed.delete(id);
}

/** Ticks any in-progress Rewind channel (Tick Phase, called from
 * turnController.ts BEFORE tickEnemyStatuses so a stun the boss is under
 * during the resolving turn hasn't already been cleared by the time this
 * checks it — "interrupted if he is Stunned when it resolves", GDD). */
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

/** Summons one `kind` adjacent to `enemy` (Chrono-Lich's Bone-Grunt
 * reinforcements, Phase 14; Storm-Caller's Volt-Hound/Frost-Sentinel pack,
 * Phase 15) — generalized from a Bone-Grunt-only helper since both callers
 * share the exact same "place one ally in a free ortho-adjacent tile" shape. */
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

  // Rewind (GDD Section 6C, Phase 16): fires once, the instant HP first drops
  // below 25% — takes priority over the enrage cadence below since it's a
  // one-time story beat, not part of the repeating pattern. tickBossRewind
  // resolves it 2 turns later; the boss keeps acting normally in between.
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
  // [Colossal] Elite Affix (Phase 19): acts only every 2nd activation — a
  // full turn-skip (matches "Speed drops to 1 tile every 2 turns", same
  // "no fractional-speed system, approximate with a turn skip" reinterpretation
  // Phase 18's Slow skill used). Gates the WHOLE turn, not just movement, so
  // it applies uniformly to every kind Colossal can roll on, including the
  // cadence-based specials (Volt-Turret/Cinder-Shaman/Frost-Sentinel) that
  // never read the `speed` local below.
  if (enemy.affix === 'colossal') {
    const count = (colossalTurnCounters.get(enemy.id) ?? 0) + 1;
    colossalTurnCounters.set(enemy.id, count);
    if (count % 2 === 1) return;
  }

  // [Wealthy] Elite Affix (Phase 19): overrides its base kind's AI entirely
  // — flees toward the Stairs, never attacks. runEnemyPhase below checks
  // for it reaching the Stairs and despawns it (escaped) after this call.
  if (enemy.affix === 'wealthy') {
    fleeTowardStairs(state, enemy, enemy.speed || 1);
    return;
  }

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

    const beforeX = enemy.x;
    const beforeY = enemy.y;
    actEnemy(state, enemy);

    // [Toxic] Elite Affix (Phase 19): a hazard trail behind every step.
    if (enemy.affix === 'toxic' && (enemy.x !== beforeX || enemy.y !== beforeY)) {
      placeToxicTrail(state, beforeX, beforeY);
    }

    // [Wealthy] Elite Affix (Phase 19): reaching the Stairs means it
    // escaped — removed with no reward (killEnemy's guaranteed-Relic branch
    // only fires on an actual kill), matching "if killed before it
    // escapes." Reassigns rather than splices, same mutation-safety
    // reasoning as killEnemy's own `state.dungeon.enemies = ...filter(...)`
    // — this loop is iterating the array from before any reassignment, so a
    // fresh array swap here can't skip the next enemy the way an in-place
    // splice on the same live array would.
    if (enemy.affix === 'wealthy' && enemy.x === state.dungeon.stairsX && enemy.y === state.dungeon.stairsY) {
      state.dungeon.enemies = state.dungeon.enemies.filter((e) => e.id !== enemy.id);
      logLine(state, `${ENEMY_NAME[enemy.kind]} escapes down the Stairs with its hoard!`);
    }
  }
}
