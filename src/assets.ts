// Spritesheet loading and asset utilities.

import spritesheetUrl from '../assets/new-spritesheet.png';
import { SHEET_COLS, SHEET_ROWS, type SpriteRef } from './sprites';

/** Pixel size of one spritesheet cell. */
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

/** Renders one spritesheet cell as an inline CSS style. */
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
