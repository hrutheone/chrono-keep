// Phase 1: deterministic Room & Corridor floor generator (GDD Sections 7 & 9).
//
// Every floor derives from hash(persistent.rngSeed, floorNumber), so a save's
// dungeon is identical across loops. If a layout fails the turn-budget check
// (spawn -> Anchor -> Stairs <= 20 walked tiles, BFS on geometry only), the
// floor regenerates from the next derived attempt seed — also deterministic.

import type { Enemy, GameState, WorldItem } from './types';
import { DUNGEON_SIZE } from './state';
import { hash, mulberry32 } from './rng';
import { createEnemy, createAnchorItem, rollChestItem, type EnemyKind } from './content';

export const TILE = {
  VOID: 0,
  FLOOR: 1,
  WALL: 2,
  DOOR: 3,
  STAIRS: 4,
  SHORTCUT_GATE: 5,
  BOSS_GATE: 6,
  FIRE_HAZARD: 7,
} as const;

/** Turn-budget guarantee: spawn -> Anchor -> Stairs within 20 walked tiles. */
export const PATH_BUDGET = 20;

const MAX_ATTEMPTS = 50;
const N = DUNGEON_SIZE;

// Shortcut Gates are closed until unlocked, so pathing treats them as solid.
const WALKABLE = new Set<number>([TILE.FLOOR, TILE.DOOR, TILE.STAIRS]);
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
  anchorX: number;
  anchorY: number;
  stairsX: number;
  stairsY: number;
  gateX: number;
  gateY: number;
  shortcutId: string;
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

/** Generates a floor from the save seed. Deterministic; throws only if every
 * derived attempt seed fails, which the Phase 1 acceptance check rules out. */
export function generateFloor(rngSeed: number, floorNumber: number): GeneratedFloor {
  const floorSeed = hash(rngSeed, floorNumber);
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const floor = tryGenerate(mulberry32(hash(floorSeed, attempt)), floorNumber);
    if (floor) return floor;
  }
  throw new Error(`Floor ${floorNumber} generation failed after ${MAX_ATTEMPTS} attempts (seed ${rngSeed})`);
}

