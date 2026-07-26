// Mini-Boss Arena ambient hazards (Mk II/III) — layered on top of each boss's own skill kit.

import { ENEMY_NAME } from './content';
import { ARENA_H, ARENA_W, ARENA_X, ARENA_Y, archetypeForFloor, miniBossRepeatNumber, STORM_CALLER_PILLARS } from './arenas';
import { TILE } from './mapgen';
import { logLine } from './turns';
import { notifyFloatingText } from './floatingText';
import { notifyBeam, triggerScreenShake } from './animation';
import { playBossTelegraphSfx } from './audio';
import { COLOR_VOLT } from './palette';
import type { Enemy, GameState } from './types';

function inBounds(state: GameState, x: number, y: number): boolean {
  return x >= 0 && x < state.dungeon.width && y >= 0 && y < state.dungeon.height;
}

/** Ambient standing-hazard contact damage by floor tier — separate from a boss's own attack-scaled telegraphs. */
export function arenaHazardDamage(floor: number): number {
  if (floor <= 30) return 2;
  if (floor <= 60) return 5;
  return 15;
}

/** Never overwrite a WALL/BOSS_GATE tile, or the exact tile the player or the boss currently occupies. */
function safeToPlace(state: GameState, boss: Enemy, x: number, y: number): boolean {
  if (!inBounds(state, x, y)) return false;
  const tile = state.dungeon.tiles[y][x];
  if (tile === TILE.WALL || tile === TILE.BOSS_GATE) return false;
  if (state.run.playerX === x && state.run.playerY === y) return false;
  if (boss.x === x && boss.y === y) return false;
  return true;
}

function placeExpiring(state: GameState, x: number, y: number, turns: number, tileType: number): void {
  const existing = state.dungeon.expiringTiles.find((t) => t.x === x && t.y === y);
  if (existing) existing.turnsLeft = Math.max(existing.turnsLeft, turns);
  else state.dungeon.expiringTiles.push({ x, y, turnsLeft: turns, tileType });
}

// ---------- Inferno-Golem Mk II (Floor 40): Shifting Lava ----------

const LAVA_TOGGLE_TURNS = 6;
type LavaOrientation = 'horizontal' | 'vertical';
const lavaState = new Map<string, { turnsUntil: number; orientation: LavaOrientation }>();

function lavaCells(orientation: LavaOrientation): [number, number][] {
  const cells: [number, number][] = [];
  if (orientation === 'horizontal') {
    for (const y of [ARENA_Y + 7, ARENA_Y + 13]) {
      for (let x = ARENA_X + 1; x < ARENA_X + ARENA_W - 1; x++) cells.push([x, y]);
    }
  } else {
    for (const x of [ARENA_X + 6, ARENA_X + 13]) {
      for (let y = ARENA_Y + 1; y < ARENA_Y + ARENA_H - 1; y++) cells.push([x, y]);
    }
  }
  return cells;
}

function paintLava(state: GameState, boss: Enemy, orientation: LavaOrientation, lit: boolean): void {
  for (const [x, y] of lavaCells(orientation)) {
    if (!lit) {
      if (state.dungeon.tiles[y][x] === TILE.FIRE_HAZARD) state.dungeon.tiles[y][x] = TILE.FLOOR;
    } else if (safeToPlace(state, boss, x, y)) {
      state.dungeon.tiles[y][x] = TILE.FIRE_HAZARD;
    }
  }
}

// The first tick paints the initial lanes immediately — otherwise the arena would sit hazard-free
// for a full 6 turns since addGolemFeature no longer bakes anything in at Mk II/III.
function tickShiftingLava(state: GameState, boss: Enemy): void {
  const s = lavaState.get(boss.id);
  if (!s) {
    lavaState.set(boss.id, { turnsUntil: LAVA_TOGGLE_TURNS, orientation: 'horizontal' });
    paintLava(state, boss, 'horizontal', true);
    return;
  }
  s.turnsUntil -= 1;
  if (s.turnsUntil > 0) return;
  paintLava(state, boss, s.orientation, false);
  s.orientation = s.orientation === 'horizontal' ? 'vertical' : 'horizontal';
  s.turnsUntil = LAVA_TOGGLE_TURNS;
  paintLava(state, boss, s.orientation, true);
  logLine(state, 'The lava shifts!');
}

// ---------- Inferno-Golem Mk III (Floor 70): Crawling Wall of Fire ----------

