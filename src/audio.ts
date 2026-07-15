// Web Audio synthesis foundation (GDD Section 2/9): every sound is generated
// procedurally with oscillators/noise + a short gain envelope — no external
// audio files. Phase 5 wires the first Action/Status SFX pass; Phase 6 adds
// Screens & Music and Progression SFX on top of this same engine.

import type { Element, StatusEffect } from './types';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

function ensureContext(): AudioContext {
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    // Exposed for verification (Chrome DevTools MCP evaluate_script) and debugging.
    (window as unknown as { __chronoAudio: { ctx: AudioContext; master: GainNode } }).__chronoAudio = { ctx, master };
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** Unlocks the AudioContext on the first user gesture (browser autoplay policy). */
export function initAudio(): void {
  const unlock = (): void => {
    ensureContext();
    window.removeEventListener('keydown', unlock);
    window.removeEventListener('click', unlock);
  };
  window.addEventListener('keydown', unlock, { once: true });
  window.addEventListener('click', unlock, { once: true });
}

/** Test/debug hook: forces the context open without waiting for a gesture. */
export function forceAudioInit(): void {
  ensureContext();
}

interface ToneOpts {
  freq: number;
  duration: number; // seconds
  type?: OscillatorType;
  gain?: number;
  freqEnd?: number; // optional pitch slide (up or down)
  delay?: number; // seconds, for staggered chords/arpeggios
}

function tone(opts: ToneOpts): void {
  if (!ctx || !master) return; // Not unlocked yet — silently skip, never blocks gameplay.
  const { freq, duration, type = 'square', gain = 0.25, freqEnd, delay = 0 } = opts;
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (freqEnd !== undefined) osc.frequency.linearRampToValueAtTime(freqEnd, t0 + duration);
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(g);
  g.connect(master);
  osc.start(t0);
  osc.stop(t0 + duration);
}

function noiseBurst(duration: number, gain = 0.25): void {
  if (!ctx || !master) return;
  const size = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(1, size, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < size; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
  src.connect(g);
  g.connect(master);
  src.start();
  src.stop(ctx.currentTime + duration);
}

const ELEMENT_FREQ: Record<Element, number> = {
  PHYSICAL: 180,
  FIRE: 260,
  VOLT: 640,
  FROST: 420,
  CHRONO: 720,
};
const ELEMENT_TYPE: Record<Element, OscillatorType> = {
  PHYSICAL: 'square',
  FIRE: 'sawtooth',
  VOLT: 'square',
  FROST: 'triangle',
  CHRONO: 'sine',
};

/** Bump-attack clang/whoosh/zap/crackle/chime, per element, with a Weakness crit
 * layer or a Resist mute (GDD Section 9A). */
export function playAttackSfx(element: Element, multiplier: number): void {
  const freq = ELEMENT_FREQ[element];
  const type = ELEMENT_TYPE[element];
  if (multiplier > 1) {
    tone({ freq, duration: 0.08, type, gain: 0.28 });
    tone({ freq: freq * 2, duration: 0.14, type: 'triangle', gain: 0.2, delay: 0.02 });
  } else if (multiplier < 1) {
    tone({ freq: freq * 0.6, duration: 0.16, type: 'sine', gain: 0.14 });
  } else {
    tone({ freq, duration: 0.1, type, gain: 0.22 });
  }
}

export function playEnemyHitPlayerSfx(): void {
  noiseBurst(0.08, 0.22);
  tone({ freq: 140, duration: 0.12, type: 'sawtooth', gain: 0.2, freqEnd: 90 });
}

export function playMoveSfx(): void {
  tone({ freq: 90, duration: 0.03, type: 'square', gain: 0.05 });
}

export function playBlockedSfx(): void {
  tone({ freq: 70, duration: 0.08, type: 'square', gain: 0.15, freqEnd: 50 });
}

export function playPickupSfx(): void {
  tone({ freq: 520, duration: 0.07, type: 'square', gain: 0.18 });
  tone({ freq: 780, duration: 0.09, type: 'square', gain: 0.16, delay: 0.06 });
}

export function playTimeShardSfx(): void {
  tone({ freq: 900, duration: 0.05, type: 'sine', gain: 0.2, delay: 0 });
  tone({ freq: 1200, duration: 0.05, type: 'sine', gain: 0.18, delay: 0.05 });
  tone({ freq: 1500, duration: 0.12, type: 'sine', gain: 0.16, delay: 0.1 });
}

export function playAnchorSfx(): void {
  tone({ freq: 440, duration: 0.12, type: 'triangle', gain: 0.22 });
  tone({ freq: 660, duration: 0.12, type: 'triangle', gain: 0.22, delay: 0.1 });
  tone({ freq: 880, duration: 0.2, type: 'triangle', gain: 0.24, delay: 0.2 });
}

export function playEquipSfx(): void {
  tone({ freq: 200, duration: 0.06, type: 'square', gain: 0.2 });
  tone({ freq: 120, duration: 0.08, type: 'square', gain: 0.18, delay: 0.05 });
}

export function playUnequipSfx(): void {
  tone({ freq: 120, duration: 0.08, type: 'square', gain: 0.18 });
  tone({ freq: 200, duration: 0.06, type: 'square', gain: 0.2, delay: 0.05 });
}

export function playPotionSfx(): void {
  tone({ freq: 300, duration: 0.05, type: 'sine', gain: 0.15 });
  tone({ freq: 440, duration: 0.2, type: 'sine', gain: 0.18, freqEnd: 660, delay: 0.05 });
}

const SKILL_SFX: Record<string, () => void> = {
  dash: () => tone({ freq: 300, duration: 0.12, type: 'sine', gain: 0.2, freqEnd: 600 }),
  cleave: () => {
    noiseBurst(0.06, 0.2);
    tone({ freq: 220, duration: 0.1, type: 'square', gain: 0.2, delay: 0.04 });
  },
  flame_arc: () => {
    noiseBurst(0.14, 0.22);
    tone({ freq: 180, duration: 0.18, type: 'sawtooth', gain: 0.2, freqEnd: 90 });
  },
  static_shift: () => {
    tone({ freq: 900, duration: 0.05, type: 'square', gain: 0.2 });
    tone({ freq: 300, duration: 0.08, type: 'sine', gain: 0.18, freqEnd: 700, delay: 0.05 });
  },
  ice_aegis: () => {
    tone({ freq: 700, duration: 0.1, type: 'triangle', gain: 0.2 });
    tone({ freq: 1050, duration: 0.14, type: 'triangle', gain: 0.16, delay: 0.06 });
  },
};

export function playSkillSfx(skillId: string): void {
  SKILL_SFX[skillId]?.();
}

const STATUS_APPLY_SFX: Record<StatusEffect, (() => void) | undefined> = {
  NONE: undefined,
  BURN: () => noiseBurst(0.1, 0.2),
  STUN: () => {
    tone({ freq: 900, duration: 0.05, type: 'square', gain: 0.2 });
    tone({ freq: 500, duration: 0.05, type: 'square', gain: 0.18, delay: 0.06 });
  },
  CHILLED: () => tone({ freq: 800, duration: 0.2, type: 'sine', gain: 0.16, freqEnd: 400 }),
};

export function playStatusApplySfx(status: StatusEffect): void {
  STATUS_APPLY_SFX[status]?.();
}

export function debugAudioState(): { unlocked: boolean; contextState: string | null; masterGain: number | null } {
  return {
    unlocked: ctx !== null,
    contextState: ctx?.state ?? null,
    masterGain: master?.gain.value ?? null,
  };
}
