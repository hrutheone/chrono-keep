// Asset Loader (GDD Section 4): the full-color game-world spritesheet.
// Imported through Vite so the file is fingerprinted and copied on build;
// main.ts awaits loadSpritesheet() before starting the render loop, so
// nothing ever calls drawImage against an undecoded image.

import spritesheetUrl from '../assets/spritesheet.png';

/** Pixel size of one spritesheet cell (tightly packed, no margins/spacing). */
export const SPRITE_PX = 8;

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
