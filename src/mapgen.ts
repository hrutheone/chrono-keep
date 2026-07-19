// Deterministic floor generator.

import type { Enemy, GameState, WorldItem } from './types';
import { DUNGEON_SIZE, floorTurnLimit } from './state';
import { hash, mulberry32 } from './rng';
import {
  applyEliteAffixStats,
  createEnemy,
  ELITE_AFFIX_KEYS,
  ELITE_SPAWN_CHANCE,
  enemyCountRangeForFloor,
  enemyPoolForFloor,
  rollChestItem,
  scaleEnemyForDepth,
  scaleEnemyForEchoMagnet,
  scaleEnemyForNgPlus,
  type EnemyKind,
} from './content';

export const TILE = {
  VOID: 0,
  FLOOR: 1,
  WALL: 2,
  DOOR: 3,
  STAIRS: 4,
  SHORTCUT_GATE: 5,
  BOSS_GATE: 6,
  FIRE_HAZARD: 7,
  SHOP_TERMINAL: 8,
  // Scourge's expiring-tile hazard.
  FROST_HAZARD: 9,
  ECHO_WELL: 10,
  CHRONO_ANVIL: 11,
  // Hub-only decorative/interactive tiles — never walkable, the player bumps them.
  TREE: 12,
  SMUGGLER: 13,
} as const;

/** Turn-budget guarantee: spawn -> Stairs within 40 walked tiles. */
export const PATH_BUDGET = 40;

const ECHO_WELL_CHANCE = 0.05;
const CHRONO_ANVIL_CHANCE = 0.05;
const MIMIC_CHANCE = 0.02;

const MAX_ATTEMPTS = 50;
const N = DUNGEON_SIZE;

// Walkable tiles.
const WALKABLE = new Set<number>([
  TILE.FLOOR,
  TILE.DOOR,
  TILE.STAIRS,
  TILE.FIRE_HAZARD,
  TILE.FROST_HAZARD,
  TILE.SHORTCUT_GATE,
  TILE.SHOP_TERMINAL,
  TILE.ECHO_WELL,
  TILE.CHRONO_ANVIL,
]);

/** Shared walkability rule (generator pathing and player movement agree). */
export function isWalkable(tile: number): boolean {
  return WALKABLE.has(tile);
}

/** The effective tile at (x, y). */
export function effectiveTileAt(state: GameState, x: number, y: number): number {
  const overlay = state.dungeon.expiringTiles.find((t) => t.x === x && t.y === y);
  if (overlay) return overlay.tileType;
  return state.dungeon.tiles[y][x];
}

/** isWalkable respecting expiringTiles overlays. */
export function isWalkableAt(state: GameState, x: number, y: number): boolean {
  if (x < 0 || x >= state.dungeon.width || y < 0 || y >= state.dungeon.height) return false;
  return isWalkable(effectiveTileAt(state, x, y));
}
const ORTHO = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

export interface GeneratedFloor {
  tiles: number[][];
  enemies: Enemy[];
  items: WorldItem[];
  spawnX: number;
  spawnY: number;
  stairsX: number;
  stairsY: number;
  // Cursed Rift coordinates.
  riftX: number | null;
  riftY: number | null;
}

type Rng = () => number;
interface Point {
  x: number;
  y: number;
}
interface Room {
  x: number;
  y: number;
  w: number;
  h: number;
}

function randInt(rng: Rng, lo: number, hi: number): number {
  return lo + Math.floor(rng() * (hi - lo + 1));
}

function pick<T>(rng: Rng, arr: T[]): T {
  return arr[randInt(rng, 0, arr.length - 1)];
}

const roomCenter = (r: Room): Point => ({ x: r.x + (r.w >> 1), y: r.y + (r.h >> 1) });
const inRoom = (r: Room, x: number, y: number): boolean =>
  x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;

/** BFS distances from (sx, sy) over walkable tiles; -1 = unreachable. */
export function walkDistances(tiles: number[][], sx: number, sy: number): Int32Array {
  const dist = new Int32Array(N * N).fill(-1);
  const queue: number[] = [sy * N + sx];
  dist[sy * N + sx] = 0;
  for (let head = 0; head < queue.length; head++) {
    const idx = queue[head];
    const x = idx % N;
    const y = (idx - x) / N;
    for (const [dx, dy] of ORTHO) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= N || ny < 0 || ny >= N) continue;
      const nidx = ny * N + nx;
      if (dist[nidx] !== -1 || !WALKABLE.has(tiles[ny][nx])) continue;
      dist[nidx] = dist[idx] + 1;
      queue.push(nidx);
    }
  }
  return dist;
}

