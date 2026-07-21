// World rendering logic.

import {
  COLOR_BG,
  COLOR_LIGHT,
  COLOR_MID,
  COLOR_PLAYER_LIGHT,
  COLOR_ENEMY_LIGHT,
  COLOR_ENEMY_MID,
  COLOR_FLASH,
  COLOR_FIRE,
  COLOR_FROST,
  COLOR_CHRONO,
  BIOME_WALL_TINTS,
} from './palette';
import { TILE, effectiveTileAt } from './mapgen';
import { eliteAffixColor, eternityTreeStage } from './content';
import { isArenaFloor } from './arenas';
import { FINAL_BOSS_FLOOR } from './bossArena';
import { HUB_FLOOR } from './hub';
import { SILAS_ID } from './npc';
import { spritesheet, SPRITE_PX } from './assets';
import {
  ACCESSORY_SPRITE_BY_NAME,
  CONSUMABLE_SPRITE_BY_NAME,
  DECOR_DIRT,
  DECOR_GRASS,
  POTION_SPRITE_BY_NAME,
  RELIC_SPRITE_BY_EFFECT,
  SPRITES,
  TREE_STAGE_SPRITES,
  WEAPON_SPRITE_BY_NAME,
  type SpriteRef,
} from './sprites';
import { PLAYER_ID, updateAnimations, getEntityVisual, getDeathGhosts, getParticles, getBeams } from './animation';
import { stepCameraLerp } from './camera';
import type { EntityVisual, GhostVisual } from './animation';
import { drawGlyphText, getFloatingTexts, measureGlyphText, type FloatKind } from './floatingText';
import type { GameState, Enemy } from './types';

// Match assets.ts SPRITE_PX.
export const TILE_SIZE = 16;
// Recomputed per frame.
export let VIEWPORT_TILES_W = 30;
export let VIEWPORT_TILES_H = 20;


const FLOAT_COLOR: Record<FloatKind, string> = {
  damage: COLOR_LIGHT,
  crit: COLOR_FLASH,
  immune: COLOR_MID,
  turns: COLOR_PLAYER_LIGHT,
};

/** Draws spritesheet cell. rotQuarters rotates clockwise in 90-degree steps, about the tile center. */
export function drawTile(
  ctx: CanvasRenderingContext2D,
  col: number,
  row: number,
  dx: number,
  dy: number,
  flipX = false,
  size = TILE_SIZE,
  rotQuarters = 0,
): void {
  const sx = col * SPRITE_PX;
  const sy = row * SPRITE_PX;
  if (flipX || rotQuarters) {
    ctx.save();
    ctx.translate(dx + size / 2, dy + size / 2);
    if (rotQuarters) ctx.rotate((rotQuarters * Math.PI) / 2);
    if (flipX) ctx.scale(-1, 1);
    ctx.drawImage(spritesheet, sx, sy, SPRITE_PX, SPRITE_PX, -size / 2, -size / 2, size, size);
    ctx.restore();
  } else {
    ctx.drawImage(spritesheet, sx, sy, SPRITE_PX, SPRITE_PX, dx, dy, size, size);
  }
}

// Damage flash rendering.
const scratch = document.createElement('canvas');
scratch.width = SPRITE_PX;
scratch.height = SPRITE_PX;
const scratchCtx = scratch.getContext('2d')!;
scratchCtx.imageSmoothingEnabled = false;

function drawTileFlash(
  ctx: CanvasRenderingContext2D,
  col: number,
  row: number,
  dx: number,
  dy: number,
  flipX = false,
  size = TILE_SIZE,
): void {
  scratchCtx.globalCompositeOperation = 'source-over';
  scratchCtx.clearRect(0, 0, SPRITE_PX, SPRITE_PX);
  scratchCtx.drawImage(spritesheet, col * SPRITE_PX, row * SPRITE_PX, SPRITE_PX, SPRITE_PX, 0, 0, SPRITE_PX, SPRITE_PX);
  scratchCtx.globalCompositeOperation = 'source-in';
  scratchCtx.fillStyle = COLOR_FLASH;
  scratchCtx.fillRect(0, 0, SPRITE_PX, SPRITE_PX);
  if (flipX) {
    ctx.save();
    ctx.translate(dx + size, dy);
    ctx.scale(-1, 1);
    ctx.drawImage(scratch, 0, 0, SPRITE_PX, SPRITE_PX, 0, 0, size, size);
    ctx.restore();
  } else {
    ctx.drawImage(scratch, 0, 0, SPRITE_PX, SPRITE_PX, dx, dy, size, size);
  }
}

function drawRef(ctx: CanvasRenderingContext2D, ref: SpriteRef, dx: number, dy: number, flipX = false, flash = false, size = TILE_SIZE, rotQuarters = 0): void {
  if (flash) drawTileFlash(ctx, ref.col, ref.row, dx, dy, flipX, size);
  else drawTile(ctx, ref.col, ref.row, dx, dy, flipX, size, rotQuarters);
}

const tintedTileCache = new Map<string, HTMLCanvasElement>();

