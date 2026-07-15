import './style.css';
import { createNewGameState } from './state';
import { enterFloor } from './mapgen';
import { loadPersistent } from './persistence';
import { renderWorld } from './render';
import { installInput } from './movement';
import { installSkillInput } from './skills';
import { initAudio, updateMusicForState } from './audio';
import { initHud, updateHud } from './hud';
import { initMenus, updateMenus } from './menus';
import type { GameState } from './types';

// Fixed internal resolution: a 30x20-tile viewport into the 32x32 map.
// The camera (Phase 2) pans this view; resize only changes the CSS scale.
export const VIEW_W = 240;
export const VIEW_H = 160;

// Single centralized game state. A saved `persistent` block (Section 7, point
// 9) resumes the same seed/upgrades/skills/shortcuts; only New Game rerolls.
export const state: GameState = createNewGameState();
const savedPersistent = loadPersistent();
if (savedPersistent) state.persistent = savedPersistent;

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
  updateMenus(state);
  updateMusicForState(state);
  requestAnimationFrame(frame);
}

initHud();
initAudio();
installInput(state);
installSkillInput(state);
initMenus(state);
// A live (but not yet "entered") dungeon renders behind the TITLE overlay;
// TITLE's Continue/New Game buttons are what actually start the run.
enterFloor(state, 1);
state.ui.currentScreen = 'TITLE';

requestAnimationFrame(frame);