/** One shortest walking path (inclusive of endpoints), or null if unreachable. */
function shortestPath(tiles: number[][], from: Point, to: Point): Point[] | null {
  const parent = new Int32Array(N * N).fill(-2); // -2 = unvisited, -1 = start
  const queue: number[] = [from.y * N + from.x];
  parent[from.y * N + from.x] = -1;
  const goal = to.y * N + to.x;
  for (let head = 0; head < queue.length; head++) {
    const idx = queue[head];
    if (idx === goal) break;
    const x = idx % N;
    const y = (idx - x) / N;
    for (const [dx, dy] of ORTHO) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= N || ny < 0 || ny >= N) continue;
      const nidx = ny * N + nx;
      if (parent[nidx] !== -2 || !WALKABLE.has(tiles[ny][nx])) continue;
      parent[nidx] = idx;
      queue.push(nidx);
    }
  }
  if (parent[goal] === -2) return null;
  const path: Point[] = [];
  for (let idx = goal; idx !== -1; idx = parent[idx]) {
    path.push({ x: idx % N, y: Math.floor(idx / N) });
  }
  return path.reverse();
}

/** Generates a floor from the save seed. */
export function generateFloor(rngSeed: number, floorNumber: number): GeneratedFloor {
  const floorSeed = hash(rngSeed, floorNumber);
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const floor = tryGenerate(mulberry32(hash(floorSeed, attempt)), floorNumber);
    if (floor) return floor;
  }
  throw new Error(`Floor ${floorNumber} generation failed after ${MAX_ATTEMPTS} attempts (seed ${rngSeed})`);
}

