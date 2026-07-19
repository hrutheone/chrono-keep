// Web Audio synthesis foundation: sounds are generated procedurally with oscillators and noise.

import { saveAudioSettings } from './persistence';
import { biomeOf } from './content';
import { HUB_FLOOR } from './hub';
import { isArenaFloor, miniBossRepeatNumber } from './arenas';
import type { Element, GameState, StatusEffect } from './types';

// Floor 99: hardcoded to avoid circular dependencies with bossArena.ts.
const FINAL_BOSS_FLOOR = 99;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let musicGain: GainNode | null = null;
let musicFilter: BiquadFilterNode | null = null;

// Master volume and mute: applied when AudioContext is unlocked or created.
let masterVolume = 0.5;
let muted = false;

function applyMasterGain(): void {
  if (master) master.gain.value = muted ? 0 : masterVolume;
}

export function setMasterVolume(v: number): void {
  masterVolume = Math.min(1, Math.max(0, v));
  applyMasterGain();
}

export function setMuted(m: boolean): void {
  muted = m;
  applyMasterGain();
}

export function toggleMuted(): boolean {
  setMuted(!muted);
  return muted;
}

export function getMasterVolume(): number {
  return masterVolume;
}

export function isMuted(): boolean {
  return muted;
}

/** M: toggle mute. [ / ]: volume down/up by 10%. Persisted on every change. */
export function installAudioControls(): void {
  window.addEventListener('keydown', (ev) => {
    const key = ev.key.toLowerCase();
    if (key === 'm') {
      toggleMuted();
    } else if (key === '[') {
      setMasterVolume(getMasterVolume() - 0.1);
    } else if (key === ']') {
      setMasterVolume(getMasterVolume() + 0.1);
    } else {
      return;
    }
    saveAudioSettings({ volume: getMasterVolume(), muted: isMuted() });
  });
}