/** Draws a wall sprite washed with the current Biome's tint (untinted Biome 1 falls back to plain drawTile). */
function drawTintedRef(ctx: CanvasRenderingContext2D, ref: SpriteRef, dx: number, dy: number, tint: string | null, rotQuarters = 0): void {
  if (!tint) {
    drawTile(ctx, ref.col, ref.row, dx, dy, false, TILE_SIZE, rotQuarters);
    return;
  }

  const key = `${ref.col}_${ref.row}_${tint}_${rotQuarters}`;
  let cached = tintedTileCache.get(key);
  if (!cached) {
    cached = document.createElement('canvas');
    cached.width = SPRITE_PX;
    cached.height = SPRITE_PX;
    const cCtx = cached.getContext('2d')!;
    cCtx.imageSmoothingEnabled = false;

    if (rotQuarters > 0) {
      cCtx.translate(SPRITE_PX / 2, SPRITE_PX / 2);
      cCtx.rotate((Math.PI / 2) * rotQuarters);
      cCtx.translate(-SPRITE_PX / 2, -SPRITE_PX / 2);
    }
    cCtx.drawImage(spritesheet, ref.col * SPRITE_PX, ref.row * SPRITE_PX, SPRITE_PX, SPRITE_PX, 0, 0, SPRITE_PX, SPRITE_PX);

    cCtx.globalCompositeOperation = 'source-atop';
    cCtx.fillStyle = tint;
    cCtx.fillRect(0, 0, SPRITE_PX, SPRITE_PX);

    tintedTileCache.set(key, cached);
  }

  ctx.drawImage(cached, 0, 0, SPRITE_PX, SPRITE_PX, dx, dy, TILE_SIZE, TILE_SIZE);
}


const TILE_REFS: Partial<Record<number, SpriteRef>> = {
  [TILE.FLOOR]: SPRITES.FLOOR,
  [TILE.WALL]: SPRITES.WALL,
  [TILE.DOOR]: SPRITES.DOOR,
  [TILE.STAIRS]: SPRITES.STAIRS,
  [TILE.SHORTCUT_GATE]: SPRITES.SHORTCUT_GATE,
  [TILE.BOSS_GATE]: SPRITES.BOSS_GATE,
  [TILE.FIRE_HAZARD]: SPRITES.FIRE_HAZARD,
  [TILE.FROST_HAZARD]: SPRITES.FROST_HAZARD,
  [TILE.SHOP_TERMINAL]: SPRITES.SHOP_TERMINAL,
  [TILE.ECHO_WELL]: SPRITES.ECHO_WELL,
  [TILE.CHRONO_ANVIL]: SPRITES.CHRONO_ANVIL,
  [TILE.TORCH]: SPRITES.FIRE_HAZARD,
  [TILE.SMUGGLER]: SPRITES.SMUGGLER,
};

// Wall autotiling: bitmask of which cardinal neighbors are also walls (N=1, E=2, S=4, W=8)
// picks a sprite + 90-degree rotation so wall art always meets its neighbors correctly.
interface WallVariant {
  ref: SpriteRef;
  rot: number;
}
const WALL_VARIANT_BY_MASK: Record<number, WallVariant> = {
  0: { ref: SPRITES.WALL, rot: 0 }, // isolated
  1: { ref: SPRITES.WALL_END, rot: 2 }, // N (base art connects S, so flip 180)
  2: { ref: SPRITES.WALL_END, rot: 3 }, // E
  4: { ref: SPRITES.WALL_END, rot: 0 }, // S
  8: { ref: SPRITES.WALL_END, rot: 1 }, // W
  5: { ref: SPRITES.WALL, rot: 0 }, // N+S
  10: { ref: SPRITES.WALL, rot: 1 }, // E+W
  6: { ref: SPRITES.WALL_CORNER, rot: 0 }, // E+S
  12: { ref: SPRITES.WALL_CORNER, rot: 1 }, // S+W
  9: { ref: SPRITES.WALL_CORNER, rot: 2 }, // W+N
  3: { ref: SPRITES.WALL_CORNER, rot: 3 }, // N+E
  7: { ref: SPRITES.WALL_T, rot: 0 }, // N+E+S
  14: { ref: SPRITES.WALL_T, rot: 1 }, // E+S+W
  13: { ref: SPRITES.WALL_T, rot: 2 }, // S+W+N
  11: { ref: SPRITES.WALL_T, rot: 3 }, // W+N+E
  15: { ref: SPRITES.WALL_CROSS, rot: 0 }, // N+E+S+W, fully interior — CROSS's edges stay solid against mismatched neighbors; WALL's E/W taper (meant for a floor-flanked pillar) shows as a hole here
};

const WALL_NEIGHBOR_OFFSETS: readonly [number, number, number][] = [
  [0, -1, 1], // N
  [1, 0, 2], // E
  [0, 1, 4], // S
  [-1, 0, 8], // W
];

/** Picks the correctly-shaped/rotated wall sprite for the tile at (x, y), honoring expiringTiles overlays. */
function wallVariantAt(state: GameState, x: number, y: number): WallVariant {
  const { width, height } = state.dungeon;
  let mask = 0;
  for (const [dx, dy, bit] of WALL_NEIGHBOR_OFFSETS) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
    if (effectiveTileAt(state, nx, ny) === TILE.WALL) mask |= bit;
  }
  return WALL_VARIANT_BY_MASK[mask];
}