function tryGenerate(rng: Rng, floorNumber: number): GeneratedFloor | null {
  // Generate non-overlapping rooms.
  const rooms: Room[] = [];
  const targetRooms = randInt(rng, 6, 8);
  for (let tries = 0; tries < 80 && rooms.length < targetRooms; tries++) {
    const w = randInt(rng, 4, 7);
    const h = randInt(rng, 4, 7);
    const x = randInt(rng, 1, N - 1 - w);
    const y = randInt(rng, 1, N - 1 - h);
    const clear = rooms.every(
      (r) => x >= r.x + r.w + 2 || r.x >= x + w + 2 || y >= r.y + r.h + 2 || r.y >= y + h + 2,
    );
    if (clear) rooms.push({ x, y, w, h });
  }
  if (rooms.length < 4) return null;

  // Carve rooms and corridors.
  const tiles: number[][] = Array.from({ length: N }, () => new Array<number>(N).fill(TILE.VOID));
  for (const r of rooms) {
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) tiles[y][x] = TILE.FLOOR;
    }
  }

  const corridor = new Set<number>();
  const carve = (x: number, y: number): void => {
    if (tiles[y][x] === TILE.VOID) {
      tiles[y][x] = TILE.FLOOR;
      corridor.add(y * N + x);
    }
  };
  const carveL = (a: Point, b: Point): void => {
    if (rng() < 0.5) {
      for (let x = Math.min(a.x, b.x); x <= Math.max(a.x, b.x); x++) carve(x, a.y);
      for (let y = Math.min(a.y, b.y); y <= Math.max(a.y, b.y); y++) carve(b.x, y);
    } else {
      for (let y = Math.min(a.y, b.y); y <= Math.max(a.y, b.y); y++) carve(a.x, y);
      for (let x = Math.min(a.x, b.x); x <= Math.max(a.x, b.x); x++) carve(x, b.y);
    }
  };
  for (let i = 1; i < rooms.length; i++) carveL(roomCenter(rooms[i - 1]), roomCenter(rooms[i]));

  const spawn = roomCenter(rooms[0]);

  // Candidate tiles in any room except the spawn room, scanned in fixed order.
  const candidates = (ok: (x: number, y: number) => boolean): Point[] => {
    const out: Point[] = [];
    for (let i = 1; i < rooms.length; i++) {
      const r = rooms[i];
      for (let y = r.y; y < r.y + r.h; y++) {
        for (let x = r.x; x < r.x + r.w; x++) if (ok(x, y)) out.push({ x, y });
      }
    }
    return out;
  };

  // Pick Stairs guided by BFS distance.
  const fromSpawn = walkDistances(tiles, spawn.x, spawn.y);
  const inRange = (dist: Int32Array, x: number, y: number, lo: number, hi: number): boolean => {
    const d = dist[y * N + x];
    return d >= lo && d <= hi;
  };
  let stairsCands = candidates((x, y) => inRange(fromSpawn, x, y, 12, PATH_BUDGET));
  if (stairsCands.length === 0) stairsCands = candidates((x, y) => inRange(fromSpawn, x, y, 6, PATH_BUDGET));
  if (stairsCands.length === 0) return null;
  const stairs = pick(rng, stairsCands);
  tiles[stairs.y][stairs.x] = TILE.STAIRS;

  // Create walls and doors.
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (tiles[y][x] !== TILE.VOID) continue;
      let touchesCarved = false;
      for (let dy = -1; dy <= 1 && !touchesCarved; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= N || ny < 0 || ny >= N) continue;
          const t = tiles[ny][nx];
          if (t !== TILE.VOID && t !== TILE.WALL) {
            touchesCarved = true;
            break;
          }
        }
      }
      if (touchesCarved) tiles[y][x] = TILE.WALL;
    }
  }

  const solidAt = (x: number, y: number): boolean =>
    x < 0 || x >= N || y < 0 || y >= N || !WALKABLE.has(tiles[y][x]);
  const isNarrow = (x: number, y: number): boolean =>
    (solidAt(x - 1, y) && solidAt(x + 1, y)) || (solidAt(x, y - 1) && solidAt(x, y + 1));
  const inAnyRoom = (x: number, y: number): boolean => rooms.some((r) => inRoom(r, x, y));
  for (const idx of corridor) {
    const x = idx % N;
    const y = Math.floor(idx / N);
    if (tiles[y][x] !== TILE.FLOOR || !isNarrow(x, y)) continue;
    if (ORTHO.some(([dx, dy]) => inAnyRoom(x + dx, y + dy))) tiles[y][x] = TILE.DOOR;
  }

  // Turn-budget check.
  const distSpawn = walkDistances(tiles, spawn.x, spawn.y);
  const spawnToStairs = distSpawn[stairs.y * N + stairs.x];
  if (spawnToStairs < 0 || spawnToStairs > PATH_BUDGET) return null;

  // Place chokepoint guards.
  const routeTiles = shortestPath(tiles, spawn, stairs) ?? [];
  const chokeCands: Point[] = [];
  const seenChoke = new Set<number>();
  for (const p of routeTiles) {
    const idx = p.y * N + p.x;
    if (seenChoke.has(idx)) continue;
    seenChoke.add(idx);
    if (!corridor.has(idx) || !isNarrow(p.x, p.y)) continue;
    if (Math.abs(p.x - spawn.x) + Math.abs(p.y - spawn.y) < 4) continue;
    chokeCands.push(p);
  }
  if (chokeCands.length === 0) return null; // every floor needs its chokepoint

  const occupied = new Set<number>([
    spawn.y * N + spawn.x,
    stairs.y * N + stairs.x,
  ]);

  // Place remaining enemies.
  const pool = enemyPoolForFloor(floorNumber);
  const countRange = enemyCountRangeForFloor(floorNumber);
  const totalEnemies = randInt(rng, countRange.min, countRange.max);
  const enemies: Enemy[] = [];

  const spawnEnemy = (kind: EnemyKind, x: number, y: number): void => {
    const enemy = createEnemy(kind, `f${floorNumber}-enemy-${enemies.length}`, x, y);
    scaleEnemyForDepth(enemy, floorNumber);
    // Roll elite spawn deterministically.
    if (rng() < ELITE_SPAWN_CHANCE) {
      const affix = pick(rng, ELITE_AFFIX_KEYS);
      enemy.affix = affix;
      applyEliteAffixStats(enemy, affix);
    }
    enemies.push(enemy);
  };

  const chokeCount = Math.min(chokeCands.length, randInt(rng, 1, 2));
  for (let i = 0; i < chokeCount; i++) {
    const free = chokeCands.filter((c) => !occupied.has(c.y * N + c.x));
    if (free.length === 0) break;
    const pos = pick(rng, free);
    occupied.add(pos.y * N + pos.x);
    spawnEnemy(pick(rng, pool), pos.x, pos.y);
  }
  if (enemies.length === 0) return null;

  const roomKinds: EnemyKind[] = [];
  while (enemies.length + roomKinds.length < totalEnemies) {
    const kind = pick(rng, pool);
    roomKinds.push(kind);
    // Volt-Hound (and its Floor 41+ upgrade, Storm-Stalker) spawns in pairs.
    if ((kind === 'VOLT_HOUND' || kind === 'STORM_STALKER') && enemies.length + roomKinds.length < totalEnemies) {
      roomKinds.push(kind);
    }
  }
  if (floorNumber >= 21 && roomKinds.length > 0) roomKinds[0] = 'TIME_WEAVER';

  let openHoundPos: Point | null = null;
  for (const kind of roomKinds) {
    let pos: Point | undefined;
    // Place Volt-Hound/Storm-Stalker adjacent to pack-mate if possible.
    if ((kind === 'VOLT_HOUND' || kind === 'STORM_STALKER') && openHoundPos) {
      const adjacent = ORTHO.map(([dx, dy]) => ({ x: openHoundPos!.x + dx, y: openHoundPos!.y + dy })).filter(
        (p) => tiles[p.y]?.[p.x] === TILE.FLOOR && !occupied.has(p.y * N + p.x),
      );
      if (adjacent.length > 0) pos = pick(rng, adjacent);
      openHoundPos = null;
    }
    if (!pos) {
      const spots = candidates(
        (x, y) => tiles[y][x] === TILE.FLOOR && distSpawn[y * N + x] >= 6 && !occupied.has(y * N + x),
      );
      if (spots.length === 0) return null;
      pos = pick(rng, spots);
      if (kind === 'VOLT_HOUND' || kind === 'STORM_STALKER') openHoundPos = pos;
    }
    occupied.add(pos.y * N + pos.x);
    spawnEnemy(kind, pos.x, pos.y);
  }

  // Place loot chests.
  const items: WorldItem[] = [];
  const chestCount = randInt(rng, 1, 2);
  const chokeGuards = enemies.filter((e) => chokeCands.some((c) => c.x === e.x && c.y === e.y));
  for (let i = 0; i < chestCount; i++) {
    let pos: Point | undefined;
    if (i === 0 && chokeGuards.length > 0) {
      const guard = pick(rng, chokeGuards);
      const guardDist = distSpawn[guard.y * N + guard.x];
      const pastGuard = candidates(
        (x, y) =>
          tiles[y][x] === TILE.FLOOR &&
          !occupied.has(y * N + x) &&
          Math.abs(x - guard.x) + Math.abs(y - guard.y) <= 3 &&
          distSpawn[y * N + x] > guardDist,
      );
      if (pastGuard.length > 0) pos = pick(rng, pastGuard);
    }
    if (!pos) {
      const spots = candidates(
        (x, y) =>
          tiles[y][x] === TILE.FLOOR && distSpawn[y * N + x] >= 3 && !occupied.has(y * N + x),
      );
      if (spots.length === 0) return null;
      pos = pick(rng, spots);
    }
    occupied.add(pos.y * N + pos.x);
    // Reroll chest contents at pickup time.
    items.push({
      item: rollChestItem(rng, floorNumber, `f${floorNumber}-chest-${i}`),
      x: pos.x,
      y: pos.y,
      chestLoot: true,
      isMimic: rng() < MIMIC_CHANCE,
    });
  }

  // Place Cursed Rift.
  let riftX: number | null = null;
  let riftY: number | null = null;
  if (floorNumber >= 3 && rng() < 0.12) {
    const spots = candidates(
      (x, y) => tiles[y][x] === TILE.FLOOR && distSpawn[y * N + x] >= 3 && !occupied.has(y * N + x),
    );
    if (spots.length > 0) {
      const pos = pick(rng, spots);
      riftX = pos.x;
      riftY = pos.y;
    }
  }

  // Echo Well: full HP/Stamina/status restore, then reverts to floor.
  if (rng() < ECHO_WELL_CHANCE) {
    const spots = candidates(
      (x, y) => tiles[y][x] === TILE.FLOOR && distSpawn[y * N + x] >= 3 && !occupied.has(y * N + x),
    );
    if (spots.length > 0) {
      const pos = pick(rng, spots);
      tiles[pos.y][pos.x] = TILE.ECHO_WELL;
      occupied.add(pos.y * N + pos.x);
    }
  }

  // Chrono-Anvil: reforges the equipped weapon into a random late-tier one.
  if (rng() < CHRONO_ANVIL_CHANCE) {
    const spots = candidates(
      (x, y) => tiles[y][x] === TILE.FLOOR && distSpawn[y * N + x] >= 3 && !occupied.has(y * N + x),
    );
    if (spots.length > 0) {
      const pos = pick(rng, spots);
      tiles[pos.y][pos.x] = TILE.CHRONO_ANVIL;
      occupied.add(pos.y * N + pos.x);
    }
  }

  return {
    tiles,
    enemies,
    items,
    spawnX: spawn.x,
    spawnY: spawn.y,
    stairsX: stairs.x,
    stairsY: stairs.y,
    riftX,
    riftY,
  };
}