function ensureContext(): AudioContext {
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new Ctor();
    master = ctx.createGain();
    applyMasterGain();
    master.connect(ctx.destination);

    // Music bus: allows independent muffling of music from SFX.
    musicGain = ctx.createGain();
    musicGain.gain.value = 0.5;
    musicFilter = ctx.createBiquadFilter();
    musicFilter.type = 'lowpass';
    musicFilter.frequency.value = 20000; // effectively transparent
    musicGain.connect(musicFilter);
    musicFilter.connect(master);

    // Exposed for verification (Chrome DevTools MCP evaluate_script) and debugging.
    (window as unknown as { __chronoAudio: { ctx: AudioContext; master: GainNode; musicGain: GainNode; musicFilter: BiquadFilterNode } }).__chronoAudio =
      { ctx, master, musicGain, musicFilter };
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

/** Brown noise: a random walk over white noise, reads as a deeper, softer rumble than flat white noise. */
function brownNoiseBurst(duration: number, gain: number): void {
  if (!ctx || !master) return;
  const size = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(1, size, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let lastOut = 0;
  for (let i = 0; i < size; i++) {
    const white = Math.random() * 2 - 1;
    lastOut = (lastOut + 0.02 * white) / 1.02;
    data[i] = lastOut * 3.5;
  }
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

function noiseBurstHighpass(duration: number, gain: number, cutoff: number, delay = 0): void {
  if (!ctx || !master) return;
  const t0 = ctx.currentTime + delay;
  const size = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(1, size, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < size; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = cutoff;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  src.connect(filter);
  filter.connect(g);
  g.connect(master);
  src.start(t0);
  src.stop(t0 + duration);
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

/** Elemental attack sound. */
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

/** Temporal Anchor pickup sound. */
export function playAnchorSfx(): void {
  tone({ freq: 440, duration: 0.15, type: 'triangle', gain: 0.22 });
  tone({ freq: 660, duration: 0.15, type: 'triangle', gain: 0.22, delay: 0.12 });
  tone({ freq: 880, duration: 0.15, type: 'triangle', gain: 0.24, delay: 0.24 });
  tone({ freq: 1108.73, duration: 0.35, type: 'triangle', gain: 0.26, delay: 0.36 });
  // The "anchor slam" — a deep percussive thud under the fanfare's tail.
  noiseBurst(0.2, 0.2);
  tone({ freq: 60, duration: 0.4, type: 'sine', gain: 0.24, freqEnd: 35, delay: 0.36 });
}

export function playEquipSfx(): void {
  tone({ freq: 200, duration: 0.06, type: 'square', gain: 0.2 });
  tone({ freq: 120, duration: 0.08, type: 'square', gain: 0.18, delay: 0.05 });
}

export function playUnequipSfx(): void {
  tone({ freq: 120, duration: 0.08, type: 'square', gain: 0.18 });
  tone({ freq: 200, duration: 0.06, type: 'square', gain: 0.2, delay: 0.05 });
}

/** Rising warning tone for boss telegraphs. */
export function playBossTelegraphSfx(): void {
  tone({ freq: 200, duration: 0.3, type: 'sawtooth', gain: 0.2, freqEnd: 500 });
}

/** Shortcut Gate opened sound. */
export function playUnlockSfx(): void {
  tone({ freq: 260, duration: 0.05, type: 'square', gain: 0.2 });
  tone({ freq: 90, duration: 0.35, type: 'sawtooth', gain: 0.15, freqEnd: 60, delay: 0.08 });
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

/** Death sound. */
export function playDeathSfx(): void {
  tone({ freq: 300, duration: 0.5, type: 'sawtooth', gain: 0.22, freqEnd: 60 });
}

/** Frost enemy death: a high triangle tone with fast amplitude-modulated tremolo, for an icy shatter. */
function playFrostShatterSfx(): void {
  if (!ctx || !master) return;
  const t0 = ctx.currentTime;
  const duration = 0.35;
  const osc = ctx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(1200, t0);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.2, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.setValueAtTime(28, t0);
  const lfoGain = ctx.createGain();
  lfoGain.gain.setValueAtTime(0.15, t0);
  lfo.connect(lfoGain);
  lfoGain.connect(g.gain);
  osc.connect(g);
  g.connect(master);
  osc.start(t0);
  osc.stop(t0 + duration);
  lfo.start(t0);
  lfo.stop(t0 + duration);
}

/** Per-element enemy death cue. */
export function playEnemyDeathSfx(element: Element): void {
  switch (element) {
    case 'PHYSICAL':
      noiseBurst(0.1, 0.24);
      break;
    case 'FIRE':
      brownNoiseBurst(0.3, 0.2);
      break;
    case 'VOLT':
      tone({ freq: 1000, duration: 0.2, type: 'sawtooth', gain: 0.22, freqEnd: 100 });
      break;
    case 'FROST':
      playFrostShatterSfx();
      break;
    case 'CHRONO':
      tone({ freq: 200, duration: 0.3, type: 'sine', gain: 0.2, freqEnd: 800 });
      break;
  }
}

/** Victory sound. */
export function playVictorySfx(): void {
  [523, 659, 784, 1047].forEach((freq, i) => tone({ freq, duration: 0.3, type: 'square', gain: 0.22, delay: i * 0.1 }));
}

/** Loop reset rewind sound. */
export function playLoopResetSfx(): void {
  tone({ freq: 700, duration: 0.4, type: 'triangle', gain: 0.2, freqEnd: 120 });
}

/** Shortcut Gate warp sound. */
export function playWarpSfx(): void {
  tone({ freq: 200, duration: 0.3, type: 'sawtooth', gain: 0.18, freqEnd: 900 });
  tone({ freq: 900, duration: 0.15, type: 'sine', gain: 0.22, delay: 0.28 });
  tone({ freq: 1200, duration: 0.15, type: 'sine', gain: 0.18, delay: 0.34 });
}

/** New Game sound. */
export function playNewGameSfx(): void {
  tone({ freq: 260, duration: 0.15, type: 'triangle', gain: 0.2, freqEnd: 520 });
}

/** Upgrade Shop purchase sound. */
export function playPurchaseSfx(): void {
  [220, 277, 330].forEach((freq, i) => tone({ freq, duration: 0.18, type: 'square', gain: 0.18, delay: i * 0.05 }));
}

/** Skill unlock/upgrade sound. */
export function playSkillUnlockSfx(): void {
  [330, 440, 554, 660].forEach((freq, i) => tone({ freq, duration: 0.12, type: 'triangle', gain: 0.2, delay: i * 0.06 }));
}

/** Button hover tick. */
export function playHoverSound(): void {
  tone({ freq: 800, duration: 0.02, type: 'sine', gain: 0.08 });
}

/** Generic UI selection/confirm blip. */
export function playSelectSound(): void {
  tone({ freq: 400, duration: 0.1, type: 'square', gain: 0.18, freqEnd: 600 });
}

/** Item melted for Echoes — a crystalline shatter. */
export function playMeltSound(): void {
  tone({ freq: 800, duration: 0.06, type: 'triangle', gain: 0.18 });
  tone({ freq: 600, duration: 0.06, type: 'triangle', gain: 0.16, delay: 0.05 });
  tone({ freq: 400, duration: 0.08, type: 'triangle', gain: 0.14, delay: 0.1 });
  noiseBurstHighpass(0.08, 0.12, 3500, 0.1);
}

/** Action unavailable (disabled button, on cooldown, etc). */
export function playErrorSound(): void {
  tone({ freq: 150, duration: 0.15, type: 'sawtooth', gain: 0.16 });
}

// Music scheduler: seamlessly loops scheduled notes using a lookahead polling approach.

interface MusicNote {
  freq: number;
  duration: number; // seconds
  time: number; // seconds from the loop's start
  type: OscillatorType;
  gain: number;
}
interface MusicTrack {
  notes: MusicNote[];
  loopLength: number; // seconds
}

const SCHEDULE_AHEAD_S = 0.15;
const SCHEDULER_INTERVAL_MS = 25;

const TITLE_THEME: MusicTrack = {
  loopLength: 6,
  notes: [
    { freq: 220, duration: 1.8, time: 0, type: 'sine', gain: 0.1 },
    { freq: 277.18, duration: 1.8, time: 1.5, type: 'sine', gain: 0.08 },
    { freq: 164.81, duration: 2.2, time: 3, type: 'triangle', gain: 0.07 },
    { freq: 196, duration: 1.8, time: 4.5, type: 'sine', gain: 0.08 },
  ],
};

const GAME_THEME: MusicTrack = {
  loopLength: 5,
  notes: [
    { freq: 130.81, duration: 2, time: 0, type: 'sine', gain: 0.08 },
    { freq: 164.81, duration: 1.5, time: 2, type: 'sine', gain: 0.06 },
    { freq: 146.83, duration: 2, time: 3, type: 'triangle', gain: 0.06 },
  ],
};

const GAME_THEME_TENSE: MusicTrack = {
  loopLength: 2.4,
  notes: [
    { freq: 174.61, duration: 0.4, time: 0, type: 'square', gain: 0.07 },
    { freq: 207.65, duration: 0.4, time: 0.6, type: 'square', gain: 0.07 },
    { freq: 174.61, duration: 0.4, time: 1.2, type: 'square', gain: 0.07 },
    { freq: 155.56, duration: 0.5, time: 1.8, type: 'sawtooth', gain: 0.08 },
  ],
};

const BOSS_THEME: MusicTrack = {
  loopLength: 3,
  notes: [
    { freq: 110, duration: 0.5, time: 0, type: 'sawtooth', gain: 0.12 },
    { freq: 116.54, duration: 0.5, time: 0.5, type: 'sawtooth', gain: 0.1 },
    { freq: 130.81, duration: 0.5, time: 1, type: 'sawtooth', gain: 0.12 },
    { freq: 98, duration: 0.7, time: 1.5, type: 'square', gain: 0.1 },
    { freq: 220, duration: 0.3, time: 2.2, type: 'square', gain: 0.08 },
    { freq: 233.08, duration: 0.3, time: 2.6, type: 'square', gain: 0.08 },
  ],
};

/** Unique final-boss theme. */
const FINAL_BOSS_THEME: MusicTrack = {
  loopLength: 2.2,
  notes: [
    { freq: 82.41, duration: 0.4, time: 0, type: 'sawtooth', gain: 0.14 },
    { freq: 87.31, duration: 0.4, time: 0.4, type: 'sawtooth', gain: 0.12 },
    { freq: 98, duration: 0.4, time: 0.8, type: 'sawtooth', gain: 0.14 },
    { freq: 73.42, duration: 0.5, time: 1.2, type: 'square', gain: 0.13 },
    { freq: 293.66, duration: 0.3, time: 1.7, type: 'square', gain: 0.1 },
    { freq: 311.13, duration: 0.3, time: 2, type: 'square', gain: 0.1 },
  ],
};

// Per-Biome ambience keyed to the biome's element.
const ELEMENT_KEY_SHIFT: Record<Element, number> = {
  PHYSICAL: 1,
  FIRE: 1.12,
  VOLT: 1.19,
  FROST: 0.89,
  CHRONO: 1.35,
};

function biomeElement(biome: number): Element {
  if (biome === 1) return 'PHYSICAL';
  if (biome === 2) return 'VOLT';
  if (biome === 3) return 'FROST';
  if (biome === 10) return 'CHRONO';
  const theme = (biome - 4) % 3;
  return theme === 0 ? 'FIRE' : theme === 1 ? 'VOLT' : 'FROST';
}

function gameThemeForElement(element: Element): MusicTrack {
  const shift = ELEMENT_KEY_SHIFT[element];
  const type = ELEMENT_TYPE[element];
  return { loopLength: GAME_THEME.loopLength, notes: GAME_THEME.notes.map((n) => ({ ...n, freq: n.freq * shift, type })) };
}

/** Boss theme with escalating pitch and tempo based on repeats. */
function bossThemeForFloor(floor: number): MusicTrack {
  const mk = miniBossRepeatNumber(floor);
  if (mk === 0) return BOSS_THEME;
  const pitchMult = 1 + mk * 0.12;
  const tempoMult = 1 - mk * 0.1;
  return {
    loopLength: BOSS_THEME.loopLength * tempoMult,
    notes: BOSS_THEME.notes.map((n) => ({ ...n, freq: n.freq * pitchMult, time: n.time * tempoMult })),
  };
}

// Dynamic track key based on generated theme configurations.
type TrackKey = string;

let schedulerTimer: number | null = null;
let currentTrack: MusicTrack | null = null;
let currentTrackKey: TrackKey | null = null;
let trackStartTime = 0;
let nextNoteIdx = 0;

function scheduleNote(note: MusicNote, when: number): void {
  if (!ctx || !musicGain) return;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = note.type;
  osc.frequency.setValueAtTime(note.freq, when);
  g.gain.setValueAtTime(0.0001, when);
  g.gain.linearRampToValueAtTime(note.gain, when + 0.03);
  g.gain.exponentialRampToValueAtTime(0.0001, when + note.duration);
  osc.connect(g);
  g.connect(musicGain);
  osc.start(when);
  osc.stop(when + note.duration + 0.05);
}

function schedulerTick(): void {
  if (!ctx || !currentTrack) return;
  while (trackStartTime + currentTrack.notes[nextNoteIdx].time < ctx.currentTime + SCHEDULE_AHEAD_S) {
    const note = currentTrack.notes[nextNoteIdx];
    scheduleNote(note, trackStartTime + note.time);
    nextNoteIdx += 1;
    if (nextNoteIdx >= currentTrack.notes.length) {
      nextNoteIdx = 0;
      trackStartTime += currentTrack.loopLength;
    }
  }
}

function playTrack(key: TrackKey, track: MusicTrack): void {
  if (!ctx) return;
  currentTrack = track;
  currentTrackKey = key;
  nextNoteIdx = 0;
  trackStartTime = ctx.currentTime + 0.05;
  if (schedulerTimer === null) schedulerTimer = window.setInterval(schedulerTick, SCHEDULER_INTERVAL_MS);
}

function stopTrack(): void {
  currentTrack = null;
  currentTrackKey = null;
  if (schedulerTimer !== null) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
}

let lastMuffled = false;

/** Muffles background music. */
function setMusicMuffled(muffled: boolean): void {
  if (!ctx || !musicFilter || muffled === lastMuffled) return;
  lastMuffled = muffled;
  const target = muffled ? 700 : 20000;
  musicFilter.frequency.cancelScheduledValues(ctx.currentTime);
  musicFilter.frequency.linearRampToValueAtTime(target, ctx.currentTime + 0.2);
}

/** Updates music track based on game state. */
export function updateMusicForState(state: GameState): void {
  if (!ctx) return; // Not unlocked yet.

  const screen = state.ui.currentScreen;
  const musicScreens = screen === 'GAME' || screen === 'MENU';
  let desired: TrackKey | null = null;
  let desiredTrack: MusicTrack | null = null;

  if (screen === 'TITLE') {
    desired = 'title';
    desiredTrack = TITLE_THEME;
  } else if (musicScreens && state.run.currentFloor === HUB_FLOOR) {
    // Always use the calm neutral track in the Hub.
    desired = 'game_hub';
    desiredTrack = GAME_THEME;
  } else if (musicScreens) {
    const floor = state.run.currentFloor;
    if (floor === FINAL_BOSS_FLOOR) {
      desired = 'boss_final';
      desiredTrack = FINAL_BOSS_THEME;
    } else if (isArenaFloor(floor)) {
      const mk = miniBossRepeatNumber(floor);
      desired = `boss_mk${mk}`;
      desiredTrack = bossThemeForFloor(floor);
    } else if (state.run.turnsRemaining < 20) {
      desired = 'game_tense';
      desiredTrack = GAME_THEME_TENSE;
    } else {
      const element = biomeElement(biomeOf(floor));
      desired = `game_${element}`;
      desiredTrack = gameThemeForElement(element);
    }
  }

  if (desired !== currentTrackKey) {
    if (desired === null || desiredTrack === null) stopTrack();
    else playTrack(desired, desiredTrack);
  }

  setMusicMuffled(screen === 'MENU');
}

// --- The Anxiety Clock ---
// A continuous background tick that accelerates as remaining turns decrease.
interface AnxietyThreshold {
  intervalMs: number;
  freq: number;
  gain: number;
}

function anxietyThreshold(turnsRemaining: number): AnxietyThreshold {
  if (turnsRemaining <= 5) return { intervalMs: 350, freq: 900, gain: 0.2 };
  if (turnsRemaining <= 10) return { intervalMs: 600, freq: 700, gain: 0.16 };
  if (turnsRemaining <= 20) return { intervalMs: 900, freq: 500, gain: 0.12 };
  return { intervalMs: 1500, freq: 320, gain: 0.06 };
}

let anxietyTimer: ReturnType<typeof setTimeout> | null = null;
let anxietyStateRef: GameState | null = null;
let lastAnxietyThreshold: AnxietyThreshold | null = null;

function scheduleAnxietyTick(): void {
  if (!anxietyStateRef) return;
  const t = anxietyThreshold(anxietyStateRef.run.turnsRemaining);
  lastAnxietyThreshold = t;
  anxietyTimer = setTimeout(() => {
    if (!anxietyStateRef) return;
    tone({ freq: t.freq, duration: 0.06, type: 'square', gain: t.gain });
    scheduleAnxietyTick();
  }, t.intervalMs);
}

function stopAnxietyClock(): void {
  anxietyStateRef = null;
  lastAnxietyThreshold = null;
  if (anxietyTimer !== null) {
    clearTimeout(anxietyTimer);
    anxietyTimer = null;
  }
}

/** Updates the Anxiety Clock state. */
export function updateAnxietyClock(state: GameState): void {
  if (!ctx) return;
  // Ensure the clock does not run in the Hub.
  const shouldRun = state.ui.currentScreen === 'GAME' && state.run.currentFloor !== HUB_FLOOR && !muted;
  if (shouldRun) {
    const wasRunning = anxietyStateRef !== null;
    anxietyStateRef = state;
    if (!wasRunning) scheduleAnxietyTick();
  } else if (anxietyStateRef) {
    stopAnxietyClock();
  }
}

// --- Low-Health Bass Heartbeat ---
// Loops while HP < 25% max.
const HEARTBEAT_INTERVAL_MS = 900;
let heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
let heartbeatActive = false;

function scheduleHeartbeat(): void {
  heartbeatTimer = setTimeout(() => {
    tone({ freq: 65, duration: 0.14, type: 'sine', gain: 0.18 });
    tone({ freq: 58, duration: 0.14, type: 'sine', gain: 0.14, delay: 0.18 });
    if (heartbeatActive) scheduleHeartbeat();
  }, HEARTBEAT_INTERVAL_MS);
}

/** Updates the low health heartbeat sound. */
export function updateLowHealthHeartbeat(state: GameState): void {
  if (!ctx) return;
  const lowHp = state.ui.currentScreen === 'GAME' && state.run.currentHp / state.run.maxHp < 0.25 && !muted;
  if (lowHp && !heartbeatActive) {
    heartbeatActive = true;
    scheduleHeartbeat();
  } else if (!lowHp && heartbeatActive) {
    heartbeatActive = false;
    if (heartbeatTimer !== null) {
      clearTimeout(heartbeatTimer);
      heartbeatTimer = null;
    }
  }
}

export function debugAudioState(): {
  unlocked: boolean;
  contextState: string | null;
  masterGain: number | null;
  masterVolume: number;
  muted: boolean;
  musicTrack: TrackKey | null;
  musicFilterFreq: number | null;
  anxietyClockActive: boolean;
  anxietyThreshold: AnxietyThreshold | null;
  heartbeatActive: boolean;
} {
  return {
    unlocked: ctx !== null,
    contextState: ctx?.state ?? null,
    masterGain: master?.gain.value ?? null,
    masterVolume,
    muted,
    musicTrack: currentTrackKey,
    musicFilterFreq: musicFilter?.frequency.value ?? null,
    anxietyClockActive: anxietyStateRef !== null,
    anxietyThreshold: lastAnxietyThreshold,
    heartbeatActive,
  };
}
