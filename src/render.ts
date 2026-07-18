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
} from './palette';
import { TILE } from './mapgen';
import { eliteAffixColor } from './content';
import { spritesheet, SPRITE_PX } from './assets';
import {
  ACCESSORY_SPRITE_BY_NAME,
  CONSUMABLE_SPRITE_BY_NAME,
  POTION_SPRITE_BY_NAME,
  RELIC_SPRITE_BY_EFFECT,
  SPRITES,
  WEAPON_SPRITE_BY_NAME,
  type SpriteRef,
} from './sprites';
import { PLAYER_ID, updateAnimations, getEntityVisual, getDeathGhosts, getParticles, getBeams } from './animation';
import type { GhostVisual } from './animation';
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

/** Draws spritesheet cell. */
export function drawTile(
  ctx: CanvasRenderingContext2D,
  col: number,
  row: number,
  dx: number,
  dy: number,
  flipX = false,
  size = TILE_SIZE,
): void {
  const sx = col * SPRITE_PX;
  const sy = row * SPRITE_PX;
  if (flipX) {
    ctx.save();
    ctx.translate(dx + size, dy);
    ctx.scale(-1, 1);
    ctx.drawImage(spritesheet, sx, sy, SPRITE_PX, SPRITE_PX, 0, 0, size, size);
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

function drawRef(ctx: CanvasRenderingContext2D, ref: SpriteRef, dx: number, dy: number, flipX = false, flash = false, size = TILE_SIZE): void {
  if (flash) drawTileFlash(ctx, ref.col, ref.row, dx, dy, flipX, size);
  else drawTile(ctx, ref.col, ref.row, dx, dy, flipX, size);
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
  INFERNO_GOLEM: SPRITES.INFERNO_GOLEM,
  STORM_CALLER: SPRITES.STORM_CALLER,
  GLACIAL_KNIGHT: SPRITES.GLACIAL_KNIGHT,
};

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
  VIEWPORT_TILES_W = viewW / TILE_SIZE;
  VIEWPORT_TILES_H = viewH / TILE_SIZE;
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

  // Overlay expiring tiles.
  for (const t of state.dungeon.expiringTiles) {
    const sx = t.x - cam.x;
    const sy = t.y - cam.y;
    if (sx < 0 || sx >= VIEWPORT_TILES_W || sy < 0 || sy >= VIEWPORT_TILES_H) continue;
    const ref = TILE_REFS[t.tileType];
    if (ref) drawRef(ctx, ref, sx * TILE_SIZE, sy * TILE_SIZE);
  }

  // Draw telegraphs.
  if (state.dungeon.telegraphTiles.length > 0) {
    const pulse = 0.35 + 0.25 * Math.sin(performance.now() / 120);
    ctx.globalAlpha = pulse;
    for (const t of state.dungeon.telegraphTiles) {
      const sx = t.x - cam.x;
      const sy = t.y - cam.y;
      if (sx < 0 || sx >= VIEWPORT_TILES_W || sy < 0 || sy >= VIEWPORT_TILES_H) continue;
      ctx.fillStyle = t.payload === 'fire_aoe' ? COLOR_FIRE : t.payload === 'chill_pulse' ? COLOR_FROST : COLOR_ENEMY_LIGHT;
      ctx.fillRect(sx * TILE_SIZE, sy * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    }
    ctx.globalAlpha = 1;
  }

  // Draw ranged hit beams.
  for (const b of getBeams()) {
    const x1 = (b.fromX - cam.x) * TILE_SIZE + TILE_SIZE / 2;
    const y1 = (b.fromY - cam.y) * TILE_SIZE + TILE_SIZE / 2;
    const x2 = (b.toX - cam.x) * TILE_SIZE + TILE_SIZE / 2;
    const y2 = (b.toY - cam.y) * TILE_SIZE + TILE_SIZE / 2;
    ctx.strokeStyle = b.color;
    ctx.globalAlpha = b.alpha;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(Math.round(x1), Math.round(y1));
    ctx.lineTo(Math.round(x2), Math.round(y2));
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // Draw Cursed Rift.
  if (state.dungeon.riftX !== null && state.dungeon.riftY !== null) {
    const sx = state.dungeon.riftX - cam.x;
    const sy = state.dungeon.riftY - cam.y;
    if (sx >= 0 && sx < VIEWPORT_TILES_W && sy >= 0 && sy < VIEWPORT_TILES_H) {
      drawRef(ctx, SPRITES.CURSED_RIFT, sx * TILE_SIZE, sy * TILE_SIZE);
    }
  }

  for (const wi of state.dungeon.items) {
    const sx = wi.x - cam.x;
    const sy = wi.y - cam.y;
    if (sx < 0 || sx >= VIEWPORT_TILES_W || sy < 0 || sy >= VIEWPORT_TILES_H) continue;
    // Draw items/chests.
    const ref = wi.chestLoot
      ? SPRITES.CHEST
      : wi.item.kind === 'RELIC' && wi.item.effect
        ? (RELIC_SPRITE_BY_EFFECT[wi.item.effect] ?? SPRITES.RELIC)
        : (WORLD_ITEM_REFS_BY_NAME[wi.item.kind]?.[wi.item.name] ?? WORLD_ITEM_REFS[wi.item.kind] ?? SPRITES.CHEST);
    drawRef(ctx, ref, sx * TILE_SIZE, sy * TILE_SIZE);
  }

  for (const e of state.dungeon.enemies) {
    const sx = e.x - cam.x;
    const sy = e.y - cam.y;
    if (sx < 0 || sx >= VIEWPORT_TILES_W || sy < 0 || sy >= VIEWPORT_TILES_H) continue;

    const visual = getEntityVisual(e.id, e.x, e.y);
    const px = Math.round((visual.tileX - cam.x) * TILE_SIZE);
    const py = Math.round((visual.tileY - cam.y) * TILE_SIZE);

    // Scale logic.
    const colossal = e.affix === 'colossal';
    const big = BIG_ENEMY_KINDS.has(e.kind);
    const size = colossal ? TILE_SIZE * 1.5 : big ? BIG_TILE_SIZE : TILE_SIZE;
    const drawPx = big || colossal ? px - (size - TILE_SIZE) / 2 : px;
    const drawPy = big || colossal ? py - (size - TILE_SIZE) : py;

    if (e.hp < e.maxHp) drawHealthBar(ctx, px, drawPy, e.hp, e.maxHp);

    // Affix rendering.
    ctx.save();
    if (e.affix === 'blinking') {
      ctx.globalAlpha = 0.5;
    } else if (e.affix && e.affix !== 'colossal' && e.affix !== 'shielded') {
      ctx.shadowColor = eliteAffixColor(e.affix);
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

  for (const p of getParticles()) {
    const sx = (p.x - cam.x) * TILE_SIZE;
    const sy = (p.y - cam.y) * TILE_SIZE;
    if (sx < -2 || sx >= viewW + 2 || sy < -2 || sy >= viewH + 2) continue;
    ctx.fillStyle = p.color;
    ctx.globalAlpha = p.alpha;
    ctx.fillRect(Math.round(sx), Math.round(sy), 1, 1);
  }
  ctx.globalAlpha = 1;

  // Drawn last, always on top.
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
