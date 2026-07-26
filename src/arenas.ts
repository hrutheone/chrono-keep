// Mini-Boss Arenas: fixed, hand-authored layouts for boss floors.

import { BOSS_EVOLUTION, createEnemy, discoverEnemy, scaleEnemyForNgPlus } from './content';
import { TILE } from './mapgen';
import { DUNGEON_SIZE, floorTurnLimit } from './state';
import { resetVisualLerps } from './animation';
import { resetCameraLerp } from './camera';
import type { GameState } from './types';

const N = DUNGEON_SIZE;

export const ARENA_FLOORS = [10, 20, 30, 40, 50, 60, 70, 80, 90] as const;

export function isArenaFloor(floor: number): boolean {
  return (ARENA_FLOORS as readonly number[]).includes(floor);
}

export type MiniBossKind = 'INFERNO_GOLEM' | 'STORM_CALLER' | 'GLACIAL_KNIGHT';
const CYCLE: readonly MiniBossKind[] = ['INFERNO_GOLEM', 'STORM_CALLER', 'GLACIAL_KNIGHT'];

/** Which archetype guards a given Arena floor. */
export function archetypeForFloor(floor: number): MiniBossKind {
  return CYCLE[Math.floor((floor - 10) / 10) % 3];
}

/** Returns the repeat number (0 = Mk I, 1 = Mk II, 2 = Mk III) of the mini-boss based on floor. */
export function miniBossRepeatNumber(floor: number): number {
  return Math.floor((floor - 10) / 30);
}

export const ARENA_W = 20;
export const ARENA_H = 20;
export const ARENA_X = 6;
export const ARENA_Y = 6;

interface ArenaLayout {
  tiles: number[][];
  spawnX: number;
  spawnY: number;
  bossX: number;
  bossY: number;
}

function buildRoom(): ArenaLayout {
  const tiles: number[][] = Array.from({ length: N }, () => new Array<number>(N).fill(TILE.VOID));
  for (let y = ARENA_Y; y < ARENA_Y + ARENA_H; y++) {
    for (let x = ARENA_X; x < ARENA_X + ARENA_W; x++) tiles[y][x] = TILE.FLOOR;
  }
  for (let x = ARENA_X - 1; x <= ARENA_X + ARENA_W; x++) {
    tiles[ARENA_Y - 1][x] = TILE.WALL;
    tiles[ARENA_Y + ARENA_H][x] = TILE.WALL;
  }
  for (let y = ARENA_Y - 1; y <= ARENA_Y + ARENA_H; y++) {
    tiles[y][ARENA_X - 1] = TILE.WALL;
    tiles[y][ARENA_X + ARENA_W] = TILE.WALL;
  }

  // --- Decorate Base Arena with Corner Torches ---
  // ติดคบเพลิงที่มุมกำแพงทั้ง 4 ด้าน เพื่อสร้างมิติแสงรอบนอกของลานประลอง
  tiles[ARENA_Y - 1][ARENA_X] = TILE.TORCH;
  tiles[ARENA_Y - 1][ARENA_X + ARENA_W - 1] = TILE.TORCH;
  tiles[ARENA_Y + ARENA_H][ARENA_X] = TILE.TORCH;
  tiles[ARENA_Y + ARENA_H][ARENA_X + ARENA_W - 1] = TILE.TORCH;

  const spawnX = ARENA_X + (ARENA_W >> 1);
  const spawnY = ARENA_Y + ARENA_H - 3;
  const gateX = ARENA_X + (ARENA_W >> 1);
  const gateY = ARENA_Y + 1;
  const bossX = gateX;
  const bossY = ARENA_Y + 4;

  // Solid until openBossGate() opens it.
  tiles[gateY][gateX] = TILE.BOSS_GATE;

  return { tiles, spawnX, spawnY, bossX, bossY };
}

/** Static Fire Hazard strips — Mk I only. Mk II/III take over the arena's fire layout dynamically (see arenaHazards.ts). */
function addGolemFeature(layout: ArenaLayout, floor: number): void {
  if (miniBossRepeatNumber(floor) !== 0) return;
  for (const y of [ARENA_Y + 7, ARENA_Y + 13]) {
    for (let x = ARENA_X + 1; x < ARENA_X + ARENA_W - 1; x++) layout.tiles[y][x] = TILE.FIRE_HAZARD;
  }
}

