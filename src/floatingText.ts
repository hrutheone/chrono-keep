// Floating Combat Text (GDD Section 11 #2): damage numbers and short strings
// (CRIT!, IMMUNE, +2 TURNS) float up off a sprite and fade. Drawn on canvas
// with a hand-authored pixel glyph set via fillRect — not ctx.fillText, which
// would antialias against imageSmoothingEnabled = false's crisp guarantee and
// be the first external-looking font in a codebase that generates every
// asset (Section 4).

const FLOAT_MS = 700;
const RISE_TILES = 0.8;

export type FloatKind = 'damage' | 'crit' | 'immune' | 'turns';

interface FloatingText {
  text: string;
  x: number;
  y: number;
  start: number;
  kind: FloatKind;
}

const texts: FloatingText[] = [];
const MAX_TEXTS = 60;

/** Spawns floating text centered over the tile at (x, y) (world/tile space). */
export function notifyFloatingText(x: number, y: number, text: string, kind: FloatKind = 'damage'): void {
  if (texts.length >= MAX_TEXTS) texts.shift();
  texts.push({ text, x, y, start: performance.now(), kind });
}

export interface FloatingTextVisual {
  text: string;
  x: number;
  y: number;
  alpha: number;
  kind: FloatKind;
}

/** Resolved render-space position + fade for every live floating text this frame. */
export function getFloatingTexts(): FloatingTextVisual[] {
  const now = performance.now();
  const out: FloatingTextVisual[] = [];
  for (let i = texts.length - 1; i >= 0; i--) {
    const f = texts[i];
    const t = (now - f.start) / FLOAT_MS;
    if (t >= 1) {
      texts.splice(i, 1);
      continue;
    }
    out.push({ text: f.text, x: f.x, y: f.y - t * RISE_TILES, alpha: 1 - t, kind: f.kind });
  }
  return out;
}

// --- 3x5 pixel glyph set: digits, '+', '!', space, and the letters needed
// for CRIT!, IMMUNE, and TURNS. Same 0/1 fillRect technique as sprites.ts. ---
type Glyph = number[][];
const G: Record<string, Glyph> = {
  '0': [
    [1, 1, 1],
    [1, 0, 1],
    [1, 0, 1],
    [1, 0, 1],
    [1, 1, 1],
  ],
  '1': [
    [0, 1, 0],
    [1, 1, 0],
    [0, 1, 0],
    [0, 1, 0],
    [1, 1, 1],
  ],
  '2': [
    [1, 1, 1],
    [0, 0, 1],
    [1, 1, 1],
    [1, 0, 0],
    [1, 1, 1],
  ],
  '3': [
    [1, 1, 1],
    [0, 0, 1],
    [1, 1, 1],
    [0, 0, 1],
    [1, 1, 1],
  ],
  '4': [
    [1, 0, 1],
    [1, 0, 1],
    [1, 1, 1],
    [0, 0, 1],
    [0, 0, 1],
  ],
  '5': [
    [1, 1, 1],
    [1, 0, 0],
    [1, 1, 1],
    [0, 0, 1],
    [1, 1, 1],
  ],
  '6': [
    [1, 1, 1],
    [1, 0, 0],
    [1, 1, 1],
    [1, 0, 1],
    [1, 1, 1],
  ],
  '7': [
    [1, 1, 1],
    [0, 0, 1],
    [0, 1, 0],
    [0, 1, 0],
    [0, 1, 0],
  ],
  '8': [
    [1, 1, 1],
    [1, 0, 1],
    [1, 1, 1],
    [1, 0, 1],
    [1, 1, 1],
  ],
  '9': [
    [1, 1, 1],
    [1, 0, 1],
    [1, 1, 1],
    [0, 0, 1],
    [1, 1, 1],
  ],
  '+': [
    [0, 0, 0],
    [0, 1, 0],
    [1, 1, 1],
    [0, 1, 0],
    [0, 0, 0],
  ],
  '!': [
    [0, 1, 0],
    [0, 1, 0],
    [0, 1, 0],
    [0, 0, 0],
    [0, 1, 0],
  ],
  ' ': [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ],
  C: [
    [1, 1, 1],
    [1, 0, 0],
    [1, 0, 0],
    [1, 0, 0],
    [1, 1, 1],
  ],
  R: [
    [1, 1, 1],
    [1, 0, 1],
    [1, 1, 1],
    [1, 1, 0],
    [1, 0, 1],
  ],
  I: [
    [1, 1, 1],
    [0, 1, 0],
    [0, 1, 0],
    [0, 1, 0],
    [1, 1, 1],
  ],
  T: [
    [1, 1, 1],
    [0, 1, 0],
    [0, 1, 0],
    [0, 1, 0],
    [0, 1, 0],
  ],
  M: [
    [1, 0, 1],
    [1, 1, 1],
    [1, 1, 1],
    [1, 0, 1],
    [1, 0, 1],
  ],
  U: [
    [1, 0, 1],
    [1, 0, 1],
    [1, 0, 1],
    [1, 0, 1],
    [1, 1, 1],
  ],
  N: [
    [1, 0, 1],
    [1, 1, 1],
    [1, 1, 1],
    [1, 1, 1],
    [1, 0, 1],
  ],
  E: [
    [1, 1, 1],
    [1, 0, 0],
    [1, 1, 1],
    [1, 0, 0],
    [1, 1, 1],
  ],
  S: [
    [1, 1, 1],
    [1, 0, 0],
    [1, 1, 1],
    [0, 0, 1],
    [1, 1, 1],
  ],
};

export const GLYPH_W = 3;
export const GLYPH_H = 5;
export const GLYPH_SPACING = 1;

/** Draws `text` in the pixel glyph font at pixel (px, py), one fillRect per lit pixel. */
export function drawGlyphText(ctx: CanvasRenderingContext2D, text: string, px: number, py: number, color: string): void {
  ctx.fillStyle = color;
  let cursor = px;
  for (const ch of text.toUpperCase()) {
    const glyph = G[ch] ?? G[' '];
    for (let y = 0; y < GLYPH_H; y++) {
      for (let x = 0; x < GLYPH_W; x++) {
        if (glyph[y][x]) ctx.fillRect(cursor + x, py + y, 1, 1);
      }
    }
    cursor += GLYPH_W + GLYPH_SPACING;
  }
}

export function measureGlyphText(text: string): number {
  return text.length * (GLYPH_W + GLYPH_SPACING) - GLYPH_SPACING;
}
