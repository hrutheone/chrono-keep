// Web Audio synthesis foundation (GDD Section 2/9): every sound is generated
// procedurally with oscillators/noise + a short gain envelope — no external
// audio files. Phase 5 wires the first Action/Status SFX pass; Phase 6 adds
// Screens & Music and Progression SFX on top of this same engine.

import { saveAudioSettings } from './persistence';
import { HUB_FLOOR } from './hub';
import type { Element, GameState, StatusEffect } from './types';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let musicGain: GainNode | null = null;
let musicFilter: BiquadFilterNode | null = null;

// Master volume/mute (Phase 7): settable/persistable before the AudioContext
// even exists (autoplay policy) — applied to `master.gain` immediately if
// unlocked, and re-applied the moment ensureContext() creates it.
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

    // Music bus (Section 11 Tactical Muffling): source -> lowpassFilter -> masterGain,
    // so music (and only music) can be muffled independently of one-shot SFX,
    // and both still respect master volume/mute (Phase 7).
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

/** Boss telegraph (Section 9D): rising warning tone across the 2-turn Time-Blast warning. */
export function playBossTelegraphSfx(): void {
  tone({ freq: 200, duration: 0.3, type: 'sawtooth', gain: 0.2, freqEnd: 500 });
}

/** Shortcut Gate opened (Section 9D): mechanical unlock + door groan. */
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

/** DEATH: descending "failure" stinger (Section 9C). */
export function playDeathSfx(): void {
  tone({ freq: 300, duration: 0.5, type: 'sawtooth', gain: 0.22, freqEnd: 60 });
}

/** VICTORY: fanfare + stat-reveal chimes (Section 9C). */
export function playVictorySfx(): void {
  [523, 659, 784, 1047].forEach((freq, i) => tone({ freq, duration: 0.3, type: 'square', gain: 0.22, delay: i * 0.1 }));
}

/** Loop reset (Section 9D): a "rewind" whoosh — a descending sweep read as reverse-played ticks. */
export function playLoopResetSfx(): void {
  tone({ freq: 700, duration: 0.4, type: 'triangle', gain: 0.2, freqEnd: 120 });
}

/** New Game / New Game+ (Section 9D): distinct from a loss-reset — an ascending chime. */
export function playNewGameSfx(): void {
  tone({ freq: 260, duration: 0.15, type: 'triangle', gain: 0.2, freqEnd: 520 });
}

/** Upgrade Shop purchase (Section 9D / 11): confirm chime + a short rising power chord. */
export function playPurchaseSfx(): void {
  [220, 277, 330].forEach((freq, i) => tone({ freq, duration: 0.18, type: 'square', gain: 0.18, delay: i * 0.05 }));
}

/** Skill unlock/upgrade (Section 9D): a distinct "power up" arpeggio. */
export function playSkillUnlockSfx(): void {
  [330, 440, 554, 660].forEach((freq, i) => tone({ freq, duration: 0.12, type: 'triangle', gain: 0.2, delay: i * 0.06 }));
}

// --- Screens & Music (Section 9C): a Web Audio "lookahead scheduler" ---
// A short, data-defined note sequence loops seamlessly by scheduling notes
// slightly ahead of AudioContext.currentTime on a ~25ms poll, rather than
// triggering oscillators directly off the JS timer (which drifts).

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

type TrackKey = 'title' | 'game' | 'game_tense' | 'boss';
const TRACKS: Record<TrackKey, MusicTrack> = {
  title: TITLE_THEME,
  game: GAME_THEME,
  game_tense: GAME_THEME_TENSE,
  boss: BOSS_THEME,
};

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

function playTrack(key: TrackKey): void {
  if (!ctx) return;
  currentTrack = TRACKS[key];
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

/** Section 11 Tactical Muffling: ramps the music-bus low-pass filter between a
 * transparent cutoff and a muffled one over ~200ms whenever the Inventory or
 * Skill Menu opens/closes — a ramp, not a hard switch, so it doesn't click. */
function setMusicMuffled(muffled: boolean): void {
  if (!ctx || !musicFilter || muffled === lastMuffled) return;
  lastMuffled = muffled;
  const target = muffled ? 700 : 20000;
  musicFilter.frequency.cancelScheduledValues(ctx.currentTime);
  musicFilter.frequency.linearRampToValueAtTime(target, ctx.currentTime + 0.2);
}

/** Call once per frame: picks TITLE/GAME/tense-GAME/boss music off the current
 * screen/floor/turns-remaining, switching tracks only when it actually
 * changes, and applies Tactical Muffling while a menu is open. */
export function updateMusicForState(state: GameState): void {
  if (!ctx) return; // Not unlocked yet.

  const screen = state.ui.currentScreen;
  const musicScreens = screen === 'GAME' || screen === 'INVENTORY' || screen === 'SKILL_MENU' || screen === 'HELP';
  let desired: TrackKey | null = null;
  if (screen === 'TITLE') desired = 'title';
  // Hub (Section 9C): "the one place the Anxiety Clock never plays" — always
  // the calm track, regardless of a possibly-stale turnsRemaining.
  else if (musicScreens && state.run.currentFloor === HUB_FLOOR) desired = 'game';
  else if (musicScreens) desired = state.run.currentFloor >= 4 ? 'boss' : state.run.turnsRemaining < 20 ? 'game_tense' : 'game';

  if (desired !== currentTrackKey) {
    if (desired === null) stopTrack();
    else playTrack(desired);
  }

  setMusicMuffled(screen === 'INVENTORY' || screen === 'SKILL_MENU');
}

// --- The Anxiety Clock (Section 11 Audio #1) ---
// A continuous background tick, quiet/slow above 20 turns, faster and louder
// at 20/10/5. Simplified from the GDD's full AudioContext-time lookahead
// scheduler (that pattern exists to keep a multi-note *melody* from drifting
// out of sync — see updateMusicForState above) to a self-rescheduling
// setTimeout: each tick re-reads the live turnsRemaining and re-picks its
// own next interval, which is enough precision for a single periodic tick.
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

/** Call once per frame: runs the Anxiety Clock only during GAME (not menus/
 * screens) and while unmuted; stops cleanly otherwise. */
export function updateAnxietyClock(state: GameState): void {
  if (!ctx) return;
  // Section 9C: the Hub is "the one place the Anxiety Clock never plays" —
  // guarded on currentFloor rather than relying on turnsRemaining staying
  // high, in case it's ever stale when the player warps in.
  const shouldRun = state.ui.currentScreen === 'GAME' && state.run.currentFloor !== HUB_FLOOR && !muted;
  if (shouldRun) {
    const wasRunning = anxietyStateRef !== null;
    anxietyStateRef = state;
    if (!wasRunning) scheduleAnxietyTick();
  } else if (anxietyStateRef) {
    stopAnxietyClock();
  }
}

// --- Low-Health Bass Heartbeat (Section 11 Audio #4) ---
// A slow "thump-thump" bass pulse, looping only while HP < 25% max. The
// vignette (index.html's #vignette, pure CSS) is toggled by hud.ts off the
// same threshold — this module only owns the sound half.
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

/** Call once per frame: starts/stops the heartbeat off run.currentHp/maxHp. */
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