const ENEMY_REFS: Record<Enemy['kind'], SpriteRef> = {
  BONE_GRUNT: SPRITES.BONE_GRUNT,
  EMBER_BAT: SPRITES.EMBER_BAT,
  VOLT_TURRET: SPRITES.VOLT_TURRET,
  FROST_WRAITH: SPRITES.FROST_WRAITH,
  TIME_WEAVER: SPRITES.TIME_WEAVER,
  CHRONO_LICH: SPRITES.CHRONO_LICH,
  BONE_KNIGHT: SPRITES.BONE_KNIGHT,
  CINDER_SHAMAN: SPRITES.CINDER_SHAMAN,
  VOLT_HOUND: SPRITES.VOLT_HOUND,
  FROST_SENTINEL: SPRITES.FROST_SENTINEL,
  INFERNO_GOLEM: SPRITES.INFERNO_GOLEM,
  STORM_CALLER: SPRITES.STORM_CALLER,
  GLACIAL_KNIGHT: SPRITES.GLACIAL_KNIGHT,
  CLOCKWORK_SCARAB: SPRITES.CLOCKWORK_SCARAB,
  DREAD_LEGION: SPRITES.DREAD_LEGION,
  DOOM_GUARD: SPRITES.DOOM_GUARD,
  ASH_FIEND: SPRITES.ASH_FIEND,
  HELLFIRE_MAGUS: SPRITES.HELLFIRE_MAGUS,
  TESLA_COIL: SPRITES.TESLA_COIL,
  STORM_STALKER: SPRITES.STORM_STALKER,
  VOID_SPIRIT: SPRITES.VOID_SPIRIT,
  GLACIAL_MONOLITH: SPRITES.GLACIAL_MONOLITH,
};

// Cursed Rift ambient aura radius, in tiles.
const RIFT_AURA_RADIUS = 2;

// 2x scale enemies.
const BIG_ENEMY_KINDS = new Set<Enemy['kind']>(['INFERNO_GOLEM', 'STORM_CALLER', 'GLACIAL_KNIGHT', 'CHRONO_LICH']);
const BIG_TILE_SIZE = TILE_SIZE * 2;

const WORLD_ITEM_REFS: Partial<Record<string, SpriteRef>> = {
  WEAPON: SPRITES.WEAPON,
  ACCESSORY: SPRITES.ACCESSORY,
  POTION: SPRITES.POTION,
  CONSUMABLE: SPRITES.CONSUMABLE,
  TIME_SHARD: SPRITES.TIME_SHARD,
  ANCHOR: SPRITES.ANCHOR,
  RELIC: SPRITES.RELIC,
};

// Item icon lookups.
const WORLD_ITEM_REFS_BY_NAME: Partial<Record<string, Record<string, SpriteRef>>> = {
  WEAPON: WEAPON_SPRITE_BY_NAME,
  ACCESSORY: ACCESSORY_SPRITE_BY_NAME,
  POTION: POTION_SPRITE_BY_NAME,
  CONSUMABLE: CONSUMABLE_SPRITE_BY_NAME,
};

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

/** Top-left tile of the viewport: centered on the player, clamped to map bounds. */
export function computeCamera(state: GameState): { x: number; y: number } {
  const { width, height } = state.dungeon;
  return {
    x: clamp(state.run.playerX - (VIEWPORT_TILES_W >> 1), 0, Math.max(0, width - VIEWPORT_TILES_W)),
    y: clamp(state.run.playerY - (VIEWPORT_TILES_H >> 1), 0, Math.max(0, height - VIEWPORT_TILES_H)),
  };
}

/** Draw player sprite. */
function drawPlayer(
  ctx: CanvasRenderingContext2D,
  facing: GameState['run']['facing'],
  px: number,
  py: number,
  flash = false,
): void {
  drawRef(ctx, SPRITES.PLAYER, px, py, facing === 'LEFT', flash);
}

/** Draw health bar. */
function drawHealthBar(ctx: CanvasRenderingContext2D, px: number, py: number, hp: number, maxHp: number): void {
  const pct = Math.max(0, hp / maxHp);
  const barY = py - 2;
  ctx.fillStyle = COLOR_BG;
  ctx.fillRect(px, barY, TILE_SIZE, 1);
  ctx.fillStyle = COLOR_ENEMY_MID;
  ctx.fillRect(px, barY + 1, TILE_SIZE, 1);
  const filled = Math.max(pct > 0 ? 1 : 0, Math.round(TILE_SIZE * pct));
  ctx.fillStyle = COLOR_ENEMY_LIGHT;
  ctx.fillRect(px, barY + 1, filled, 1);
}

const WALK_HOP_PX = 4;

/** Vertical "hop" while an entity's spring-lerped visual position is still chasing its logical tile; 0 once it settles. */
function walkHopOffsetY(logicalX: number, logicalY: number, visual: EntityVisual): number {
  const isMoving = Math.abs(logicalX - visual.tileX) > 0.05 || Math.abs(logicalY - visual.tileY) > 0.05;
  if (!isMoving) return 0;
  const progress = (visual.tileX + visual.tileY) % 1;
  return -Math.abs(Math.sin(progress * Math.PI)) * WALK_HOP_PX;
}

/** Draws one fading death ghost (enemy corpse or the player's death flash) with alpha. */
function drawGhost(ctx: CanvasRenderingContext2D, ghost: GhostVisual, px: number, py: number): void {
  ctx.globalAlpha = ghost.alpha;
  if (ghost.kind === 'PLAYER') {
    drawPlayer(ctx, ghost.facing ?? 'DOWN', px, py);
  } else {
    drawRef(ctx, ENEMY_REFS[ghost.kind], px, py);
  }
  ctx.globalAlpha = 1;
}

