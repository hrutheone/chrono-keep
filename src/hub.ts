// The Hub (GDD Section 7: "Biomes, Temporal Anchors & the Hub"), Phase 13.
// A small, hand-authored Floor 0 (Watchwarden's Post) outside the procedural
// generator entirely — every loop begins here and every loop reset returns
// the player here. Contains the Upgrade Shop terminal (movement.ts opens the
// existing UPGRADE_SHOP overlay when the player steps onto it) and the
// Shortcut Gate (movement.ts opens menus.ts's destination picker).

import { enterFloor, TILE } from './mapgen';
import { DUNGEON_SIZE, floorTurnLimit, resetRunForNewLoop } from './state';
import { onFloorEntered } from './echoes';
import { saveGame } from './persistence';
import type { GameState } from './types';

const N = DUNGEON_SIZE;
export const HUB_FLOOR = 0;

const HUB_W = 12;
const HUB_H = 9;

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

/** Installs the Hub into game state, replacing whatever dungeon was there —
 * no enemies, no items, and (Section 7) a frozen turn counter: turnController's
 * runTickPhase/runCheckPhase both skip entirely while currentFloor === HUB_FLOOR,
 * so the value set here is just what the HUD displays, never decremented. */
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
  // Recall Rune safety (Known-good patterns): spawnX/Y must always be set on
  // floor entry, Hub included, even though nothing in the Hub can use it.
  state.dungeon.spawnX = hub.spawnX;
  state.dungeon.spawnY = hub.spawnY;
  state.dungeon.expiringTiles = [];
  state.dungeon.telegraphTiles = [];
}

/** The Shortcut Gate's destination picker contents: Floor 1 plus every
 * permanently unlocked Biome-start Anchor, ascending. */
export function gateDestinations(state: GameState): number[] {
  return [1, ...state.persistent.unlockedAnchors].sort((a, b) => a - b);
}

/** Selecting a Shortcut Gate destination (GDD Section 7): starts a fresh run
 * — starter gear, full HP/Stamina, a full per-floor timer — at that floor.
 * Screen/audio transitions are the caller's job (menus.ts), matching how
 * shop.ts/echoes.ts stay UI-agnostic and just persist the resulting state. */
export function warpToFloor(state: GameState, floor: number): void {
  resetRunForNewLoop(state, floor);
  enterFloor(state, floor);
  onFloorEntered(state);
  saveGame(state);
}
