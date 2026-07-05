// Live star sonification — spec Task 9 + Amendment A1. Three layers, each a
// distinct audible signature so muting genuinely loses information:
//
//   pulse   — the REAL PSR B1257+12 spin rate (~160.8 Hz, from PULSAR.periodS)
//             as a continuous sine "heartbeat", gain ∝ beam→camera alignment
//             (swells on transit). This real-tone-as-fundamental is the whole
//             point of the A1 star swap. A beam-crossing accent sweep
//             (880→220 Hz, 90 ms) fires on the rising edge of alignment.
//   roar    — looped brown noise through a lowpass; gain + cutoff ∝ 1/r (the
//             audible descent as you dive toward the surface).
//   flare   — noise burst through a resonant filter, 200 ms decay, on flare
//             rising-edge events.
//
// Phase contract (A1): the spin clock is INJECTED as getSpinPhase so this module
// never imports NeutronStar; integration wires the real shared clock. It is used
// to gate crossing accents (fire only while the beam is actually sweeping, not
// frozen-aligned) — and it stays display-rate-honest: accents land on the VISUAL
// sweep the player sees, while the continuous tone is the true ~161 Hz.
//
// update() is meant to be called from the fixed loop at ~10 Hz. Safe before
// initAudio (returns a no-op handle).

import { getAudio } from './engine';
import { PULSAR } from '../hud/physics-data';

export type SonifyState = {
  rKm: number; // distance from star (1 wu = 1 km); drives roar ∝ 1/r
  beamAlignment: number; // 0..1 how much the beam points at the camera (drives pulse + accent)
  flare: boolean; // rising edge → resonant hit
};

export type SonifyHandle = {
  update(state: SonifyState): void;
  dispose(): void;
};

const SPIN_HZ = 1 / PULSAR.periodS; // ~160.82 Hz — the real spin tone fundamental

// Roar mapping (1/r). r is clamped to ≥ STAR radius so the curve is finite.
const ROAR_REF_R = 25; // KILL_RADIUS (scale.ts) — proximity saturates here
const ROAR_GAIN_MAX = 0.22;
const ROAR_CUT_MIN = 150;
const ROAR_CUT_RANGE = 1800;

// Pulse tone gain mapping (beam alignment → heartbeat loudness).
const TONE_BASE = 0.02; // faint heartbeat even between transits
const TONE_DEPTH = 0.16; // additional loudness at full alignment

// Beam-crossing accent sweep.
const ACCENT_THRESHOLD = 0.55; // rising above this = a transit begins
const ACCENT_MIN_GAP_S = 0.4; // debounce; also keeps audio well under any strobe rate
const SWEEP_FROM_HZ = 880;
const SWEEP_TO_HZ = 220;
const SWEEP_MS = 90;

// Flare hit.
const FLARE_DECAY_MS = 200;
const FLARE_Q = 6;
const FLARE_HZ = 900;

export const noop: SonifyHandle = { update() {}, dispose() {} };

// Desktop active-handle registry (Task 9 update loop). The handle is created in
// the ENGAGE gesture (App.engageAudio) but driven from HudSampler's 10Hz tick and
// disposed on experience unmount — three lifetimes bridged by one module
// singleton. Defaults to noop so update()/dispose() before arm or after dispose
// are safe no-ops.
let _active: SonifyHandle = noop;
export const getActiveSonify = (): SonifyHandle => _active;
export const setActiveSonify = (h: SonifyHandle): void => {
  _active = h;
};

// 2 s brown noise (Paul Kellet integrator) for the roar loop.
function makeBrownNoise(ctx: AudioContext, seconds: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * seconds);
  const buf = ctx.createBuffer(1, len, rate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    last = (last + 0.02 * w) / 1.02;
    d[i] = last * 3.5;
  }
  // Seamless loop: equal-power-style fade at head + tail kills the seam click
  // (integrated brown noise otherwise jumps between d[len-1] and d[0]).
  const fade = Math.floor(rate * 0.02);
  for (let i = 0; i < fade; i++) {
    const a = i / fade;
    d[i] *= a;
    d[len - 1 - i] *= a;
  }
  return buf;
}

