// Silas, the Old Watchwarden — a wandering, dialogue-only Hub NPC.

import { TILE, effectiveTileAt } from './mapgen';
import type { GameState } from './types';

export const SILAS_ID = 'silas';

const SILAS_WAIT_WEIGHT = 10;
const SILAS_DIRECTIONS: readonly [number, number][] = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
];

function silasCanStandAt(state: GameState, x: number, y: number): boolean {
  if (state.run.playerX === x && state.run.playerY === y) return false;
  return effectiveTileAt(state, x, y) === TILE.FLOOR;
}

/** True while (x, y) holds Silas — only ever meaningful on the Hub floor. */
export function isSilasAt(state: GameState, x: number, y: number): boolean {
  const npc = state.dungeon.npc;
  return npc !== null && npc.x === x && npc.y === y;
}

/** Silas takes at most one step per player action — mostly Waits; he's old. */
export function stepSilas(state: GameState): void {
  const npc = state.dungeon.npc;
  if (!npc) return;

  const pool: readonly [number, number][] = [
    ...Array.from({ length: SILAS_WAIT_WEIGHT }, (): [number, number] => [0, 0]),
    ...SILAS_DIRECTIONS,
  ];
  const [dx, dy] = pool[Math.floor(Math.random() * pool.length)];
  if (dx === 0 && dy === 0) return;

  const nx = npc.x + dx;
  const ny = npc.y + dy;
  if (!silasCanStandAt(state, nx, ny)) return;
  npc.x = nx;
  npc.y = ny;
}
