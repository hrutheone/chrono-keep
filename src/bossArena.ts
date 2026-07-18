// The Chrono-Lich Arena (GDD Section 6C, Final Boss): a fixed, hand-authored
// Floor 99 — same "skip the generator, install dungeon/run fields directly"
// principle as hub.ts/arenas.ts. Kept separate from arenas.ts's Mini-Boss
// Arenas since there's no Boss Gate here (no Floor 100 to seal behind one —
// killEnemy's CHRONO_LICH branch calls triggerVictory directly) and no
// repeat-appearance scaling (the fight only ever happens once).

import { createEnemy, scaleEnemyForNgPlus } from './content';
import { resetChronoLichEncounter } from './enemyAI';
import { TILE } from './mapgen';
import { DUNGEON_SIZE, floorTurnLimit } from './state';
import type { Enemy, GameState, WorldItem } from './types';

const N = DUNGEON_SIZE;

export const BOSS_ID = 'chrono-lich-boss';
export const FINAL_BOSS_FLOOR = 99;

interface BossFloor {
  tiles: number[][];
  enemies: Enemy[];
  items: WorldItem[];
  spawnX: number;
  spawnY: number;
}

function buildArena(): BossFloor {
  const tiles: number[][] = Array.from({ length: N }, () => new Array<number>(N).fill(TILE.VOID));

  // A single square arena, walled on all sides, with 4 corner pillars for cover.
  const rx = 6;
  const ry = 6;
  const rw = 20;
  const rh = 20;
  for (let y = ry; y < ry + rh; y++) {
    for (let x = rx; x < rx + rw; x++) tiles[y][x] = TILE.FLOOR;
  }
  for (let x = rx - 1; x <= rx + rw; x++) {
    tiles[ry - 1][x] = TILE.WALL;
    tiles[ry + rh][x] = TILE.WALL;
  }
  for (let y = ry - 1; y <= ry + rh; y++) {
    tiles[y][rx - 1] = TILE.WALL;
    tiles[y][rx + rw] = TILE.WALL;
  }

  const pillars: [number, number][] = [
    [rx + 4, ry + 4],
    [rx + rw - 5, ry + 4],
    [rx + 4, ry + rh - 5],
    [rx + rw - 5, ry + rh - 5],
  ];
  for (const [px, py] of pillars) tiles[py][px] = TILE.WALL;

  const spawnX = rx + (rw >> 1);
  const spawnY = ry + rh - 2;

  const boss = createEnemy('CHRONO_LICH', BOSS_ID, rx + (rw >> 1), ry + 2);
  boss.awake = true; // No sneaking up on the Chrono-Lich.

  return { tiles, enemies: [boss], items: [], spawnX, spawnY };
}

/** Generates the arena and installs it into game state, replacing whatever
 * dungeon was there. `resetChronoLichEncounter` clears the boss's cadence
 * counter and one-time Rewind flag — BOSS_ID is a fixed id reused across
 * every Floor 99 attempt (unlike Mini-Boss Arenas' per-loop unique ids), so a
 * prior failed attempt's fight state must not leak into a fresh one. */
export function enterBossFloor(state: GameState): void {
  const floor = buildArena();
  resetChronoLichEncounter(BOSS_ID);
  state.run.currentFloor = FINAL_BOSS_FLOOR;
  state.run.turnsRemaining = floorTurnLimit(state);
  state.run.playerX = floor.spawnX;
  state.run.playerY = floor.spawnY;
  state.dungeon.width = N;
  state.dungeon.height = N;
  // Recall Rune must return to the arena entry point, not the prior floor.
  state.dungeon.spawnX = floor.spawnX;
  state.dungeon.spawnY = floor.spawnY;
  // Phase 19: no Stairs on Floor 99 — see hub.ts's identical fallback.
  state.dungeon.stairsX = floor.spawnX;
  state.dungeon.stairsY = floor.spawnY;
  // Phase 19: no Cursed Rifts on Floor 99.
  state.dungeon.riftX = null;
  state.dungeon.riftY = null;
  state.dungeon.tiles = floor.tiles;
  state.dungeon.enemies = floor.enemies;
  for (const enemy of state.dungeon.enemies) scaleEnemyForNgPlus(enemy, state.persistent.ngPlusLevel);
  state.dungeon.items = floor.items;
  state.dungeon.expiringTiles = [];
  state.dungeon.telegraphTiles = [];
}