function tryGenerate(rng: Rng, floorNumber: number): GeneratedFloor | null {
  // 1. Non-overlapping rooms (interiors only; walls come later). Interiors stay
  //    inside [1, N-2] so the wall ring fits, with a 2-tile gap between rooms.
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

  // 2. Carve rooms, then chain them with L-shaped corridors.
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

  // 3. Pick Anchor and Stairs guided by BFS distance so the 20-tile budget
  //    almost always holds; the mandated check in step 6 remains authoritative.
  const fromSpawn = walkDistances(tiles, spawn.x, spawn.y);
  const inRange = (dist: Int32Array, x: number, y: number, lo: number, hi: number): boolean => {
    const d = dist[y * N + x];
    return d >= lo && d <= hi;
  };
  let anchorCands = candidates((x, y) => inRange(fromSpawn, x, y, 6, 12));
  if (anchorCands.length === 0) anchorCands = candidates((x, y) => inRange(fromSpawn, x, y, 4, 14));
  if (anchorCands.length === 0) return null;
  const anchor = pick(rng, anchorCands);

  const fromAnchor = walkDistances(tiles, anchor.x, anchor.y);
  const spawnToAnchor = fromSpawn[anchor.y * N + anchor.x];
  const stairsCands = candidates(
    (x, y) =>
      !(x === anchor.x && y === anchor.y) &&
      inRange(fromAnchor, x, y, 4, PATH_BUDGET - spawnToAnchor),
  );
  if (stairsCands.length === 0) return null;
  const stairs = pick(rng, stairsCands);
  tiles[stairs.y][stairs.x] = TILE.STAIRS;

  // 4. Shortcut corridor from spawn room to stairwell room, blocked mid-way by
  //    a closed gate (opens from the stairwell side; persists across loops).
  const stairsRoom = rooms.find((r) => inRoom(r, stairs.x, stairs.y))!;
  const beforeShortcut = new Set(corridor);
  carveL(spawn, roomCenter(stairsRoom));
  const shortcutTiles = [...corridor].filter((idx) => !beforeShortcut.has(idx));
  if (shortcutTiles.length === 0) return null; // nowhere to put a gate
  const gateIdx = shortcutTiles[shortcutTiles.length >> 1];
  const gateX = gateIdx % N;
  const gateY = Math.floor(gateIdx / N);
  tiles[gateY][gateX] = TILE.SHORTCUT_GATE;
  corridor.delete(gateIdx);

  // 5. Walls around all carved space, then doors where a 1-wide corridor meets
  //    a room.
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

  // 6. The mandated turn-budget check on the finished geometry.
  const distSpawn = walkDistances(tiles, spawn.x, spawn.y);
  const legA = distSpawn[anchor.y * N + anchor.x];
  const legB = walkDistances(tiles, anchor.x, anchor.y)[stairs.y * N + stairs.x];
  if (legA < 0 || legB < 0 || legA + legB > PATH_BUDGET) return null;

  // 7. Chokepoint guards: 1-2 enemies on 1-wide corridor tiles that lie on the
  //    shortest spawn -> Anchor -> Stairs route (kept off the player's doorstep).
  const routeTiles = [
    ...(shortestPath(tiles, spawn, anchor) ?? []),
    ...(shortestPath(tiles, anchor, stairs) ?? []),
  ];
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
    anchor.y * N + anchor.x,
    stairs.y * N + stairs.x,
    gateIdx,
  ]);

  // 8. Enemies: 3-5 total from the floor's mix, chokepoint guards first.
  //    F1: Grunts/Bats. F2 adds Turrets/Wraiths. F3 adds one Time-Weaver Elite.
  const pool: EnemyKind[] =
    floorNumber >= 2
      ? ['BONE_GRUNT', 'EMBER_BAT', 'VOLT_TURRET', 'FROST_WRAITH']
      : ['BONE_GRUNT', 'EMBER_BAT'];
  const totalEnemies = randInt(rng, 3, 5);
  const enemies: Enemy[] = [];

  const chokeCount = Math.min(chokeCands.length, randInt(rng, 1, 2));
  for (let i = 0; i < chokeCount; i++) {
    const free = chokeCands.filter((c) => !occupied.has(c.y * N + c.x));
    if (free.length === 0) break;
    const pos = pick(rng, free);
    occupied.add(pos.y * N + pos.x);
    enemies.push(createEnemy(pick(rng, pool), `f${floorNumber}-enemy-${enemies.length}`, pos.x, pos.y));
  }
  if (enemies.length === 0) return null;

  const roomKinds: EnemyKind[] = [];
  while (enemies.length + roomKinds.length < totalEnemies) roomKinds.push(pick(rng, pool));
  if (floorNumber >= 3 && roomKinds.length > 0) roomKinds[0] = 'TIME_WEAVER';
  for (const kind of roomKinds) {
    const spots = candidates(
      (x, y) =>
        tiles[y][x] === TILE.FLOOR && distSpawn[y * N + x] >= 6 && !occupied.has(y * N + x),
    );
    if (spots.length === 0) return null;
    const pos = pick(rng, spots);
    occupied.add(pos.y * N + pos.x);
    enemies.push(createEnemy(kind, `f${floorNumber}-enemy-${enemies.length}`, pos.x, pos.y));
  }

  // 9. The Anchor chest plus 1-2 loot chests with seed-determined contents.
  const items: WorldItem[] = [{ item: createAnchorItem(`f${floorNumber}-anchor`), x: anchor.x, y: anchor.y }];
  const chestCount = randInt(rng, 1, 2);
  for (let i = 0; i < chestCount; i++) {
    const spots = candidates(
      (x, y) =>
        tiles[y][x] === TILE.FLOOR && distSpawn[y * N + x] >= 3 && !occupied.has(y * N + x),
    );
    if (spots.length === 0) return null;
    const pos = pick(rng, spots);
    occupied.add(pos.y * N + pos.x);
    items.push({ item: rollChestItem(rng, floorNumber, `f${floorNumber}-chest-${i}`), x: pos.x, y: pos.y });
  }

  return {
    tiles,
    enemies,
    items,
    spawnX: spawn.x,
    spawnY: spawn.y,
    anchorX: anchor.x,
    anchorY: anchor.y,
    stairsX: stairs.x,
    stairsY: stairs.y,
    gateX,
    gateY,
    shortcutId: `f${floorNumber}-shortcut`,
  };
}

/** Generates the floor from the save seed and installs it into the game state. */
export function enterFloor(state: GameState, floorNumber: number): GeneratedFloor {
  const floor = generateFloor(state.persistent.rngSeed, floorNumber);
  state.run.currentFloor = floorNumber;
  state.run.playerX = floor.spawnX;
  state.run.playerY = floor.spawnY;
  state.dungeon.width = N;
  state.dungeon.height = N;
  state.dungeon.tiles = floor.tiles;
  state.dungeon.enemies = floor.enemies;
  state.dungeon.items = floor.items;
  return floor;
}

/** Debug view of a generated floor (real rendering arrives in Phase 2). */
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
  };
  for (const e of floor.enemies) grid[e.y][e.x] = enemyGlyphs[e.kind];
  grid[floor.spawnY][floor.spawnX] = '@';
  return grid.map((row) => row.join('')).join('\n');
}
