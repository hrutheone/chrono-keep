// Asset Loader (GDD Section 4): the full-color game-world spritesheet.
// Imported through Vite so the file is fingerprinted and copied on build;
// main.ts awaits loadSpritesheet() before starting the render loop, so
// nothing ever calls drawImage against an undecoded image.

import spritesheetUrl from '../assets/new-spritesheet.png';
import { SHEET_COLS, SHEET_ROWS, type SpriteRef } from './sprites';

/** Pixel size of one spritesheet cell (tightly packed, no margins/spacing). */
export const SPRITE_PX = 16;

export const spritesheet = new Image();

/** Resolves once the spritesheet is loaded and safe to drawImage. */
export function loadSpritesheet(): Promise<void> {
  return new Promise((resolve, reject) => {
    spritesheet.onload = () => resolve();
    spritesheet.onerror = () =>
      reject(new Error(`Failed to load spritesheet: ${spritesheetUrl}`));
    spritesheet.src = spritesheetUrl;
  });
}

/** Carry-over polish (Phase 19 Relic Tray): renders one spritesheet cell as
 * an HTML/CSS background image instead of a canvas drawImage — the pattern
 * this codebase didn't have yet (every other Section 8 HTML overlay is
 * text-driven). A single background-image at `displaySize / SPRITE_PX`
 * magnification, offset by `background-position` to the requested cell;
 * `image-rendering: pixelated` keeps the upscale crisp instead of blurry.
 * Returns a ready-to-inline `style="..."` attribute string, matching how
 * every other piece of Section 8 UI in this codebase builds HTML via
 * template-string `innerHTML`, not DOM node construction. */
export function spriteCssStyle(ref: SpriteRef, displaySize: number): string {
  const scale = displaySize / SPRITE_PX;
  const sheetW = SHEET_COLS * SPRITE_PX * scale;
  const sheetH = SHEET_ROWS * SPRITE_PX * scale;
  const bgX = -(ref.col * SPRITE_PX * scale);
  const bgY = -(ref.row * SPRITE_PX * scale);
  return (
    `width:${displaySize}px;height:${displaySize}px;` +
    `background-image:url(${spritesheetUrl});` +
    `background-position:${bgX}px ${bgY}px;` +
    `background-size:${sheetW}px ${sheetH}px;` +
    `background-repeat:no-repeat;image-rendering:pixelated;`
  );
}