// Ambient Title-Screen backdrop: amber dust drifting upward (reverse gravity).
interface TitleDustMote {
  x: number;
  y: number;
  speed: number; // px/sec, upward
  size: number;
  opacity: number;
  phase: number; // sine offset for horizontal drift
  color: string;
}

const TITLE_DUST_COUNT = 40;
const TITLE_DUST_COLORS = [COLOR_LIGHT, COLOR_MID];
let titleDust: TitleDustMote[] = [];
let titleDustLastT = 0;

function seedTitleDust(viewW: number, viewH: number): void {
  titleDust = [];
  for (let i = 0; i < TITLE_DUST_COUNT; i++) {
    titleDust.push({
      x: Math.random() * viewW,
      y: Math.random() * viewH,
      speed: 8 + Math.random() * 14,
      size: 1 + Math.round(Math.random()),
      opacity: 0.3 + Math.random() * 0.7,
      phase: Math.random() * Math.PI * 2,
      color: TITLE_DUST_COLORS[i % TITLE_DUST_COLORS.length],
    });
  }
}

/** Updates and draws the drifting dust motes only (background fill is the caller's job). */
function updateAndDrawTitleDust(ctx: CanvasRenderingContext2D, viewW: number, viewH: number): void {
  if (titleDust.length === 0) seedTitleDust(viewW, viewH);
  const now = performance.now();
  // Clamp dt so a tab coming back from background doesn't fling motes off-screen in one jump.
  const dt = titleDustLastT ? Math.min(0.05, (now - titleDustLastT) / 1000) : 0;
  titleDustLastT = now;

  for (const p of titleDust) {
    p.y -= p.speed * dt;
    p.x += Math.sin(now / 1000 + p.phase) * 0.15;
    if (p.y < -2) {
      p.y = viewH + 2;
      p.x = Math.random() * viewW;
    }
    ctx.globalAlpha = p.opacity;
    ctx.fillStyle = p.color;
    ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
  }
  ctx.globalAlpha = 1;
}

// Title Screen "CHRONO / KEEP" wordmark, sprite-stamped one glyph cell per non-space character.
const TITLE_ASCII = [
  "  /$$$$$$  /$$   /$$ /$$$$$$$   /$$$$$$  /$$   /$$  /$$$$$$ ",
  " /$$__  $$| $$  | $$| $$__  $$ /$$__  $$| $$$ | $$ /$$__  $$",
  "| $$  \\__/| $$  | $$| $$  \\ $$| $$  \\ $$| $$$$| $$| $$  \\ $$",
  "| $$      | $$$$$$$$| $$$$$$$/| $$  | $$| $$ $$ $$| $$  | $$",
  "| $$      | $$__  $$| $$__  $$| $$  | $$| $$  $$$$| $$  | $$",
  "| $$    $$| $$  | $$| $$  \\ $$| $$  | $$| $$\\  $$$| $$  | $$",
  "|  $$$$$$/| $$  | $$| $$  | $$|  $$$$$$/| $$ \\  $$|  $$$$$$/",
  " \\______/ |__/  |__/|__/  |__/ \\______/ |__/  \\__/ \\______/ ",
  "                                                            ",
  " /$$   /$$ /$$$$$$$$ /$$$$$$$$ /$$$$$$$                     ",
  "| $$  /$$/| $$_____/| $$_____/| $$__  $$                    ",
  "| $$ /$$/ | $$      | $$      | $$  \\ $$                    ",
  "| $$$$$/  | $$$$$   | $$$$$   | $$$$$$$/                    ",
  "| $$  $$  | $$__/   | $$__/   | $$____/                     ",
  "| $$\\  $$ | $$      | $$      | $$                          ",
  "| $$ \\  $$| $$$$$$$$| $$$$$$$$| $$                          ",
  "|__/  \\__/|________/|________/|__/                          ",
];
const TITLE_ASCII_COLS = 60;
// Row 8 (the blank separator between CHRONO and KEEP) is where the player patrols.
const TITLE_LOGO_GAP_ROW = 8;

// Layout was authored against the 480x320 desktop canvas; everything below scales off of that,
// so mobile's smaller 320x240 canvas gets a shrunk-but-proportional logo/patrol instead of clipping.
const TITLE_BASE_W = 480;
const TITLE_BASE_H = 320;
const TITLE_BASE_SPRITE_SIZE = 7;
const TITLE_BASE_START_Y = 40;
const TITLE_BASE_PLAYER_MIN_X = 60;
const TITLE_BASE_PLAYER_MAX_X = 400;
const TITLE_BASE_PLAYER_SPEED = 0.2;
const TITLE_BASE_PLAYER_SIZE = 20;

function drawTitleLogo(ctx: CanvasRenderingContext2D, spriteSize: number, startX: number, startY: number): void {
  for (let row = 0; row < TITLE_ASCII.length; row++) {
    const line = TITLE_ASCII[row];
    for (let col = 0; col < line.length; col++) {
      if (line[col] === ' ') continue;
      drawTile(ctx, 47, 4, startX + col * spriteSize, startY + row * spriteSize, false, spriteSize);
    }
  }
}

// Title Screen patrolling player, pacing back and forth in the CHRONO/KEEP gap.
let titlePlayerX = 100;
let titlePlayerDir = 1;