/** Generates the floor from the save seed and installs it into the game state. */
export function enterFloor(state: GameState, floorNumber: number): GeneratedFloor {
  const floor = generateFloor(state.persistent.rngSeed, floorNumber);
  state.run.currentFloor = floorNumber;
  state.run.turnsRemaining = floorTurnLimit(state);
  state.run.playerX = floor.spawnX;
  state.run.playerY = floor.spawnY;
  state.dungeon.width = N;
  state.dungeon.height = N;
  state.dungeon.tiles = floor.tiles;
  state.dungeon.enemies = floor.enemies;
  const echoMagnetActive = state.run.relics.includes('echo_magnet');
  for (const enemy of state.dungeon.enemies) {
    scaleEnemyForNgPlus(enemy, state.persistent.ngPlusLevel);
    scaleEnemyForEchoMagnet(enemy, echoMagnetActive);
  }
  state.dungeon.items = floor.items;
  state.dungeon.spawnX = floor.spawnX;
  state.dungeon.spawnY = floor.spawnY;
  state.dungeon.stairsX = floor.stairsX;
  state.dungeon.stairsY = floor.stairsY;
  state.dungeon.riftX = floor.riftX;
  state.dungeon.riftY = floor.riftY;
  state.dungeon.expiringTiles = [];
  state.dungeon.telegraphTiles = [];
  return floor;
}

