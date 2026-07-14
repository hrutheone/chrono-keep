import './style.css';
import { createNewGameState } from './state';
import { enterFloor } from './mapgen';
import { renderWorld } from './render';
import { installInput } from './movement';
import { initHud, updateHud } from './hud';
import type { GameState } from './types';

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

function frame(): void {
  renderWorld(ctx, state, VIEW_W, VIEW_H);
  updateHud(state);
  requestAnimationFrame(frame);
}

initHud();
installInput(state);
enterFloor(state, 1);
state.ui.currentScreen = 'GAME';

requestAnimationFrame(frame);
