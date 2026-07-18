// Mini-Boss Arenas (GDD Section 6C, Phase 15): fixed, hand-authored layouts
// at Floors 10/20/30 and their empowered repeats at 40/50/60/70/80/90 — never
// touch mapgen.ts's seeded generator, same "skip the generator, install
// dungeon/run fields directly" principle as hub.ts. Floor 99's Chrono-Lich
// arena is separate territory (Phase 16, bossArena.ts) — deliberately not
// touched here.

import { createEnemy, scaleEnemyForNgPlus } from './content';
import { TILE } from './mapgen';
import { DUNGEON_SIZE, floorTurnLimit } from './state';
import type { GameState } from './types';

const N = DUNGEON_SIZE;

export const ARENA_FLOORS = [10, 20, 30, 40, 50, 60, 70, 80, 90] as const;

export function isArenaFloor(floor: number): boolean {
  return (ARENA_FLOORS as readonly number[]).includes(floor);
}

export type MiniBossKind = 'INFERNO_GOLEM' | 'STORM_CALLER' | 'GLACIAL_KNIGHT';
const CYCLE: readonly MiniBossKind[] = ['INFERNO_GOLEM', 'STORM_CALLER', 'GLACIAL_KNIGHT'];

/** Which archetype guards a given Arena floor. GDD: F10/40/70 Inferno-Golem,
 * F20/50/80 Storm-Caller, F30/60/90 Glacial-Knight — the Mk II/III cycle
 * reuses the same three kinds rather than adding new ones. */
export function archetypeForFloor(floor: number): MiniBossKind {
  return CYCLE[Math.floor((floor - 10) / 10) % 3];
}

/** 0 on a boss's first (Mk I, F10/20/30) appearance, 1 for Mk II (F40/50/60),
 * 2 for Mk III (F70/80/90). Exported for enemyAI.ts's Mk-specific ability
 * twists (e.g. Mk II Golem's 5x5 slam) — those live with the rest of a
 * boss's AI, not here. */
export function miniBossRepeatNumber(floor: number): number {
  return Math.floor((floor - 10) / 30);
}

/** Empowered-variant scaling (Section 6C): x2.5 HP / x1.6 ATK per repeat
 * appearance, compounding — a no-op (1x) on a boss's first appearance.
 * Mini-bosses are otherwise exempt from Depth Scaling entirely (final,
 * hand-tuned base stats live in content.ts's BESTIARY). */
export function miniBossRepeatMultiplier(floor: number): { hp: number; attack: number } {
  const n = miniBossRepeatNumber(floor);
  return { hp: Math.pow(2.5, n), attack: Math.pow(1.6, n) };
}

const ARENA_W = 20;
const ARENA_H = 20;
const ARENA_X = 6;
const ARENA_Y = 6;

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

  const spawnX = ARENA_X + (ARENA_W >> 1);
  const spawnY = ARENA_Y + ARENA_H - 3;
  const gateX = ARENA_X + (ARENA_W >> 1);
  const gateY = ARENA_Y + 1;
  const bossX = gateX;
  const bossY = ARENA_Y + 4;

  // Boss Gate (tile 6): already excluded from mapgen.ts's WALKABLE set, so
  // it's solid with zero extra code — opened only by openBossGate() below.
  tiles[gateY][gateX] = TILE.BOSS_GATE;

  return { tiles, spawnX, spawnY, bossX, bossY };
}

/** Inferno-Golem's arena: permanent Fire Hazard strips baked directly into
 * the floor tiles (not `expiringTiles` — these never expire), "constrain
 * kiting lanes" per the GDD. */
function addGolemFeature(layout: ArenaLayout): void {
  for (const y of [ARENA_Y + 7, ARENA_Y + 13]) {
    for (let x = ARENA_X + 1; x < ARENA_X + ARENA_W - 1; x++) layout.tiles[y][x] = TILE.FIRE_HAZARD;
  }
}

/** Storm-Caller's arena: 4 copper-pylon pillars (plain walls) that block
 * Chain Bolt — cover is the mechanic. */
function addStormCallerFeature(layout: ArenaLayout): void {
  const pillars: [number, number][] = [
    [ARENA_X + 4, ARENA_Y + 5],
    [ARENA_X + ARENA_W - 5, ARENA_Y + 5],
    [ARENA_X + 4, ARENA_Y + ARENA_H - 5],
    [ARENA_X + ARENA_W - 5, ARENA_Y + ARENA_H - 5],
  ];
  for (const [x, y] of pillars) layout.tiles[y][x] = TILE.WALL;
}

// Glacial-Knight's arena is deliberately an open room with no static feature
// (GDD/plan) — its Ice-Barricade wall is a combat-time effect (expiringTiles
// in enemyAI.ts), not a layout one, so there's no entry for it here.
const ARENA_FEATURES: Partial<Record<MiniBossKind, (layout: ArenaLayout) => void>> = {
  INFERNO_GOLEM: addGolemFeature,
  STORM_CALLER: addStormCallerFeature,
};

/** Installs the Arena at `floor` into game state, replacing whatever dungeon
 * was there — never generated from the seeded procedural generator. */
export function enterArenaFloor(state: GameState, floor: number): void {
  const layout = buildRoom();
  const kind = archetypeForFloor(floor);
  ARENA_FEATURES[kind]?.(layout);

  const mult = miniBossRepeatMultiplier(floor);
  const boss = createEnemy(kind, `arena-${floor}-boss`, layout.bossX, layout.bossY);
  boss.hp = Math.round(boss.hp * mult.hp);
  boss.maxHp = boss.hp;
  boss.attack = Math.round(boss.attack * mult.attack);
  boss.awake = true; // No sneaking up on a mini-boss (matches the Chrono-Lich precedent).
  scaleEnemyForNgPlus(boss, state.persistent.ngPlusLevel);

  state.run.currentFloor = floor;
  state.run.turnsRemaining = floorTurnLimit(state);
  state.run.playerX = layout.spawnX;
  state.run.playerY = layout.spawnY;
  state.dungeon.width = N;
  state.dungeon.height = N;
  state.dungeon.tiles = layout.tiles;
  state.dungeon.enemies = [boss];
  state.dungeon.items = [];
  // Recall Rune safety (recurring gotcha every time an arena comes up).
  state.dungeon.spawnX = layout.spawnX;
  state.dungeon.spawnY = layout.spawnY;
  // Phase 19: no Stairs in an Arena — see hub.ts's identical fallback.
  state.dungeon.stairsX = layout.spawnX;
  state.dungeon.stairsY = layout.spawnY;
  // Phase 19: no Cursed Rifts in an Arena.
  state.dungeon.riftX = null;
  state.dungeon.riftY = null;
  state.dungeon.expiringTiles = [];
  state.dungeon.telegraphTiles = [];
}

/** Called from combat.ts's killEnemy mini-boss branch: rewrites the current
 * floor's Boss Gate tile(s) back to Stairs, opening the way down. */
export function openBossGate(state: GameState): void {
  const { tiles } = state.dungeon;
  for (let y = 0; y < tiles.length; y++) {
    for (let x = 0; x < tiles[y].length; x++) {
      if (tiles[y][x] === TILE.BOSS_GATE) tiles[y][x] = TILE.STAIRS;
    }
  }
}