/** Debug ASCII view of a generated floor. */
export function floorToAscii(floor: GeneratedFloor): string {
  const glyphs = [' ', '.', '#', '+', '>', '%', 'B', '~'];
  const grid = floor.tiles.map((row) => row.map((t) => glyphs[t] ?? '?'));
  for (const wi of floor.items) grid[wi.y][wi.x] = wi.item.kind === 'ANCHOR' ? 'A' : '$';
  const enemyGlyphs: Record<EnemyKind, string> = {
    BONE_GRUNT: 'g',
    EMBER_BAT: 'b',
    VOLT_TURRET: 't',
    FROST_WRAITH: 'w',
    TIME_WEAVER: 'W',
    CHRONO_LICH: 'L',
    BONE_KNIGHT: 'K',
    CINDER_SHAMAN: 'C',
    VOLT_HOUND: 'h',
    FROST_SENTINEL: 'S',
    INFERNO_GOLEM: 'G',
    STORM_CALLER: 'O',
    GLACIAL_KNIGHT: 'N',
    CLOCKWORK_SCARAB: 'z',
    DREAD_LEGION: 'd',
    DOOM_GUARD: 'k',
    ASH_FIEND: 'a',
    HELLFIRE_MAGUS: 'c',
    TESLA_COIL: 'T',
    STORM_STALKER: 's',
    VOID_SPIRIT: 'v',
    GLACIAL_MONOLITH: 'M',
  };
  for (const e of floor.enemies) grid[e.y][e.x] = enemyGlyphs[e.kind];
  grid[floor.spawnY][floor.spawnX] = '@';
  return grid.map((row) => row.join('')).join('\n');
}
