// Amber palette and entity accent colors.

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

// Elemental VFX accents.
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

/** Per-Biome wall tint wash, indexed by biome 0-9. Biome 1 stays untinted. */
export const BIOME_WALL_TINTS: (string | null)[] = [
  null,
  'rgba(255, 220, 0, 0.25)',
  'rgba(0, 200, 255, 0.3)',
  'rgba(255, 50, 0, 0.3)',
  'rgba(150, 255, 0, 0.25)',
  'rgba(100, 150, 255, 0.3)',
  'rgba(255, 100, 0, 0.3)',
  'rgba(0, 255, 200, 0.25)',
  'rgba(255, 0, 100, 0.3)',
  'rgba(150, 0, 255, 0.4)',
];
