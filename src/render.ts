// Canvas world rendering (GDD Sections 4 & 8): spritesheet tiles, camera, and
// the per-frame draw of tiles -> world items -> enemies -> player. The canvas
// is strictly game-world — no UI is ever drawn here. Game-world art comes from
// the full-color spritesheet (assets.ts + sprites.ts); the amber palette is
// retained for canvas UI accents (health bars, telegraphs, particles, text).

import {
  COLOR_BG,
  COLOR_LIGHT,
  COLOR_MID,
  COLOR_PLAYER_LIGHT,
  COLOR_ENEMY_LIGHT,
  COLOR_ENEMY_MID,
  COLOR_FLASH,
} from './palette';
import { TILE } from './mapgen';
import { spritesheet, SPRITE_PX } from './assets';
import { SPRITES, type SpriteRef } from './sprites';
import { PLAYER_ID, updateAnimations, getEntityVisual, getDeathGhosts, getParticles } from './animation';
import type { GhostVisual } from './animation';
import { drawGlyphText, getFloatingTexts, measureGlyphText, type FloatKind } from './floatingText';
import type { GameState, Enemy } from './types';

export const TILE_SIZE = 8;
export const VIEWPORT_TILES_W = 30; // 240 / 8
export const VIEWPORT_TILES_H = 20; // 160 / 8

const FLOAT_COLOR: Record<FloatKind, string> = {
  damage: COLOR_LIGHT,
  crit: COLOR_FLASH,
  immune: COLOR_MID,
  turns: COLOR_PLAYER_LIGHT,
};

/**
 * Draws one spritesheet cell at canvas pixel (dx, dy).
 * Source rect: sx = col * 8, sy = row * 8, 8x8 (GDD Section 4).
 * flipX mirrors around the tile via translate + scale(-1, 1) — used for LEFT facing.
 */
export function drawTile(
  ctx: CanvasRenderingContext2D,
  col: number,
  row: number,
  dx: number,
  dy: number,
  flipX = false,
): void {
  const sx = col * SPRITE_PX;
  const sy = row * SPRITE_PX;
  if (flipX) {
    ctx.save();
    ctx.translate(dx + TILE_SIZE, dy);
    ctx.scale(-1, 1);
    ctx.drawImage(spritesheet, sx, sy, SPRITE_PX, SPRITE_PX, 0, 0, TILE_SIZE, TILE_SIZE);
    ctx.restore();
  } else {
    ctx.drawImage(spritesheet, sx, sy, SPRITE_PX, SPRITE_PX, dx, dy, TILE_SIZE, TILE_SIZE);
  }
}

// Damage-flash support: full-color sprites can't be recolored per-pixel like
// the old matrices, so the white flash renders the cell's silhouette through
// a tiny offscreen scratch canvas (draw cell, then source-in fill).
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
): void {
  scratchCtx.globalCompositeOperation = 'source-over';
  scratchCtx.clearRect(0, 0, SPRITE_PX, SPRITE_PX);
  scratchCtx.drawImage(spritesheet, col * SPRITE_PX, row * SPRITE_PX, SPRITE_PX, SPRITE_PX, 0, 0, SPRITE_PX, SPRITE_PX);
  scratchCtx.globalCompositeOperation = 'source-in';
  scratchCtx.fillStyle = COLOR_FLASH;
  scratchCtx.fillRect(0, 0, SPRITE_PX, SPRITE_PX);
  if (flipX) {
    ctx.save();
    ctx.translate(dx + TILE_SIZE, dy);
    ctx.scale(-1, 1);
    ctx.drawImage(scratch, 0, 0, SPRITE_PX, SPRITE_PX, 0, 0, TILE_SIZE, TILE_SIZE);
    ctx.restore();
  } else {
    ctx.drawImage(scratch, 0, 0, SPRITE_PX, SPRITE_PX, dx, dy, TILE_SIZE, TILE_SIZE);
  }
}