const CRAWL_STEP_TURNS = 2;
const CRAWL_BAND_WIDTH = 2;
type CrawlAxis = 'horizontal' | 'vertical';
const crawlState = new Map<string, { axis: CrawlAxis; pos: number; turnsUntilStep: number }>();

function crawlSpan(axis: CrawlAxis): number {
  return (axis === 'horizontal' ? ARENA_W : ARENA_H) - 2;
}

function crawlCells(axis: CrawlAxis, pos: number): [number, number][] {
  const span = crawlSpan(axis);
  const starts = [pos % span, (pos + Math.floor(span / 2)) % span];
  const cells: [number, number][] = [];
  for (const start of starts) {
    for (let w = 0; w < CRAWL_BAND_WIDTH; w++) {
      const offset = (start + w) % span;
      if (axis === 'horizontal') {
        const x = ARENA_X + 1 + offset;
        for (let y = ARENA_Y + 1; y < ARENA_Y + ARENA_H - 1; y++) cells.push([x, y]);
      } else {
        const y = ARENA_Y + 1 + offset;
        for (let x = ARENA_X + 1; x < ARENA_X + ARENA_W - 1; x++) cells.push([x, y]);
      }
    }
  }
  return cells;
}

function paintCrawl(state: GameState, boss: Enemy, axis: CrawlAxis, pos: number, lit: boolean): void {
  for (const [x, y] of crawlCells(axis, pos)) {
    if (!lit) {
      if (state.dungeon.tiles[y][x] === TILE.FIRE_HAZARD) state.dungeon.tiles[y][x] = TILE.FLOOR;
    } else if (safeToPlace(state, boss, x, y)) {
      state.dungeon.tiles[y][x] = TILE.FIRE_HAZARD;
    }
  }
}

function tickCrawlingFireWall(state: GameState, boss: Enemy): void {
  const s = crawlState.get(boss.id);
  if (!s) {
    crawlState.set(boss.id, { axis: 'horizontal', pos: 0, turnsUntilStep: CRAWL_STEP_TURNS });
    paintCrawl(state, boss, 'horizontal', 0, true);
    return;
  }
  s.turnsUntilStep -= 1;
  if (s.turnsUntilStep > 0) return;
  s.turnsUntilStep = CRAWL_STEP_TURNS;
  paintCrawl(state, boss, s.axis, s.pos, false);
  s.pos += 1;
  if (s.pos >= crawlSpan(s.axis)) {
    s.pos = 0;
    s.axis = s.axis === 'horizontal' ? 'vertical' : 'horizontal';
    logLine(state, `The Wall of Fire pivots to sweep ${s.axis === 'horizontal' ? 'sideways' : 'downward'}!`);
  }
  paintCrawl(state, boss, s.axis, s.pos, true);
  triggerScreenShake();
}

// ---------- Storm-Caller Mk II/III (Floor 50/80): Tesla Pulse ----------

const TESLA_PULSE_TURNS = 5;
const TESLA_HAZARD_DURATION = 2;
const teslaPulseState = new Map<string, number>();

const PULSE_NEIGHBORS: readonly [number, number][] = [
  [-1, -1], [0, -1], [1, -1],
  [-1, 0], [1, 0],
  [-1, 1], [0, 1], [1, 1],
];

function tickTeslaPulse(state: GameState, boss: Enemy): void {
  const turnsUntil = (teslaPulseState.get(boss.id) ?? TESLA_PULSE_TURNS) - 1;
  if (turnsUntil > 0) {
    teslaPulseState.set(boss.id, turnsUntil);
    return;
  }
  teslaPulseState.set(boss.id, TESLA_PULSE_TURNS);
  for (const [px, py] of STORM_CALLER_PILLARS) {
    if (state.dungeon.tiles[py][px] !== TILE.WALL) continue; // A shattered pillar stops pulsing.
    for (const [dx, dy] of PULSE_NEIGHBORS) {
      const x = px + dx;
      const y = py + dy;
      if (safeToPlace(state, boss, x, y)) placeExpiring(state, x, y, TESLA_HAZARD_DURATION, TILE.VOLT_HAZARD);
    }
  }
  logLine(state, `${ENEMY_NAME[boss.kind]}'s pillars pulse with electricity!`);
  playBossTelegraphSfx();
}

// ---------- Storm-Caller Mk III (Floor 80): Overload Current ----------

