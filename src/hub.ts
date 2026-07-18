// The Hub: a small, hand-authored Floor 0 (Watchwarden's Post) outside the
// procedural generator — every loop begins and resets here. Contains the
// Upgrade Shop terminal and Shortcut Gate (movement.ts opens their overlays
// when the player steps onto them).

import { enterFloor, TILE } from './mapgen';
import { DUNGEON_SIZE, floorTurnLimit, resetRunForNewLoop } from './state';
import { onFloorEntered } from './echoes';
import { saveGame, saveRunSnapshot } from './persistence';
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

/** One open, walled room centered in the 32x32 grid — no BFS/turn-budget
 * check needed (it's hand-authored, not procedural), just enough space to
 * fit the terminal and gate a few tiles apart from spawn. */
function buildHub(): HubLayout {
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

  return { tiles, spawnX, spawnY };
}

/** Installs the Hub into game state — no enemies, no items, and a frozen turn
 * counter: turnController skips tick/check phases while currentFloor ===
 * HUB_FLOOR, so the value set here is just what the HUD displays. */
export function enterHub(state: GameState): void {
  const hub = buildHub();
  state.run.currentFloor = HUB_FLOOR;
  state.run.turnsRemaining = floorTurnLimit(state);
  state.run.playerX = hub.spawnX;
  state.run.playerY = hub.spawnY;
  state.dungeon.width = N;
  state.dungeon.height = N;
  state.dungeon.tiles = hub.tiles;
  state.dungeon.enemies = [];
  state.dungeon.items = [];
  // spawnX/Y must always be set on floor entry, even though the Hub has no
  // Recall Rune to use it.
  state.dungeon.spawnX = hub.spawnX;
  state.dungeon.spawnY = hub.spawnY;
  // No Stairs in the Hub — set equal to spawn, same harmless-default reasoning.
  state.dungeon.stairsX = hub.spawnX;
  state.dungeon.stairsY = hub.spawnY;
  state.dungeon.riftX = null;
  state.dungeon.riftY = null;
  state.dungeon.expiringTiles = [];
  state.dungeon.telegraphTiles = [];
}

/** The Shortcut Gate's destination picker contents: Floor 1 plus every
 * permanently unlocked Biome-start Anchor, ascending. */
export function gateDestinations(state: GameState): number[] {
  return [1, ...state.persistent.unlockedAnchors].sort((a, b) => a - b);
}

/** Selecting a Shortcut Gate destination starts a fresh run — starter gear,
 * full HP/Stamina, a full per-floor timer — at that floor. Screen/audio
 * transitions are the caller's job (menus.ts); this stays UI-agnostic. */
export function warpToFloor(state: GameState, floor: number): void {
  resetRunForNewLoop(state, floor);
  enterFloor(state, floor);
  onFloorEntered(state);
  saveGame(state);
  // Write the run immediately so a reload before the first move resumes here
  // instead of the pre-warp snapshot.
  saveRunSnapshot(state);
}
