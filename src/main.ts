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

// Desktop's internal resolution: a 30x20-tile viewport into the 32x32 map,
// at the new-spritesheet.png tileset's native 16px-per-tile (render.ts's
// TILE_SIZE) — was 240x160 (8px/tile) back when the old sheet's art was
// 8x8; kept at 8px/tile after the sheet migration meant every sprite drew
// downscaled 16->8 and then got blown back up by the CSS/resize() scale
// below, losing half the new art's detail to a pointless double-resample.
// The camera (Phase 2) pans this view. Mobile uses a different, smaller
// resolution — see MOBILE_VIEW_W/H below — so resize() also owns switching
// canvas.width/height, not just the CSS display scale.
export const VIEW_W = 480;
export const VIEW_H = 320;

// Mobile portrait (Section 8): the desktop 30x20-tile view scaled up via CSS
// to fill a narrow phone width reads as "too zoomed out" — the fix is a
// tighter 20x15-tile camera (fewer tiles, each one bigger), not a bigger
// canvas box around the same 30x20 view.
const MOBILE_VIEW_TILES_W = 20;
const MOBILE_VIEW_TILES_H = 15;
const MOBILE_VIEW_W = MOBILE_VIEW_TILES_W * TILE_SIZE;
const MOBILE_VIEW_H = MOBILE_VIEW_TILES_H * TILE_SIZE;

// Single centralized game state. A saved `persistent` block (Section 7, point
// 9) resumes the same seed/upgrades/skills/shortcuts; only New Game rerolls.
export const state: GameState = createNewGameState();
const savedPersistent = loadPersistent();
if (savedPersistent) state.persistent = savedPersistent;

const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
const ctx = canvas.getContext('2d')!;

// The active internal resolution — desktop's fixed 30x20 or mobile's tighter
// 20x15 (set by resize() below, which also owns the actual canvas.width/
// height). frame() reads these each tick instead of the desktop-only
// VIEW_W/VIEW_H constants above.
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
    // Mobile portrait: let style.css (100% width, max-height clamp,
    // object-fit: contain) size the canvas responsively instead of forcing
    // an integer-only scale. On most phones an integer scale floors to 1x (a
    // 240x240 canvas on a 390px-wide screen), which is exactly the "text too
    // small" bug this fixes — a fractional CSS scale that fills the
    // viewport width reads far better, and image-rendering: pixelated keeps
    // edges crisp even at non-integer scale.
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

// Mobile Safari's bottom URL bar can be expanded (full URL + icons) or
// collapsed (compact), and 100dvh doesn't reliably repaint to the smaller
// expanded-bar size on this page — the toolbar's usual auto-collapse is
// triggered by scrolling, and html/body here are overflow:hidden (no scroll
// ever happens) so it can get stuck expanded with #app's 100dvh still
// measuring the larger, collapsed-bar viewport. That left the touch-controls
// (bottom of the mobile flex column) rendered partly under the toolbar.
// window.visualViewport.height tracks the actually-visible area live, so
// mirror it into a CSS var #app's mobile height falls back to.
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
// Phase 20 (mobile background/reload survival): if a live run was mid-floor
// when the tab was backgrounded/discarded, resume straight into it instead
// of booting to TITLE. `state.dungeon` is never serialized (only `run` is) —
// it's rebuilt deterministically here the same way every floor entry already
// does, then the saved `run` (HP/inventory/position/turnsRemaining/etc.) is
// laid on top, since each of these entry functions also writes a handful of
// `run` fields (currentFloor, spawn position) as a side effect of building
// the dungeon that the snapshot must override.
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
  // A live (but not yet "entered") Hub renders behind the TITLE overlay;
  // TITLE's Continue/New Game buttons are what actually start the run (Phase
  // 13: both now land in the Hub itself, same as this background view).
  enterHub(state);
  state.ui.currentScreen = 'TITLE';
}

// Phase 20: the turn-based save in turnController.ts's resolvePlayerTurn
// covers normal play; these cover "backgrounded mid-thought with no move
// yet" — the exact moment right before a mobile OS might suspend/discard the
// tab. `pagehide` fires on both a background tab-switch and a real
// navigation/close; `visibilitychange` is the more reliable of the two on
// iOS Safari specifically, so both are wired for coverage.
// Gated on currentScreen === 'GAME': `state.run`/`enterHub` are always live
// in memory (the Hub renders behind TITLE decoratively per the comment
// above), so saving unconditionally here would snapshot that decorative Hub
// state and make main.ts's resume-on-boot check above mistake "never even
// clicked New Game" for "was mid-run" on the very next load.
function saveRunSnapshotIfLive(): void {
  if (state.ui.currentScreen === 'GAME') saveRunSnapshot(state);
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') saveRunSnapshotIfLive();
});
window.addEventListener('pagehide', saveRunSnapshotIfLive);

// GDD Section 4: the render loop must not start until the spritesheet has
// decoded — the first frame() would otherwise drawImage an empty image (a
// silent no-op on some browsers, an exception on others). The HTML UI (HUD,
// menus) also only updates inside frame(), so everything waits together.
loadSpritesheet()
  .then(() => requestAnimationFrame(frame))
  .catch((err) => {
    console.error(err);
    // Still start the loop so the HTML overlays (TITLE, Help) stay usable
    // and the failure is visible as a blank world rather than a dead page.
    requestAnimationFrame(frame);
  });