/** The 4 copper cover-pillar coordinates in Storm-Caller's arena (Mk II Magnetic Pull's targets, Mk III Overload Rain's shelter). */
export const STORM_CALLER_PILLARS: readonly [number, number][] = [
  [ARENA_X + 4, ARENA_Y + 5],
  [ARENA_X + ARENA_W - 5, ARENA_Y + 5],
  [ARENA_X + 4, ARENA_Y + ARENA_H - 5],
  [ARENA_X + ARENA_W - 5, ARENA_Y + ARENA_H - 5],
];

/** Add pillar cover for Storm-Caller's arena — permanent across Mk I/II/III. */
function addStormCallerFeature(layout: ArenaLayout): void {
  for (const [x, y] of STORM_CALLER_PILLARS) {
    layout.tiles[y][x] = TILE.WALL;
    // ติดคบเพลิงที่พื้นด้านล่างของเสาแต่ละต้น (ชดเชยความเป็นจุดบล็อก)
    // เพื่อให้แสงวูบวาบส่องทะลุเสาออกมาเป็นจุดๆ ในจังหวะหลบสายฟ้า
    layout.tiles[y + 1][x] = TILE.TORCH;
  }
}

// Glacial-Knight's arena has no static features.
function addStaticArenaFeature(layout: ArenaLayout, kind: MiniBossKind, floor: number): void {
  if (kind === 'INFERNO_GOLEM') addGolemFeature(layout, floor);
  else if (kind === 'STORM_CALLER') addStormCallerFeature(layout);
}

/** Floor 90 only: Glacial-Knight Mk III's Permafrost Storm makes Chilled movement burn extra Turns. */
export function isPermafrostStormFloor(floor: number): boolean {
  return archetypeForFloor(floor) === 'GLACIAL_KNIGHT' && miniBossRepeatNumber(floor) === 2;
}

/** Installs the Arena at `floor` into game state. */
export function enterArenaFloor(state: GameState, floor: number): void {
  resetVisualLerps();
  resetCameraLerp();
  const layout = buildRoom();
  const kind = archetypeForFloor(floor);
  addStaticArenaFeature(layout, kind, floor);

  const evolution = BOSS_EVOLUTION[floor];
  const boss = createEnemy(kind, `arena-${floor}-boss`, layout.bossX, layout.bossY);
  if (evolution) {
    boss.hp = evolution.hp;
    boss.maxHp = evolution.hp;
    boss.attack = evolution.attack;
    boss.defense = evolution.defense;
  }
  boss.awake = true; // No sneaking up on a mini-boss.
  scaleEnemyForNgPlus(boss, state.persistent.ngPlusLevel);
  discoverEnemy(state, boss.kind);

  state.run.currentFloor = floor;
  state.run.turnsRemaining = floorTurnLimit(state);
  state.run.playerX = layout.spawnX;
  state.run.playerY = layout.spawnY;
  state.dungeon.width = N;
  state.dungeon.height = N;
  state.dungeon.tiles = layout.tiles;
  state.dungeon.enemies = [boss];
  state.dungeon.items = [];
  state.dungeon.spawnX = layout.spawnX;
  state.dungeon.spawnY = layout.spawnY;
  // No Stairs in an Arena.
  state.dungeon.stairsX = layout.spawnX;
  state.dungeon.stairsY = layout.spawnY;
  state.dungeon.riftX = null;
  state.dungeon.riftY = null;
  state.dungeon.expiringTiles = [];
  state.dungeon.telegraphTiles = [];
}

/** Rewrites the current floor's Boss Gate tile(s) back to Stairs. */
export function openBossGate(state: GameState): void {
  const { tiles } = state.dungeon;
  for (let y = 0; y < tiles.length; y++) {
    for (let x = 0; x < tiles[y].length; x++) {
      if (tiles[y][x] === TILE.BOSS_GATE) tiles[y][x] = TILE.STAIRS;
    }
  }
}
