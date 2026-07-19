// Floor 0: starting hub with shop and shortcut gate.

import { enterFloor, TILE } from './mapgen';
import { DUNGEON_SIZE, floorTurnLimit, resetRunForNewLoop } from './state';
import { onFloorEntered } from './echoes';
import { saveGame, saveRunSnapshot } from './persistence';
import { SMUGGLER_MIN_LOOP_COUNT, SMUGGLER_SPAWN_CHANCE } from './content';
import { resetVisualLerps } from './animation';
import { resetCameraLerp } from './camera';
import type { GameState } from './types';

const N = DUNGEON_SIZE;
export const HUB_FLOOR = 0;

const HUB_W = 8;
const HUB_H = 6;

interface HubLayout {
  tiles: number[][];
  spawnX: number;
  spawnY: number;
}

/** Centered hub room layout. */
function buildHub(smugglerPresent: boolean): HubLayout {
  const tiles: number[][] = Array.from({ length: N }, () => new Array<number>(N).fill(TILE.VOID));

  const originX = Math.floor((N - HUB_W) / 2);
  const originY = Math.floor((N - HUB_H) / 2);

  for (let y = originY; y < originY + HUB_H; y++) {
    for (let x = originX; x < originX + HUB_W; x++) tiles[y][x] = TILE.FLOOR;
  }
  for (let x = originX - 1; x <= originX + HUB_W; x++) {
    tiles[originY - 1][x] = TILE.WALL;
    tiles[originY + HUB_H][x] = TILE.WALL;
  }
  for (let y = originY - 1; y <= originY + HUB_H; y++) {
    tiles[y][originX - 1] = TILE.WALL;
    tiles[y][originX + HUB_W] = TILE.WALL;
  }

  const spawnX = originX + (HUB_W >> 1);
  const spawnY = originY + HUB_H - 2;
  tiles[originY + 2][originX + 2] = TILE.SHOP_TERMINAL;
  tiles[originY + 2][originX + HUB_W - 3] = TILE.SHORTCUT_GATE;
  // The Eternity Tree — a fixed decorative corner, always present.
  tiles[originY][originX] = TILE.TREE;
  if (smugglerPresent) tiles[originY + 3][originX + 4] = TILE.SMUGGLER;

  return { tiles, spawnX, spawnY };
}

/** Installs the Hub into game state. */
export function enterHub(state: GameState): void {
  resetVisualLerps();
  resetCameraLerp();
  state.run.smugglerPresent = state.persistent.loopCount > SMUGGLER_MIN_LOOP_COUNT && Math.random() < SMUGGLER_SPAWN_CHANCE;
  const hub = buildHub(state.run.smugglerPresent);
  state.run.currentFloor = HUB_FLOOR;
  state.run.turnsRemaining = floorTurnLimit(state);
  state.run.playerX = hub.spawnX;
  state.run.playerY = hub.spawnY;
  state.dungeon.width = N;
  state.dungeon.height = N;
  state.dungeon.tiles = hub.tiles;
  state.dungeon.enemies = [];
  state.dungeon.items = [];
  // Required for floor entry.
  state.dungeon.spawnX = hub.spawnX;
  state.dungeon.spawnY = hub.spawnY;
  // No stairs in Hub.
  state.dungeon.stairsX = hub.spawnX;
  state.dungeon.stairsY = hub.spawnY;
  state.dungeon.riftX = null;
  state.dungeon.riftY = null;
  state.dungeon.expiringTiles = [];
  state.dungeon.telegraphTiles = [];
}

/** Valid shortcut destinations. */
export function gateDestinations(state: GameState): number[] {
  return [1, ...state.persistent.unlockedAnchors].sort((a, b) => a - b);
}

/** Warps to floor and starts fresh run. */
export function warpToFloor(state: GameState, floor: number): void {
  resetRunForNewLoop(state, floor);
  enterFloor(state, floor);
  onFloorEntered(state);
  saveGame(state);
  // Save immediately to resume here.
  saveRunSnapshot(state);
}
