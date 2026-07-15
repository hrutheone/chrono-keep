// Canvas world rendering (GDD Sections 4 & 8): sprites, camera, and the
// per-frame draw of tiles -> world items -> enemies -> player. The canvas is
// strictly game-world — no UI is ever drawn here.

import {
  COLOR_BG,
  COLOR_LIGHT,
  COLOR_MID,
  COLOR_PLAYER_LIGHT,
  COLOR_PLAYER_MID,
  COLOR_ENEMY_LIGHT,
  COLOR_ENEMY_MID,
  COLOR_FLASH,
} from './palette';
import { TILE } from './mapgen';
import { PLAYER_ID, updateAnimations, getEntityVisual, getDeathGhosts, getParticles } from './animation';
import type { GhostVisual } from './animation';
import { drawGlyphText, getFloatingTexts, measureGlyphText, type FloatKind } from './floatingText';
import type { GameState, Enemy } from './types';
import type { Sprite } from './sprites';
import {
  PLAYER_SPRITE,
  PLAYER_SPRITE_UP,
  PLAYER_SPRITE_SIDE,
  BONE_GRUNT_SPRITE,
  EMBER_BAT_SPRITE,
  VOLT_TURRET_SPRITE,
  FROST_WRAITH_SPRITE,
  TIME_WEAVER_SPRITE,
  CHRONO_LICH_SPRITE,
  WALL_SPRITE,
  DOOR_SPRITE,
  STAIRS_SPRITE,
  ANCHOR_SPRITE,
  SHORTCUT_GATE_SPRITE,
  BOSS_GATE_SPRITE,
  CHEST_SPRITE,
  FIRE_HAZARD_SPRITE,
} from './sprites';

export const TILE_SIZE = 8;
export const VIEWPORT_TILES_W = 30; // 240 / 8
export const VIEWPORT_TILES_H = 20; // 160 / 8

export interface SpriteColors {
  light: string;
  mid: string;
}

const TERRAIN_COLORS: SpriteColors = { light: COLOR_LIGHT, mid: COLOR_MID };
const PLAYER_COLORS: SpriteColors = { light: COLOR_PLAYER_LIGHT, mid: COLOR_PLAYER_MID };
const ENEMY_COLORS: SpriteColors = { light: COLOR_ENEMY_LIGHT, mid: COLOR_ENEMY_MID };
const FLASH_COLORS: SpriteColors = { light: COLOR_FLASH, mid: COLOR_FLASH };

const FLOAT_COLOR: Record<FloatKind, string> = {
  damage: COLOR_LIGHT,
  crit: COLOR_FLASH,
  immune: COLOR_MID,
  turns: COLOR_PLAYER_LIGHT,
};

/** Draws an 8x8 sprite matrix at pixel (px, py); 0 = transparent, 1 = light, 2 = midtone. */
export function drawSprite(
  ctx: CanvasRenderingContext2D,
  sprite: Sprite,
  px: number,
  py: number,
  flipX = false,
  colors: SpriteColors = TERRAIN_COLORS,
): void {
  for (let y = 0; y < sprite.length; y++) {
    const row = sprite[y];
    for (let x = 0; x < row.length; x++) {
      const v = row[flipX ? row.length - 1 - x : x];
      if (v === 0) continue;
      ctx.fillStyle = v === 1 ? colors.light : colors.mid;
      ctx.fillRect(px + x, py + y, 1, 1);
    }
  }
}

const TILE_SPRITES: Partial<Record<number, Sprite>> = {
  [TILE.WALL]: WALL_SPRITE,
  [TILE.DOOR]: DOOR_SPRITE,
  [TILE.STAIRS]: STAIRS_SPRITE,
  [TILE.SHORTCUT_GATE]: SHORTCUT_GATE_SPRITE,
  [TILE.BOSS_GATE]: BOSS_GATE_SPRITE,
  [TILE.FIRE_HAZARD]: FIRE_HAZARD_SPRITE,
};

const ENEMY_SPRITES: Record<Enemy['kind'], Sprite> = {
  BONE_GRUNT: BONE_GRUNT_SPRITE,
  EMBER_BAT: EMBER_BAT_SPRITE,
  VOLT_TURRET: VOLT_TURRET_SPRITE,
  FROST_WRAITH: FROST_WRAITH_SPRITE,
  TIME_WEAVER: TIME_WEAVER_SPRITE,
  CHRONO_LICH: CHRONO_LICH_SPRITE,
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

function drawPlayer(
  ctx: CanvasRenderingContext2D,
  facing: GameState['run']['facing'],
  px: number,
  py: number,
  colors: SpriteColors,
): void {
  switch (facing) {
    case 'DOWN':
      drawSprite(ctx, PLAYER_SPRITE, px, py, false, colors);
      break;
    case 'UP':
      drawSprite(ctx, PLAYER_SPRITE_UP, px, py, false, colors);
      break;
    case 'RIGHT':
      drawSprite(ctx, PLAYER_SPRITE_SIDE, px, py, false, colors);
      break;
    case 'LEFT':
      drawSprite(ctx, PLAYER_SPRITE_SIDE, px, py, true, colors);
      break;
  }
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
    drawPlayer(ctx, ghost.facing ?? 'DOWN', px, py, PLAYER_COLORS);
  } else {
    drawSprite(ctx, ENEMY_SPRITES[ghost.kind], px, py, false, ENEMY_COLORS);
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
      const sprite = TILE_SPRITES[row[tx]];
      if (sprite) drawSprite(ctx, sprite, x * TILE_SIZE, y * TILE_SIZE);
    }
  }

  // Player-created tile mutations (Flame Arc Lvl 3's Fire Hazard, Phase 8's
  // Ice-Barricade Scroll): kept off `dungeon.tiles` entirely, so they need
  // their own overlay draw on top of the base tile underneath them.
  for (const t of state.dungeon.expiringTiles) {
    const sx = t.x - cam.x;
    const sy = t.y - cam.y;
    if (sx < 0 || sx >= VIEWPORT_TILES_W || sy < 0 || sy >= VIEWPORT_TILES_H) continue;
    const sprite = TILE_SPRITES[t.tileType];
    if (sprite) drawSprite(ctx, sprite, sx * TILE_SIZE, sy * TILE_SIZE);
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
    drawSprite(ctx, wi.item.kind === 'ANCHOR' ? ANCHOR_SPRITE : CHEST_SPRITE, sx * TILE_SIZE, sy * TILE_SIZE);
  }

  for (const e of state.dungeon.enemies) {
    const sx = e.x - cam.x;
    const sy = e.y - cam.y;
    if (sx < 0 || sx >= VIEWPORT_TILES_W || sy < 0 || sy >= VIEWPORT_TILES_H) continue;

    const visual = getEntityVisual(e.id, e.x, e.y);
    const px = Math.round((visual.tileX - cam.x) * TILE_SIZE);
    const py = Math.round((visual.tileY - cam.y) * TILE_SIZE);
    if (e.hp < e.maxHp) drawHealthBar(ctx, px, py, e.hp, e.maxHp);
    drawSprite(ctx, ENEMY_SPRITES[e.kind], px, py, false, visual.flashing ? FLASH_COLORS : ENEMY_COLORS);
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
  drawPlayer(ctx, state.run.facing, playerPx, playerPy, playerVisual.flashing ? FLASH_COLORS : PLAYER_COLORS);

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
