// Render-only animation layer for visualizing movement, damage, attacks, and deaths.

import { COLOR_ENEMY_LIGHT } from './palette';
import type { Enemy, GameState } from './types';

const SPRING_RATE = 0.3; // fraction of remaining distance closed per frame
const ATTACK_MS = 150;
const HIT_FLASH_MS = 150;
const DEATH_MS = 350;
const IDLE_PERIOD_MS = 1600; // breathing cycle
const ATTACK_LUNGE = 0.25; // tile-fractions
const IDLE_BOB_PX = 2; // idle bob amplitude

export const PLAYER_ID = '__player__';
export type GhostKind = 'PLAYER' | Enemy['kind'];

interface Snapshot {
  hp: number;
}

interface AttackPulse {
  dx: number;
  dy: number;
  start: number;
}

interface Ghost {
  kind: GhostKind;
  x: number;
  y: number;
  facing?: GameState['run']['facing'];
  start: number;
}

interface Track {
  hitFlashUntil: number;
  idlePhase: number;
}

interface VisualPos {
  x: number;
  y: number;
}

const snapshots = new Map<string, Snapshot>();
const tracks = new Map<string, Track>();
const attacks = new Map<string, AttackPulse>();
const ghosts = new Map<string, Ghost>();
const visualPositions = new Map<string, VisualPos>();

/** Clears all entity visual-lerp state; call on floor/hub transitions to avoid a cross-map swoosh. */
export function resetVisualLerps(): void {
  visualPositions.clear();
}

function getTrack(id: string): Track {
  let t = tracks.get(id);
  if (!t) {
    t = { hitFlashUntil: 0, idlePhase: Math.random() * IDLE_PERIOD_MS };
    tracks.set(id, t);
  }
  return t;
}

function getVisualPos(id: string, x: number, y: number): VisualPos {
  let pos = visualPositions.get(id);
  if (!pos) {
    pos = { x, y };
    visualPositions.set(id, pos);
  }
  return pos;
}

function updateOne(id: string, hp: number, now: number): void {
  const prev = snapshots.get(id);
  const track = getTrack(id);
  if (prev && hp < prev.hp) track.hitFlashUntil = now + HIT_FLASH_MS;
  snapshots.set(id, { hp });
}

/** Call once per render frame, before drawing, with the live player + enemies. */
export function updateAnimations(state: GameState): void {
  const now = performance.now();
  updateOne(PLAYER_ID, state.run.currentHp, now);

  const liveIds = new Set([PLAYER_ID]);
  for (const e of state.dungeon.enemies) {
    updateOne(e.id, e.hp, now);
    liveIds.add(e.id);
  }

  for (const id of [...snapshots.keys()]) {
    if (!liveIds.has(id)) {
      snapshots.delete(id);
      tracks.delete(id);
      attacks.delete(id);
      visualPositions.delete(id);
    }
  }

  for (const [id, ghost] of ghosts) {
    if (now - ghost.start > DEATH_MS) ghosts.delete(id);
  }
}

/** Attacker lunges toward (dx, dy) briefly. */
export function notifyAttack(id: string, dx: number, dy: number): void {
  attacks.set(id, { dx, dy, start: performance.now() });
}

/** Fading corpse/death-flash at (x, y). */
export function notifyDeath(id: string, kind: GhostKind, x: number, y: number, facing?: GameState['run']['facing']): void {
  ghosts.set(id, { kind, x, y, facing, start: performance.now() });
}

// Small pooled scatter-and-fade particle burst.
interface Particle {
  x: number;
  y: number;
  vx: number; // tiles/sec
  vy: number;
  start: number;
  life: number; // ms
  color: string;
}

const particles: Particle[] = [];
const PARTICLE_MAX = 200; // max particles limit

/** Scatters particles outward from (x, y) in `color`. */
export function spawnDeathParticles(x: number, y: number, color: string = COLOR_ENEMY_LIGHT): void {
  const now = performance.now();
  const count = 10 + Math.floor(Math.random() * 6);
  for (let i = 0; i < count && particles.length < PARTICLE_MAX; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 1.5 + Math.random() * 2.5;
    particles.push({
      x: x + 0.5,
      y: y + 0.5,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      start: now,
      life: 300 + Math.random() * 250,
      color,
    });
  }
}

export const spawnEffectParticles = spawnDeathParticles;