export function initSonify(opts: { getSpinPhase: () => number }): SonifyHandle {
  const a = getAudio();
  if (!a) return noop; // pre-gesture: silent
  const { ctx, master } = a;
  const now = ctx.currentTime;

  // --- Roar: looped brown noise → lowpass → gain → master. ---
  const roarSrc = ctx.createBufferSource();
  roarSrc.buffer = makeBrownNoise(ctx, 2);
  roarSrc.loop = true;
  const roarLP = ctx.createBiquadFilter();
  roarLP.type = 'lowpass';
  roarLP.frequency.value = ROAR_CUT_MIN;
  const roarGain = ctx.createGain();
  roarGain.gain.value = 0;
  roarSrc.connect(roarLP);
  roarLP.connect(roarGain);
  roarGain.connect(master);
  roarSrc.start(now);

  // --- Pulse: continuous real-spin sine → gain → master. ---
  const tone = ctx.createOscillator();
  tone.type = 'sine';
  tone.frequency.value = SPIN_HZ;
  const toneGain = ctx.createGain();
  toneGain.gain.value = TONE_BASE;
  tone.connect(toneGain);
  toneGain.connect(master);
  tone.start(now);

  // Edge-detectors / schedulers.
  let lastAlign = 0;
  let lastAccent = -Infinity;
  let lastPhase = opts.getSpinPhase();
  let lastFlare = false;

  // Beam-crossing accent: sine sweep through a bandpass, gain ∝ peak alignment.
  function fireAccent(alignment: number): void {
    const t = ctx.currentTime;
    const peak = Math.max(alignment, ACCENT_THRESHOLD);
    const amp = 0.05 + 0.18 * (peak - ACCENT_THRESHOLD) / (1 - ACCENT_THRESHOLD);
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(SWEEP_FROM_HZ, t);
    osc.frequency.exponentialRampToValueAtTime(SWEEP_TO_HZ, t + SWEEP_MS / 1000);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = (SWEEP_FROM_HZ + SWEEP_TO_HZ) / 2;
    bp.Q.value = 1.4;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(amp, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + SWEEP_MS / 1000);
    osc.connect(bp);
    bp.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + SWEEP_MS / 1000 + 0.02);
  }

  // Flare hit: short noise burst through a resonant lowpass, exp decay.
  function fireFlare(): void {
    const t = ctx.currentTime;
    const dur = FLARE_DECAY_MS / 1000;
    const src = ctx.createBufferSource();
    src.buffer = makeBrownNoise(ctx, dur + 0.05);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = FLARE_HZ;
    f.Q.value = FLARE_Q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.25, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  function update(state: SonifyState): void {
    const t = ctx.currentTime;
    const { rKm, beamAlignment, flare } = state;

    // Roar ∝ 1/r: closer = louder + brighter.
    const prox = Math.min(1, ROAR_REF_R / Math.max(rKm, ROAR_REF_R));
    roarGain.gain.setTargetAtTime(prox * ROAR_GAIN_MAX, t, 0.1);
    roarLP.frequency.setTargetAtTime(ROAR_CUT_MIN + prox * ROAR_CUT_RANGE, t, 0.1);

    // Pulse tone swells with beam alignment.
    toneGain.gain.setTargetAtTime(TONE_BASE + TONE_DEPTH * beamAlignment, t, 0.08);

    // Accent on the RISING edge of a transit, debounced, and only while the beam
    // is actually sweeping (getSpinPhase advanced — not frozen on the camera).
    const phase = opts.getSpinPhase();
    const sweeping = Math.abs(phase - lastPhase) > 1e-4;
    const entered = beamAlignment >= ACCENT_THRESHOLD && lastAlign < ACCENT_THRESHOLD;
    if (entered && sweeping && t - lastAccent > ACCENT_MIN_GAP_S) {
      fireAccent(beamAlignment);
      lastAccent = t;
    }
    lastAlign = beamAlignment;
    lastPhase = phase;

    // Flare rising edge.
    if (flare && !lastFlare) fireFlare();
    lastFlare = flare;
  }

  function dispose(): void {
    const t = ctx.currentTime;
    try {
      roarSrc.stop(t);
      tone.stop(t);
    } catch {
      /* already stopped */
    }
    roarSrc.disconnect();
    roarLP.disconnect();
    roarGain.disconnect();
    tone.disconnect();
    toneGain.disconnect();
  }

  return { update, dispose };
}