function drawTitlePlayer(ctx: CanvasRenderingContext2D, scale: number, startY: number): void {
  const minX = TITLE_BASE_PLAYER_MIN_X * scale;
  const maxX = TITLE_BASE_PLAYER_MAX_X * scale;
  titlePlayerX += TITLE_BASE_PLAYER_SPEED * scale * titlePlayerDir;
  if (titlePlayerX >= maxX) titlePlayerDir = -1;
  else if (titlePlayerX <= minX) titlePlayerDir = 1;

  const size = TITLE_BASE_PLAYER_SIZE * scale;
  const hopY = Math.abs(Math.sin(performance.now() / 150)) * 4 * scale;
  const playerY = startY + TITLE_LOGO_GAP_ROW * TITLE_BASE_SPRITE_SIZE * scale - 4 * scale - hopY;
  drawTile(ctx, SPRITES.PLAYER.col, SPRITES.PLAYER.row, titlePlayerX, playerY, titlePlayerDir === -1, size);
}

/** Renders the full canvas Title Screen: backdrop, dust, wordmark, patrolling player — before any HTML overlay draws on top. */
function renderTitleScreen(ctx: CanvasRenderingContext2D, viewW: number, viewH: number): void {
  ctx.fillStyle = COLOR_BG;
  ctx.fillRect(0, 0, viewW, viewH);
  updateAndDrawTitleDust(ctx, viewW, viewH);

  const scale = Math.min(viewW / TITLE_BASE_W, viewH / TITLE_BASE_H);
  const spriteSize = TITLE_BASE_SPRITE_SIZE * scale;
  const startY = TITLE_BASE_START_Y * scale;
  const startX = (viewW - TITLE_ASCII_COLS * spriteSize) / 2;
  drawTitleLogo(ctx, spriteSize, startX, startY);
  drawTitlePlayer(ctx, scale, startY);
}

/** Renders the full game world for the current frame: tiles, items, enemies, player. */
const lightingCanvas = document.createElement('canvas');
const lightingCtx = lightingCanvas.getContext('2d')!;