export interface ParticleVisual {
  x: number;
  y: number;
  alpha: number;
  color: string;
}

/** Resolved render-space position + fade for every live particle this frame. */
export function getParticles(): ParticleVisual[] {
  const now = performance.now();
  const out: ParticleVisual[] = [];
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    const t = now - p.start;
    if (t > p.life) {
      particles.splice(i, 1);
      continue;
    }
    const tSec = t / 1000;
    out.push({ x: p.x + p.vx * tSec, y: p.y + p.vy * tSec, alpha: 1 - t / p.life, color: p.color });
  }
  return out;
}

// Instant line flash for ranged hits.
const BEAM_MS = 180;
interface Beam {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  color: string;
  start: number;
}
const beams: Beam[] = [];
const BEAM_MAX = 30;

/** Flashes a line from (fromX, fromY) to (toX, toY) (tile-space, inclusive of both ends). */
export function notifyBeam(fromX: number, fromY: number, toX: number, toY: number, color: string): void {
  if (beams.length >= BEAM_MAX) beams.shift();
  beams.push({ fromX, fromY, toX, toY, color, start: performance.now() });
}

export interface BeamVisual {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  color: string;
  alpha: number;
}

/** Resolved fade for every live beam this frame. */
export function getBeams(): BeamVisual[] {
  const now = performance.now();
  const out: BeamVisual[] = [];
  for (let i = beams.length - 1; i >= 0; i--) {
    const b = beams[i];
    const t = (now - b.start) / BEAM_MS;
    if (t >= 1) {
      beams.splice(i, 1);
      continue;
    }
    out.push({ fromX: b.fromX, fromY: b.fromY, toX: b.toX, toY: b.toY, color: b.color, alpha: 1 - t });
  }
  return out;
}

/** Triangular 0 -> 1 -> 0 tween used for the attack lunge (out and back). */
function easeOutIn(t: number): number {
  return t < 0.5 ? t * 2 : (1 - t) * 2;
}

export interface EntityVisual {
  tileX: number;
  tileY: number;
  flashing: boolean;
}

/** Resolved render-space position + flash state for one live entity this frame. */
export function getEntityVisual(id: string, logicalX: number, logicalY: number): EntityVisual {
  const now = performance.now();
  const track = getTrack(id);
  const pos = getVisualPos(id, logicalX, logicalY);

  // Spring lerp: chase the logical (grid-snapped) position, closing 30% of the gap each frame.
  if (Math.abs(logicalX - pos.x) < 0.01) pos.x = logicalX;
  else pos.x += (logicalX - pos.x) * SPRING_RATE;
  if (Math.abs(logicalY - pos.y) < 0.01) pos.y = logicalY;
  else pos.y += (logicalY - pos.y) * SPRING_RATE;

  let tileX = pos.x;
  let tileY = pos.y;

  const pulse = attacks.get(id);
  if (pulse) {
    const t = (now - pulse.start) / ATTACK_MS;
    if (t >= 1) {
      attacks.delete(id);
    } else {
      const k = easeOutIn(t) * ATTACK_LUNGE;
      tileX += pulse.dx * k;
      tileY += pulse.dy * k;
    }
  } else if (id !== PLAYER_ID && pos.x === logicalX && pos.y === logicalY) {
    // Idle bob vertical drift for breathing effect (enemies only — the player stays still).
    const phase = ((now + track.idlePhase) % IDLE_PERIOD_MS) / IDLE_PERIOD_MS;
    tileY += Math.sin(phase * Math.PI * 2) * (IDLE_BOB_PX / 8);
  }

  return { tileX, tileY, flashing: now < track.hitFlashUntil };
}

export interface GhostVisual {
  kind: GhostKind;
  tileX: number;
  tileY: number;
  facing?: GameState['run']['facing'];
  alpha: number;
}

/** Fading corpses/death-flashes. */
export function getDeathGhosts(): GhostVisual[] {
  const now = performance.now();
  const out: GhostVisual[] = [];
  for (const ghost of ghosts.values()) {
    const t = (now - ghost.start) / DEATH_MS;
    if (t >= 1) continue;
    out.push({ kind: ghost.kind, tileX: ghost.x, tileY: ghost.y + t * 0.4, facing: ghost.facing, alpha: 1 - t });
  }
  return out;
}
