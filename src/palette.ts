// Amber palette, plus entity accent colors so player/enemies pop against amber terrain.

import type { Element } from './types';

/** Background / Dark (Dark Amber Black) */
export const COLOR_BG = '#1a0f00';

/** Foreground / Light (Bright Amber Neon) */
export const COLOR_LIGHT = '#ffb300';

/** Midtone / UI (Muted Amber) */
export const COLOR_MID = '#996600';

/** Player accent (cool cyan) — never used for terrain, so the player always pops. */
export const COLOR_PLAYER_LIGHT = '#66f2ff';
export const COLOR_PLAYER_MID = '#1c7a8c';

/** Enemy accent (warm alarm red) — never used for terrain, so monsters always pop. */
export const COLOR_ENEMY_LIGHT = '#ff5c5c';
export const COLOR_ENEMY_MID = '#992424';

/** Hit-flash — briefly overrides an entity's own colors on a damage tick. */
export const COLOR_FLASH = '#ffffff';

// Elemental VFX accents — cast particles/beams color-coded per element.
export const COLOR_FIRE = '#ff8c1a';
export const COLOR_VOLT = '#fff33d';
export const COLOR_FROST = '#b3e8ff';
export const COLOR_CHRONO = '#c792ff';

/** Physical has no elemental accent — reuses the neutral amber. */
export const ELEMENT_COLOR: Record<Element, string> = {
  PHYSICAL: COLOR_LIGHT,
  FIRE: COLOR_FIRE,
  VOLT: COLOR_VOLT,
  FROST: COLOR_FROST,
  CHRONO: COLOR_CHRONO,
};