const OVERLOAD_CURRENT_TURNS = 4;
const OVERLOAD_TELEGRAPH_TURNS = 1;
const overloadCurrentState = new Map<string, number>();

// Adjacent pillar-pairs forming the arena's 4 edges. STORM_CALLER_PILLARS order: 0=TL, 1=TR, 2=BL, 3=BR.
const PILLAR_EDGES: readonly [number, number][] = [
  [0, 1],
  [1, 3],
  [3, 2],
  [2, 0],
];

function pillarStanding(state: GameState, index: number): boolean {
  const [x, y] = STORM_CALLER_PILLARS[index];
  return state.dungeon.tiles[y][x] === TILE.WALL;
}

function edgeCells(a: readonly [number, number], b: readonly [number, number]): [number, number][] {
  const dx = Math.sign(b[0] - a[0]);
  const dy = Math.sign(b[1] - a[1]);
  const cells: [number, number][] = [];
  let x = a[0] + dx;
  let y = a[1] + dy;
  while (x !== b[0] || y !== b[1]) {
    cells.push([x, y]);
    x += dx;
    y += dy;
  }
  return cells;
}

function tickOverloadCurrent(state: GameState, boss: Enemy): void {
  const turnsUntil = (overloadCurrentState.get(boss.id) ?? OVERLOAD_CURRENT_TURNS) - 1;
  if (turnsUntil > 0) {
    overloadCurrentState.set(boss.id, turnsUntil);
    return;
  }
  overloadCurrentState.set(boss.id, OVERLOAD_CURRENT_TURNS);

  const standingEdges = PILLAR_EDGES.filter(([i, j]) => pillarStanding(state, i) && pillarStanding(state, j));
  if (standingEdges.length === 0) return;
  const [i, j] = standingEdges[Math.floor(Math.random() * standingEdges.length)];
  const [ax, ay] = STORM_CALLER_PILLARS[i];
  const [bx, by] = STORM_CALLER_PILLARS[j];

  for (const [x, y] of edgeCells(STORM_CALLER_PILLARS[i], STORM_CALLER_PILLARS[j])) {
    state.dungeon.telegraphTiles.push({
      x,
      y,
      turnsUntil: OVERLOAD_TELEGRAPH_TURNS,
      payload: 'volt_beam',
      sourceAttack: boss.attack,
      isBossAoe: true,
    });
  }
  notifyBeam(ax, ay, bx, by, COLOR_VOLT);
  logLine(state, `${ENEMY_NAME[boss.kind]} routes an Overload Current between the pillars!`);
  playBossTelegraphSfx();
}

// ---------- Glacial-Knight Mk II (Floor 60): Ice Slicks — event-driven off castIceBarricade ----------

const ICE_SLICK_DURATION = 12;
const ICE_SLICK_MIN_COUNT = 3;
const ICE_SLICK_MAX_COUNT = 4;
const ICE_SLICK_PLACEMENT_ATTEMPTS = 40;

export function spawnIceSlicks(state: GameState, boss: Enemy): void {
  const count = ICE_SLICK_MIN_COUNT + Math.floor(Math.random() * (ICE_SLICK_MAX_COUNT - ICE_SLICK_MIN_COUNT + 1));
  let placed = 0;
  for (let attempt = 0; placed < count && attempt < ICE_SLICK_PLACEMENT_ATTEMPTS; attempt++) {
    const x = ARENA_X + 1 + Math.floor(Math.random() * (ARENA_W - 2));
    const y = ARENA_Y + 1 + Math.floor(Math.random() * (ARENA_H - 2));
    if (!safeToPlace(state, boss, x, y)) continue;
    placeExpiring(state, x, y, ICE_SLICK_DURATION, TILE.ICE_SLICK);
    placed += 1;
  }
  logLine(state, 'Ice Slicks spread across the floor!');
}

// ---------- Glacial-Knight Mk III (Floor 90): Avalanche ----------

const AVALANCHE_TURNS = 3;
const AVALANCHE_TELEGRAPH_TURNS = 1;
const avalancheState = new Map<string, number>();

