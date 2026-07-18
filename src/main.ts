import './style.css';
import { loadSpritesheet } from './assets';
import { createNewGameState } from './state';
import { HUB_FLOOR, enterHub } from './hub';
import { enterFloor } from './mapgen';
import { FINAL_BOSS_FLOOR, enterBossFloor } from './bossArena';
import { isArenaFloor, enterArenaFloor } from './arenas';
import { loadAudioSettings, loadPersistent, loadRunSnapshot, saveRunSnapshot } from './persistence';
import { renderWorld, TILE_SIZE } from './render';
import { installInput } from './movement';
import { installSkillInput } from './skills';
import { initAudio, installAudioControls, setMasterVolume, setMuted, updateAnxietyClock, updateLowHealthHeartbeat, updateMusicForState } from './audio';
import { initHud, updateHud } from './hud';
import { initMenus, updateMenus } from './menus';
import { installTouchControls } from './touchControls';
import type { GameState } from './types';

// Desktop's internal resolution: a 30x20-tile viewport. Camera pans this view.
export const VIEW_W = 480;
export const VIEW_H = 320;

// Mobile portrait resolution: a tighter 20x15-tile camera.
const MOBILE_VIEW_TILES_W = 20;
const MOBILE_VIEW_TILES_H = 15;
const MOBILE_VIEW_W = MOBILE_VIEW_TILES_W * TILE_SIZE;
const MOBILE_VIEW_H = MOBILE_VIEW_TILES_H * TILE_SIZE;

// Single centralized game state.
export const state: GameState = createNewGameState();
const savedPersistent = loadPersistent();
if (savedPersistent) state.persistent = savedPersistent;

const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
const ctx = canvas.getContext('2d')!;

// The active internal resolution.
let viewW = VIEW_W;
let viewH = VIEW_H;

// Must match style.css's `@media (max-width: 768px)` breakpoint.
const MOBILE_BREAKPOINT = 768;

function resize(): void {
  const mobile = window.innerWidth <= MOBILE_BREAKPOINT;
  const nextViewW = mobile ? MOBILE_VIEW_W : VIEW_W;
  const nextViewH = mobile ? MOBILE_VIEW_H : VIEW_H;
  if (nextViewW !== viewW || nextViewH !== viewH || canvas.width !== nextViewW || canvas.height !== nextViewH) {
    viewW = nextViewW;
    viewH = nextViewH;
    canvas.width = viewW;
    canvas.height = viewH;
  }

  if (mobile) {
    // Mobile portrait: let style.css size the canvas responsively.
    canvas.style.width = '';
    canvas.style.height = '';
  } else {
    const scale = Math.max(
      1,
      Math.floor(Math.min(window.innerWidth / viewW, window.innerHeight / viewH)),
    );
    canvas.style.width = `${viewW * scale}px`;
    canvas.style.height = `${viewH * scale}px`;
  }
  // Changing canvas properties can reset context state — re-disable smoothing.
  ctx.imageSmoothingEnabled = false;
}

window.addEventListener('resize', resize);
resize();

// Track visual viewport height to avoid overlap with mobile Safari's bottom URL bar.
function setAppHeight(): void {
  const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  document.documentElement.style.setProperty('--app-height', `${vh}px`);
}
window.visualViewport?.addEventListener('resize', setAppHeight);
window.addEventListener('resize', setAppHeight);
setAppHeight();

function frame(): void {
  renderWorld(ctx, state, viewW, viewH);
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
// Resume from backgrounded mid-floor run if available.
const savedRun = loadRunSnapshot();
if (savedRun) {
  const floor = savedRun.currentFloor;
  if (floor === HUB_FLOOR) enterHub(state);
  else if (floor === FINAL_BOSS_FLOOR) enterBossFloor(state);
  else if (isArenaFloor(floor)) enterArenaFloor(state, floor);
  else enterFloor(state, floor);
  state.run = savedRun;
  state.ui.currentScreen = 'GAME';
} else {
  // Hub renders behind the TITLE overlay.
  enterHub(state);
  state.ui.currentScreen = 'TITLE';
}

// Save mid-turn run state before tab suspension.
function saveRunSnapshotIfLive(): void {
  if (state.ui.currentScreen === 'GAME') saveRunSnapshot(state);
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') saveRunSnapshotIfLive();
});
window.addEventListener('pagehide', saveRunSnapshotIfLive);

// Render loop waits for spritesheet to decode.
loadSpritesheet()
  .then(() => requestAnimationFrame(frame))
  .catch((err) => {
    console.error(err);
    // Start loop for HTML overlays if sprite loading fails.
    requestAnimationFrame(frame);
  });
