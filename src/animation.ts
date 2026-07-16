// Lightweight, render-only animation layer (idle/walk/attack/damage/die).
// Turn resolution mutates GameState in one synchronous jump per action;
// this module diffs each frame's entity snapshot against the last one to
// infer movement and damage, and exposes two explicit hooks (notifyAttack,
// notifyDeath) for events whose intent can't be read back out of a diff.
// Nothing here ever mutates GameState — render.ts is the only reader.

import type { Enemy, GameState } from './types';

const MOVE_MS = 120;
const ATTACK_MS = 150;
const HIT_FLASH_MS = 150;
const DEATH_MS = 350;
const IDLE_PERIOD_MS = 1600; // slow breathing cycle (GDD Section 4)
const ATTACK_LUNGE = 0.25; // tile-fractions
const IDLE_BOB_PX = 2; // sine amplitude: +/- canvas pixels at an 8px tile

export const PLAYER_ID = '__player__';
export type GhostKind = 'PLAYER' | Enemy['kind'];

interface Snapshot {
  x: number;
  y: number;
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
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  moveStart: number;
  hitFlashUntil: number;
  idlePhase: number;
}

const snapshots = new Map<string, Snapshot>();
const tracks = new Map<string, Track>();
const attacks = new Map<string, AttackPulse>();
const ghosts = new Map<string, Ghost>();

function getTrack(id: string, x: number, y: number): Track {
  let t = tracks.get(id);
  if (!t) {
    t = { fromX: x, fromY: y, toX: x, toY: y, moveStart: 0, hitFlashUntil: 0, idlePhase: Math.random() * IDLE_PERIOD_MS };
    tracks.set(id, t);
  }
  return t;
}

function updateOne(id: string, x: number, y: number, hp: number, now: number): void {
  const prev = snapshots.get(id);
  const track = getTrack(id, x, y);

  if (prev && (prev.x !== x || prev.y !== y)) {
    track.fromX = prev.x;
    track.fromY = prev.y;
    track.toX = x;
    track.toY = y;
    track.moveStart = now;
  }
  if (prev && hp < prev.hp) track.hitFlashUntil = now + HIT_FLASH_MS;

  snapshots.set(id, { x, y, hp });
}

/** Call once per render frame, before drawing, with the live player + enemies. */
export function updateAnimations(state: GameState): void {
  const now = performance.now();
  updateOne(PLAYER_ID, state.run.playerX, state.run.playerY, state.run.currentHp, now);

  const liveIds = new Set([PLAYER_ID]);
  for (const e of state.dungeon.enemies) {
    updateOne(e.id, e.x, e.y, e.hp, now);
    liveIds.add(e.id);
  }

  for (const id of [...snapshots.keys()]) {
    if (!liveIds.has(id)) {
      snapshots.delete(id);
      tracks.delete(id);
      attacks.delete(id);
    }
  }

  for (const [id, ghost] of ghosts) {
    if (now - ghost.start > DEATH_MS) ghosts.delete(id);
  }
}

/** Attacker lunges toward (dx, dy) briefly. Called by combat.ts — a diff alone can't tell "who attacked whom." */
export function notifyAttack(id: string, dx: number, dy: number): void {
  attacks.set(id, { dx, dy, start: performance.now() });
}

/** Fading corpse/death-flash at (x, y). Called right as an entity is removed from state or the player is reset. */
export function notifyDeath(id: string, kind: GhostKind, x: number, y: number, facing?: GameState['run']['facing']): void {
  ghosts.set(id, { kind, x, y, facing, start: performance.now() });
}

// 1-Bit Pixel Particles (Section 11): a small pooled scatter-and-fade burst,
// same render-only/diff-free-of-gameplay-state philosophy as the rest of this
// module. Reuses the existing palette (no new accent colors).
interface Particle {
  x: number;
  y: number;
  vx: number; // tiles/sec
  vy: number;
  start: number;
  life: number; // ms
}

const particles: Particle[] = [];
const PARTICLE_MAX = 200; // hard cap so a chain of kills can't grow this unbounded

/** Scatters 10-15 single-pixel particles outward from (x, y) — an enemy death burst. */
export function spawnDeathParticles(x: number, y: number): void {
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
    });
  }
}

export interface ParticleVisual {
  x: number;
  y: number;
  alpha: number;
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
    out.push({ x: p.x + p.vx * tSec, y: p.y + p.vy * tSec, alpha: 1 - t / p.life });
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
  const track = getTrack(id, logicalX, logicalY);

  const moveT = track.moveStart === 0 ? 1 : Math.min(1, (now - track.moveStart) / MOVE_MS);
  let tileX = track.fromX + (track.toX - track.fromX) * moveT;
  let tileY = track.fromY + (track.toY - track.fromY) * moveT;

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
  } else if (moveT >= 1) {
    // Idle bob only when neither mid-move nor mid-attack: a slow Math.sin()
    // vertical drift (+/- IDLE_BOB_PX canvas pixels, GDD Section 4) so
    // single-frame spritesheet cells read as breathing/floating. Each entity
    // keeps its own random idlePhase so a room never bobs in lockstep.
    // render.ts rounds final pixel positions, keeping the art on whole pixels.
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

/** Fading corpses/death-flashes still worth a frame or two after removal from state. */
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