function tickAvalanche(state: GameState, boss: Enemy): void {
  const turnsUntil = (avalancheState.get(boss.id) ?? AVALANCHE_TURNS) - 1;
  if (turnsUntil > 0) {
    avalancheState.set(boss.id, turnsUntil);
    return;
  }
  avalancheState.set(boss.id, AVALANCHE_TURNS);

  const cx = state.run.playerX;
  const cy = state.run.playerY;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const x = cx + dx;
      const y = cy + dy;
      if (!inBounds(state, x, y) || state.dungeon.tiles[y][x] === TILE.WALL) continue;
      state.dungeon.telegraphTiles.push({
        x,
        y,
        turnsUntil: AVALANCHE_TELEGRAPH_TURNS,
        payload: 'icicle',
        sourceAttack: boss.attack,
        isBossAoe: true,
      });
    }
  }
  logLine(state, 'Icicles groan loose from the ceiling!');
  playBossTelegraphSfx();
}

// ---------- Glacial-Knight Mk III (Floor 90): Blizzard Gale ----------

const GALE_TURNS = 4;
const GALE_WARNING_TURNS = 1;
const GALE_PUSH_TILES = 3;
const GALE_DIRECTIONS: readonly [[number, number], string][] = [
  [[0, -1], 'north'],
  [[0, 1], 'south'],
  [[-1, 0], 'west'],
  [[1, 0], 'east'],
];
const galeState = new Map<string, { turnsUntil: number; dir: [number, number] | null }>();

function tickBlizzardGale(state: GameState, boss: Enemy): void {
  let s = galeState.get(boss.id);
  if (!s) {
    s = { turnsUntil: GALE_TURNS, dir: null };
    galeState.set(boss.id, s);
  }
  s.turnsUntil -= 1;

  if (s.turnsUntil === GALE_WARNING_TURNS) {
    const [dir, name] = GALE_DIRECTIONS[Math.floor(Math.random() * GALE_DIRECTIONS.length)];
    s.dir = dir;
    logLine(state, `A freezing gale begins to blow ${name}!`);
    notifyFloatingText(state.run.playerX, state.run.playerY, 'BRACE!', 'crit');
    return;
  }
  if (s.turnsUntil > 0) return;

  s.turnsUntil = GALE_TURNS;
  const dir = s.dir;
  s.dir = null;
  if (!dir) return;
  if (state.run.braced) {
    logLine(state, 'You brace against the Blizzard Gale!');
    return;
  }

  let x = state.run.playerX;
  let y = state.run.playerY;
  for (let i = 0; i < GALE_PUSH_TILES; i++) {
    const nx = x + dir[0];
    const ny = y + dir[1];
    if (!inBounds(state, nx, ny) || state.dungeon.tiles[ny][nx] === TILE.WALL) break;
    if (state.dungeon.enemies.some((e) => e.x === nx && e.y === ny)) break;
    x = nx;
    y = ny;
  }
  if (x !== state.run.playerX || y !== state.run.playerY) {
    state.run.playerX = x;
    state.run.playerY = y;
    logLine(state, 'The Blizzard Gale sweeps you across the ice!');
  }
}

// ---------- Dispatch ----------

function pruneArenaHazardState(state: GameState): void {
  const liveIds = new Set(state.dungeon.enemies.map((e) => e.id));
  const maps: ReadonlyArray<Map<string, unknown>> = [lavaState, crawlState, teslaPulseState, overloadCurrentState, avalancheState, galeState];
  for (const m of maps) {
    for (const id of m.keys()) if (!liveIds.has(id)) m.delete(id);
  }
}

/** Ticks the current Arena floor's Mk II/III ambient hazards. No-op on Mk I floors or once the boss is dead. */
export function tickArenaHazards(state: GameState): void {
  pruneArenaHazardState(state);
  const floor = state.run.currentFloor;
  const kind = archetypeForFloor(floor);
  const boss = state.dungeon.enemies.find((e) => e.kind === kind);
  if (!boss) return;
  const repeat = miniBossRepeatNumber(floor);

  if (kind === 'INFERNO_GOLEM') {
    if (repeat === 1) tickShiftingLava(state, boss);
    else if (repeat === 2) tickCrawlingFireWall(state, boss);
  } else if (kind === 'STORM_CALLER') {
    if (repeat === 1) tickTeslaPulse(state, boss);
    else if (repeat === 2) {
      tickTeslaPulse(state, boss);
      tickOverloadCurrent(state, boss);
    }
  } else if (kind === 'GLACIAL_KNIGHT') {
    if (repeat === 2) {
      tickAvalanche(state, boss);
      tickBlizzardGale(state, boss);
    }
  }
}