function drawRef(ctx: CanvasRenderingContext2D, ref: SpriteRef, dx: number, dy: number, flipX = false, flash = false): void {
  if (flash) drawTileFlash(ctx, ref.col, ref.row, dx, dy, flipX);
  else drawTile(ctx, ref.col, ref.row, dx, dy, flipX);
}

const TILE_REFS: Partial<Record<number, SpriteRef>> = {
  [TILE.FLOOR]: SPRITES.FLOOR,
  [TILE.WALL]: SPRITES.WALL,
  [TILE.DOOR]: SPRITES.DOOR,
  [TILE.STAIRS]: SPRITES.STAIRS,
  [TILE.SHORTCUT_GATE]: SPRITES.SHORTCUT_GATE,
  [TILE.BOSS_GATE]: SPRITES.BOSS_GATE,
  [TILE.FIRE_HAZARD]: SPRITES.FIRE_HAZARD,
  [TILE.SHOP_TERMINAL]: SPRITES.SHOP_TERMINAL,
};

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
};

// Fun & Feel #2: world-item pickups read as their own kind instead of one
// generic chest icon (ANCHOR keeps its own dedicated sprite, drawn separately).
const WORLD_ITEM_REFS: Partial<Record<string, SpriteRef>> = {
  WEAPON: SPRITES.WEAPON,
  ACCESSORY: SPRITES.ACCESSORY,
  POTION: SPRITES.POTION,
  CONSUMABLE: SPRITES.CONSUMABLE,
  TIME_SHARD: SPRITES.TIME_SHARD,
  ANCHOR: SPRITES.ANCHOR,
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

/** LEFT mirrors the sheet cell; UP/DOWN/RIGHT draw it as-authored (GDD Section 8). */
function drawPlayer(
  ctx: CanvasRenderingContext2D,
  facing: GameState['run']['facing'],
  px: number,
  py: number,
  flash = false,
): void {
  drawRef(ctx, SPRITES.PLAYER, px, py, facing === 'LEFT', flash);
}

/** A 2px enemy health bar, drawn just above the sprite: a dark backdrop row plus a red fill/track row. */
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

/** Renders the full game world for the current frame: tiles, items, enemies, player. */
export function renderWorld(ctx: CanvasRenderingContext2D, state: GameState, viewW: number, viewH: number): void {
  updateAnimations(state);

  ctx.fillStyle = COLOR_BG;
  ctx.fillRect(0, 0, viewW, viewH);

  const cam = computeCamera(state);
  const { tiles, width, height } = state.dungeon;

  for (let y = 0; y < VIEWPORT_TILES_H; y++) {
    const ty = cam.y + y;
    if (ty < 0 || ty >= height) continue;
    const row = tiles[ty];
    for (let x = 0; x < VIEWPORT_TILES_W; x++) {
      const tx = cam.x + x;
      if (tx < 0 || tx >= width) continue;
      const ref = TILE_REFS[row[tx]];
      if (ref) drawRef(ctx, ref, x * TILE_SIZE, y * TILE_SIZE);
    }
  }

  // Player-created tile mutations (Flame Arc Lvl 3's Fire Hazard, Phase 8's
  // Ice-Barricade Scroll): kept off `dungeon.tiles` entirely, so they need
  // their own overlay draw on top of the base tile underneath them.
  for (const t of state.dungeon.expiringTiles) {
    const sx = t.x - cam.x;
    const sy = t.y - cam.y;
    if (sx < 0 || sx >= VIEWPORT_TILES_W || sy < 0 || sy >= VIEWPORT_TILES_H) continue;
    const ref = TILE_REFS[t.tileType];
    if (ref) drawRef(ctx, ref, sx * TILE_SIZE, sy * TILE_SIZE);
  }

  // Chrono-Lich Time-Blast telegraph (Section 11): a pulsing warning tile,
  // reusing the enemy-alarm red rather than adding a new accent color.
  if (state.dungeon.telegraphTiles.length > 0) {
    const pulse = 0.35 + 0.25 * Math.sin(performance.now() / 120);
    ctx.fillStyle = COLOR_ENEMY_LIGHT;
    ctx.globalAlpha = pulse;
    for (const t of state.dungeon.telegraphTiles) {
      const sx = t.x - cam.x;
      const sy = t.y - cam.y;
      if (sx < 0 || sx >= VIEWPORT_TILES_W || sy < 0 || sy >= VIEWPORT_TILES_H) continue;
      ctx.fillRect(sx * TILE_SIZE, sy * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    }
    ctx.globalAlpha = 1;
  }

  for (const wi of state.dungeon.items) {
    const sx = wi.x - cam.x;
    const sy = wi.y - cam.y;
    if (sx < 0 || sx >= VIEWPORT_TILES_W || sy < 0 || sy >= VIEWPORT_TILES_H) continue;
    // Fun & Feel #2: a chest still marks a not-yet-rerolled Dynamic Chest Loot
    // spot (its identity isn't decided until pickup), but everything else
    // reads as its own kind at a glance instead of one generic box icon.
    const ref = wi.chestLoot ? SPRITES.CHEST : (WORLD_ITEM_REFS[wi.item.kind] ?? SPRITES.CHEST);
    drawRef(ctx, ref, sx * TILE_SIZE, sy * TILE_SIZE);
  }

  for (const e of state.dungeon.enemies) {
    const sx = e.x - cam.x;
    const sy = e.y - cam.y;
    if (sx < 0 || sx >= VIEWPORT_TILES_W || sy < 0 || sy >= VIEWPORT_TILES_H) continue;

    const visual = getEntityVisual(e.id, e.x, e.y);
    const px = Math.round((visual.tileX - cam.x) * TILE_SIZE);
    const py = Math.round((visual.tileY - cam.y) * TILE_SIZE);
    if (e.hp < e.maxHp) drawHealthBar(ctx, px, py, e.hp, e.maxHp);
    drawRef(ctx, ENEMY_REFS[e.kind], px, py, false, visual.flashing);
  }

  for (const ghost of getDeathGhosts()) {
    const sx = ghost.tileX - cam.x;
    const sy = ghost.tileY - cam.y;
    if (sx < -1 || sx >= VIEWPORT_TILES_W || sy < -1 || sy >= VIEWPORT_TILES_H) continue;
    drawGhost(ctx, ghost, Math.round(sx * TILE_SIZE), Math.round(sy * TILE_SIZE));
  }

  const playerVisual = getEntityVisual(PLAYER_ID, state.run.playerX, state.run.playerY);
  const playerPx = Math.round((playerVisual.tileX - cam.x) * TILE_SIZE);
  const playerPy = Math.round((playerVisual.tileY - cam.y) * TILE_SIZE);
  drawPlayer(ctx, state.run.facing, playerPx, playerPy, playerVisual.flashing);

  // 1-Bit Pixel Particles (Section 11): drawn on top of sprites.
  ctx.fillStyle = COLOR_ENEMY_LIGHT;
  for (const p of getParticles()) {
    const sx = (p.x - cam.x) * TILE_SIZE;
    const sy = (p.y - cam.y) * TILE_SIZE;
    if (sx < -2 || sx >= viewW + 2 || sy < -2 || sy >= viewH + 2) continue;
    ctx.globalAlpha = p.alpha;
    ctx.fillRect(Math.round(sx), Math.round(sy), 1, 1);
  }
  ctx.globalAlpha = 1;

  // Floating Combat Text (Section 11 #2): drawn last, always on top.
  for (const f of getFloatingTexts()) {
    const width = measureGlyphText(f.text);
    const px = (f.x - cam.x) * TILE_SIZE + (TILE_SIZE - width) / 2;
    const py = (f.y - cam.y) * TILE_SIZE - 6;
    if (px < -width || px >= viewW || py < -6 || py >= viewH) continue;
    ctx.globalAlpha = f.alpha;
    drawGlyphText(ctx, f.text, Math.round(px), Math.round(py), FLOAT_COLOR[f.kind]);
  }
  ctx.globalAlpha = 1;
}