const CACHED_LIGHTS: Record<number, HTMLCanvasElement> = {};
function getLightMask(radius: number): HTMLCanvasElement {
  if (CACHED_LIGHTS[radius]) return CACHED_LIGHTS[radius];

  const canvas = document.createElement('canvas');
  canvas.width = radius * 2;
  canvas.height = radius * 2;
  const ctx = canvas.getContext('2d')!;
  
  const grad = ctx.createRadialGradient(radius, radius, 0, radius, radius, radius);
  grad.addColorStop(0, 'rgba(0, 0, 0, 1)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, radius * 2, radius * 2);
  
  CACHED_LIGHTS[radius] = canvas;
  return canvas;
}

export function renderWorld(ctx: CanvasRenderingContext2D, state: GameState, viewW: number, viewH: number): void {
  VIEWPORT_TILES_W = viewW / TILE_SIZE;
  VIEWPORT_TILES_H = viewH / TILE_SIZE;

  if (state.ui.currentScreen === 'TITLE') {
    renderTitleScreen(ctx, viewW, viewH);
    return;
  }

  updateAnimations(state);

  ctx.fillStyle = COLOR_BG;
  ctx.fillRect(0, 0, viewW, viewH);

  const targetCam = computeCamera(state);
  const { x: camX, y: camY } = stepCameraLerp(targetCam.x, targetCam.y);

  const { tiles, width, height } = state.dungeon;
  // Hand-authored floors (Hub, Mini-Boss/Final-Boss Arenas) stay plain — no Biome tint or floor decor.
  const isFixedLayoutFloor =
    state.run.currentFloor === HUB_FLOOR ||
    state.run.currentFloor === FINAL_BOSS_FLOOR ||
    isArenaFloor(state.run.currentFloor);
  const biomeIndex = Math.min(9, Math.max(0, Math.floor((state.run.currentFloor - 1) / 10)));
  const wallTint = isFixedLayoutFloor ? null : BIOME_WALL_TINTS[biomeIndex];

  // The camera is fractional now, so render one extra tile at each edge to avoid black cut-offs.
  const startX = Math.floor(camX);
  const endX = Math.floor(camX + VIEWPORT_TILES_W) + 1;
  const startY = Math.floor(camY);
  const endY = Math.floor(camY + VIEWPORT_TILES_H) + 1;

  for (let ty = startY; ty <= endY; ty++) {
    if (ty < 0 || ty >= height) continue;
    const row = tiles[ty];
    for (let tx = startX; tx <= endX; tx++) {
      if (tx < 0 || tx >= width) continue;
      // Math.round preserves crisp pixel art edges.
      const screenX = Math.round((tx - camX) * TILE_SIZE);
      const screenY = Math.round((ty - camY) * TILE_SIZE);

      if (row[tx] === TILE.WALL) {
        const { ref, rot } = wallVariantAt(state, tx, ty);
        drawTintedRef(ctx, ref, screenX, screenY, wallTint, rot);
        continue;
      }
      if (row[tx] === TILE.TREE) {
        const stage = eternityTreeStage(state.persistent.unlockedAnchors.length);
        drawRef(ctx, TREE_STAGE_SPRITES[stage], screenX, screenY);
        continue;
      }
      const ref = TILE_REFS[row[tx]];
      if (ref) drawRef(ctx, ref, screenX, screenY);
      if (!isFixedLayoutFloor && row[tx] === TILE.FLOOR) {
        const seed = Math.sin(tx * 12.9898 + ty * 78.233 + state.run.currentFloor) * 43758.5453;
        const rand = seed - Math.floor(seed);
        const decor = rand < 0.1 ? DECOR_DIRT[Math.floor((rand / 0.1) * DECOR_DIRT.length)] : rand > 0.9 ? DECOR_GRASS[Math.floor(((rand - 0.9) / 0.1) * DECOR_GRASS.length)] : null;
        if (decor) {
          ctx.globalAlpha = 0.15;
          drawRef(ctx, decor, screenX, screenY);
          ctx.globalAlpha = 1;
        }
      }
    }
  }

  // Overlay expiring tiles.
  for (const t of state.dungeon.expiringTiles) {
    const tileSx = t.x - camX;
    const tileSy = t.y - camY;
    if (tileSx < -1 || tileSx >= VIEWPORT_TILES_W + 1 || tileSy < -1 || tileSy >= VIEWPORT_TILES_H + 1) continue;
    const sx = Math.round(tileSx * TILE_SIZE);
    const sy = Math.round(tileSy * TILE_SIZE);
    if (t.tileType === TILE.WALL) {
      const { ref, rot } = wallVariantAt(state, t.x, t.y);
      drawTintedRef(ctx, ref, sx, sy, wallTint, rot);
      continue;
    }
    const ref = TILE_REFS[t.tileType];
    if (ref) drawRef(ctx, ref, sx, sy);
  }

  // Draw telegraphs.
  if (state.dungeon.telegraphTiles.length > 0) {
    const pulse = 0.35 + 0.25 * Math.sin(performance.now() / 120);
    ctx.globalAlpha = pulse;
    for (const t of state.dungeon.telegraphTiles) {
      const tileSx = t.x - camX;
      const tileSy = t.y - camY;
      if (tileSx < -1 || tileSx >= VIEWPORT_TILES_W + 1 || tileSy < -1 || tileSy >= VIEWPORT_TILES_H + 1) continue;
      ctx.fillStyle = t.payload === 'fire_aoe' ? COLOR_FIRE : t.payload === 'chill_pulse' ? COLOR_FROST : COLOR_ENEMY_LIGHT;
      ctx.fillRect(Math.round(tileSx * TILE_SIZE), Math.round(tileSy * TILE_SIZE), TILE_SIZE, TILE_SIZE);
    }
    ctx.globalAlpha = 1;
  }

  // Draw ranged hit beams.
  for (const b of getBeams()) {
    const x1 = (b.fromX - camX) * TILE_SIZE + TILE_SIZE / 2;
    const y1 = (b.fromY - camY) * TILE_SIZE + TILE_SIZE / 2;
    const x2 = (b.toX - camX) * TILE_SIZE + TILE_SIZE / 2;
    const y2 = (b.toY - camY) * TILE_SIZE + TILE_SIZE / 2;
    ctx.strokeStyle = b.color;
    ctx.globalAlpha = b.alpha;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(Math.round(x1), Math.round(y1));
    ctx.lineTo(Math.round(x2), Math.round(y2));
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // Draw Cursed Rift, with a pulsing purple anomaly aura bleeding into the tiles around it.
  if (state.dungeon.riftX !== null && state.dungeon.riftY !== null) {
    const rx = state.dungeon.riftX;
    const ry = state.dungeon.riftY;
    const pulse = 0.6 + 0.4 * Math.sin(performance.now() / 400);
    ctx.fillStyle = COLOR_CHRONO;
    for (let dx = -RIFT_AURA_RADIUS; dx <= RIFT_AURA_RADIUS; dx++) {
      for (let dy = -RIFT_AURA_RADIUS; dy <= RIFT_AURA_RADIUS; dy++) {
        if (dx === 0 && dy === 0) continue;
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        const tx = rx + dx;
        const ty = ry + dy;
        if (tx < 0 || tx >= width || ty < 0 || ty >= height) continue;
        const tileSx = tx - camX;
        const tileSy = ty - camY;
        if (tileSx < -1 || tileSx >= VIEWPORT_TILES_W + 1 || tileSy < -1 || tileSy >= VIEWPORT_TILES_H + 1) continue;
        ctx.globalAlpha = (dist === 1 ? 0.3 : 0.14) * pulse;
        ctx.fillRect(Math.round(tileSx * TILE_SIZE), Math.round(tileSy * TILE_SIZE), TILE_SIZE, TILE_SIZE);
      }
    }
    ctx.globalAlpha = 1;

    const tileSx = rx - camX;
    const tileSy = ry - camY;
    if (tileSx >= -1 && tileSx < VIEWPORT_TILES_W + 1 && tileSy >= -1 && tileSy < VIEWPORT_TILES_H + 1) {
      drawRef(ctx, SPRITES.CURSED_RIFT, Math.round(tileSx * TILE_SIZE), Math.round(tileSy * TILE_SIZE));
    }
  }

  for (const wi of state.dungeon.items) {
    const tileSx = wi.x - camX;
    const tileSy = wi.y - camY;
    if (tileSx < -1 || tileSx >= VIEWPORT_TILES_W + 1 || tileSy < -1 || tileSy >= VIEWPORT_TILES_H + 1) continue;
    // Draw items/chests.
    const ref = wi.chestLoot
      ? SPRITES.CHEST
      : wi.item.kind === 'RELIC' && wi.item.effect
        ? (RELIC_SPRITE_BY_EFFECT[wi.item.effect] ?? SPRITES.RELIC)
        : (WORLD_ITEM_REFS_BY_NAME[wi.item.kind]?.[wi.item.name] ?? WORLD_ITEM_REFS[wi.item.kind] ?? SPRITES.CHEST);
    drawRef(ctx, ref, Math.round(tileSx * TILE_SIZE), Math.round(tileSy * TILE_SIZE));
  }

  for (const e of state.dungeon.enemies) {
    const tileSx = e.x - camX;
    const tileSy = e.y - camY;
    if (tileSx < -1 || tileSx >= VIEWPORT_TILES_W + 1 || tileSy < -1 || tileSy >= VIEWPORT_TILES_H + 1) continue;

    const visual = getEntityVisual(e.id, e.x, e.y);
    const px = Math.round((visual.tileX - camX) * TILE_SIZE);
    const py = Math.round((visual.tileY - camY) * TILE_SIZE);

    // Scale logic.
    const colossal = e.affix === 'colossal';
    const big = BIG_ENEMY_KINDS.has(e.kind);
    const size = colossal ? TILE_SIZE * 1.5 : big ? BIG_TILE_SIZE : TILE_SIZE;
    const drawPx = big || colossal ? px - (size - TILE_SIZE) / 2 : px;
    const drawPy = (big || colossal ? py - (size - TILE_SIZE) : py) + Math.round(walkHopOffsetY(e.x, e.y, visual));

    if (e.hp < e.maxHp) drawHealthBar(ctx, px, drawPy, e.hp, e.maxHp);

    // Affix rendering.
    ctx.save();
    if (e.affix === 'blinking') {
      ctx.globalAlpha = 0.5;
    } else if (e.affix && e.affix !== 'colossal' && e.affix !== 'shielded') {
      ctx.shadowColor = eliteAffixColor(e.affix);
      ctx.shadowBlur = 10;
    } else if (e.auraColor) {
      ctx.shadowColor = e.auraColor;
      ctx.shadowBlur = 10;
    }
    drawRef(ctx, ENEMY_REFS[e.kind], drawPx, drawPy, false, visual.flashing, size);
    ctx.restore();

    // Shielded affix overlay.
    if (e.affix === 'shielded' && e.shieldedHitsLeft) {
      ctx.save();
      ctx.strokeStyle = eliteAffixColor('shielded');
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(drawPx + size / 2, drawPy + size / 2, size / 2 + 1, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  if (state.run.currentFloor === HUB_FLOOR && state.dungeon.npc) {
    const npcVisual = getEntityVisual(SILAS_ID, state.dungeon.npc.x, state.dungeon.npc.y);
    const npcPx = Math.round((npcVisual.tileX - camX) * TILE_SIZE);
    const npcPy = Math.round((npcVisual.tileY - camY) * TILE_SIZE);
    drawRef(ctx, SPRITES.SILAS, npcPx, npcPy);
  }

  for (const ghost of getDeathGhosts()) {
    const sx = ghost.tileX - camX;
    const sy = ghost.tileY - camY;
    if (sx < -1 || sx >= VIEWPORT_TILES_W + 1 || sy < -1 || sy >= VIEWPORT_TILES_H + 1) continue;
    drawGhost(ctx, ghost, Math.round(sx * TILE_SIZE), Math.round(sy * TILE_SIZE));
  }

  const playerVisual = getEntityVisual(PLAYER_ID, state.run.playerX, state.run.playerY);
  const playerPx = Math.round((playerVisual.tileX - camX) * TILE_SIZE);
  const playerPy =
    Math.round((playerVisual.tileY - camY) * TILE_SIZE) +
    Math.round(walkHopOffsetY(state.run.playerX, state.run.playerY, playerVisual));
  drawPlayer(ctx, state.run.facing, playerPx, playerPy, playerVisual.flashing);

  for (const p of getParticles()) {
    const sx = (p.x - camX) * TILE_SIZE;
    const sy = (p.y - camY) * TILE_SIZE;
    if (sx < -2 || sx >= viewW + 2 || sy < -2 || sy >= viewH + 2) continue;
    ctx.fillStyle = p.color;
    ctx.globalAlpha = p.alpha;
    ctx.fillRect(Math.round(sx), Math.round(sy), 1, 1);
  }
  ctx.globalAlpha = 1;

  // --- Dynamic Lighting Pass ---
  const time = performance.now();
  const fireFlicker = (Math.sin(time / 150) * 2) + (Math.random() * 2);
  const pulse = Math.sin(time / 300) * 0.2;
  if (lightingCanvas.width !== viewW || lightingCanvas.height !== viewH) {
    lightingCanvas.width = viewW;
    lightingCanvas.height = viewH;
  }
  lightingCtx.globalCompositeOperation = 'source-over';
  lightingCtx.fillStyle = 'rgb(2, 2, 15)';
  lightingCtx.fillRect(0, 0, viewW, viewH);

  lightingCtx.globalCompositeOperation = 'destination-out';
  const punchHole = (x: number, y: number, radius: number, alpha = 1) => {
    lightingCtx.globalAlpha = alpha;
    const mask = getLightMask(radius);
    lightingCtx.drawImage(mask, x - radius, y - radius);
  };

  // Player light
  punchHole(playerPx + TILE_SIZE / 2, playerPy + TILE_SIZE / 2, TILE_SIZE * 5);

  // Elites / Bosses
  for (const e of state.dungeon.enemies) {
    if (e.affix || BIG_ENEMY_KINDS.has(e.kind)) {
      const visual = getEntityVisual(e.id, e.x, e.y);
      const ex = Math.round((visual.tileX - camX) * TILE_SIZE) + TILE_SIZE / 2;
      const ey = Math.round((visual.tileY - camY) * TILE_SIZE) + TILE_SIZE / 2;
      punchHole(ex, ey, TILE_SIZE * 4, 0.8);
    }
  }

  // Hazard and interactive tiles light
  const padding = 3;
  const lightStartX = Math.max(0, Math.floor(camX) - padding);
  const lightEndX = Math.min(width, Math.ceil(camX + viewW / TILE_SIZE) + padding);
  const lightStartY = Math.max(0, Math.floor(camY) - padding);
  const lightEndY = Math.min(height, Math.ceil(camY + viewH / TILE_SIZE) + padding);

  for (let ty = lightStartY; ty < lightEndY; ty++) {
    const row = state.dungeon.tiles[ty];
    for (let tx = lightStartX; tx < lightEndX; tx++) {
      const tile = row[tx];
      if (tile === TILE.FIRE_HAZARD || tile === TILE.FROST_HAZARD || tile === TILE.ECHO_WELL || tile === TILE.CHRONO_ANVIL || tile === TILE.SHOP_TERMINAL || tile === TILE.SHORTCUT_GATE || tile === TILE.TORCH) {
        const sx = (tx - camX) * TILE_SIZE + TILE_SIZE / 2;
        const sy = (ty - camY) * TILE_SIZE + TILE_SIZE / 2;
        let radius = TILE_SIZE * 2.5;
        let intensity = 0.9;
        
        if (tile === TILE.FIRE_HAZARD || tile === TILE.TORCH) radius += fireFlicker;
        if (tile === TILE.SHOP_TERMINAL || tile === TILE.SHORTCUT_GATE || tile === TILE.CHRONO_ANVIL) intensity += pulse;

        punchHole(sx, sy, radius, intensity);
      }
    }
  }

  // Beams
  for (const b of getBeams()) {
    const sx = (b.toX - camX) * TILE_SIZE + TILE_SIZE / 2;
    const sy = (b.toY - camY) * TILE_SIZE + TILE_SIZE / 2;
    punchHole(sx, sy, TILE_SIZE * 2.5);
  }
  
  // Rifts
  if (state.dungeon.riftX !== null && state.dungeon.riftY !== null) {
    const sx = (state.dungeon.riftX - camX) * TILE_SIZE + TILE_SIZE / 2;
    const sy = (state.dungeon.riftY - camY) * TILE_SIZE + TILE_SIZE / 2;
    punchHole(sx, sy, TILE_SIZE * 3.5, 0.9);
  }

  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 0.8;
  ctx.drawImage(lightingCanvas, 0, 0);

  // --- Colored Light Pass ---
  ctx.globalCompositeOperation = 'lighter';
  const drawColoredLight = (x: number, y: number, radius: number, colorStart: string) => {
    const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
    grad.addColorStop(0, colorStart);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  };

  for (let ty = lightStartY; ty < lightEndY; ty++) {
    const row = state.dungeon.tiles[ty];
    for (let tx = lightStartX; tx < lightEndX; tx++) {
      const tile = row[tx];
      if (tile === TILE.FIRE_HAZARD || tile === TILE.FROST_HAZARD || tile === TILE.ECHO_WELL || tile === TILE.CHRONO_ANVIL || tile === TILE.SHOP_TERMINAL || tile === TILE.SHORTCUT_GATE || tile === TILE.TORCH) {
        const sx = (tx - camX) * TILE_SIZE + TILE_SIZE / 2;
        const sy = (ty - camY) * TILE_SIZE + TILE_SIZE / 2;
        
        if (tile === TILE.FIRE_HAZARD || tile === TILE.TORCH) {
          drawColoredLight(sx, sy, TILE_SIZE * 2.5 + fireFlicker, 'rgba(255, 120, 0, 0.15)');
        } else if (tile === TILE.FROST_HAZARD || tile === TILE.ECHO_WELL) {
          drawColoredLight(sx, sy, TILE_SIZE * 2.5, 'rgba(0, 150, 255, 0.15)');
        } else if (tile === TILE.SHOP_TERMINAL || tile === TILE.SHORTCUT_GATE) {
          drawColoredLight(sx, sy, TILE_SIZE * 2.5, 'rgba(150, 0, 255, 0.15)');
        }
      }
    }
  }
  
  if (state.dungeon.riftX !== null && state.dungeon.riftY !== null) {
    const sx = (state.dungeon.riftX - camX) * TILE_SIZE + TILE_SIZE / 2;
    const sy = (state.dungeon.riftY - camY) * TILE_SIZE + TILE_SIZE / 2;
    drawColoredLight(sx, sy, TILE_SIZE * 3.5, 'rgba(150, 0, 255, 0.15)');
  }
  
  ctx.globalCompositeOperation = 'source-over';

  // Drawn last, always on top.
  for (const f of getFloatingTexts()) {
    const width = measureGlyphText(f.text);
    const px = (f.x - camX) * TILE_SIZE + (TILE_SIZE - width) / 2;
    const py = (f.y - camY) * TILE_SIZE - 6;
    if (px < -width || px >= viewW || py < -6 || py >= viewH) continue;
    ctx.globalAlpha = f.alpha;
    drawGlyphText(ctx, f.text, Math.round(px), Math.round(py), FLOAT_COLOR[f.kind]);
  }
  ctx.globalAlpha = 1;
}
