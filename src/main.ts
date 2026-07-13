import './style.css';
import { COLOR_BG } from './palette';
import { createNewGameState } from './state';
import { PLAYER_SPRITE } from './sprites';
import type { GameState } from './types';

/** Tile size in logical pixels — all sprites are 8x8. */
export const TILE_SIZE = PLAYER_SPRITE.length;

// Fixed internal resolution: a 30x20-tile viewport into the 32x32 map.
// The camera (Phase 2) pans this view; resize only changes the CSS scale.
export const VIEW_W = 240;
export const VIEW_H = 160;

// Single centralized game state.
export const state: GameState = createNewGameState();

const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
const ctx = canvas.getContext('2d')!;

canvas.width = VIEW_W;
canvas.height = VIEW_H;

function resize(): void {
  const scale = Math.max(
    1,
    Math.floor(Math.min(window.innerWidth / VIEW_W, window.innerHeight / VIEW_H)),
  );
  canvas.style.width = `${VIEW_W * scale}px`;
  canvas.style.height = `${VIEW_H * scale}px`;
  // Changing canvas properties can reset context state — re-disable smoothing.
  ctx.imageSmoothingEnabled = false;
}

window.addEventListener('resize', resize);
resize();

function render(): void {
  ctx.fillStyle = COLOR_BG;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  // Phase 1+: tiles, entities, and particles draw here.
}

function frame(): void {
  render();
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

console.log(`Chrono-Keep initialized — seed ${state.persistent.rngSeed}`);
