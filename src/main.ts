import './style.css';
import { createNewGameState } from './state';
import { enterFloor } from './mapgen';
import { loadAudioSettings, loadPersistent } from './persistence';
import { renderWorld } from './render';
import { installInput } from './movement';
import { installSkillInput } from './skills';
import { initAudio, installAudioControls, setMasterVolume, setMuted, updateAnxietyClock, updateLowHealthHeartbeat, updateMusicForState } from './audio';
import { initHud, updateHud } from './hud';
import { initMenus, updateMenus } from './menus';
import { installTouchControls } from './touchControls';
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

// Must match style.css's `@media (max-width: 768px)` breakpoint.
const MOBILE_BREAKPOINT = 768;

function resize(): void {
  if (window.innerWidth <= MOBILE_BREAKPOINT) {
    // Mobile portrait: let style.css (100% width, max-height clamp) size the
    // canvas responsively instead of forcing an integer-only scale. On most
    // phones an integer scale floors to 1x (a 240x160 canvas on a 390px-wide
    // screen), which is exactly the "text too small" bug this fixes — a
    // fractional CSS scale that fills the viewport width reads far better,
    // and image-rendering: pixelated keeps edges crisp even at non-integer
    // scale.
    canvas.style.width = '';
    canvas.style.height = '';
  } else {
    const scale = Math.max(
      1,
      Math.floor(Math.min(window.innerWidth / VIEW_W, window.innerHeight / VIEW_H)),
    );
    canvas.style.width = `${VIEW_W * scale}px`;
    canvas.style.height = `${VIEW_H * scale}px`;
  }
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
  updateAnxietyClock(state);
  updateLowHealthHeartbeat(state);
  requestAnimationFrame(frame);
}

const savedAudio = loadAudioSettings();
if (savedAudio) {
  setMasterVolume(savedAudio.volume);
  setMuted(savedAudio.muted);
}

initHud();
initAudio();
installAudioControls();
installInput(state);
installSkillInput(state);
initMenus(state);
installTouchControls();
// A live (but not yet "entered") dungeon renders behind the TITLE overlay;
// TITLE's Continue/New Game buttons are what actually start the run.
enterFloor(state, 1);
state.ui.currentScreen = 'TITLE';

requestAnimationFrame(frame);
