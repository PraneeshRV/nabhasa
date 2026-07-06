// Composed ambient bed — spec Task 9. A static deep-space drone: three detuned
// low sine oscillators (55 Hz ± 0.7 Hz → ~0.7 Hz beat), lowpassed at 400 Hz,
// with a 0.05 Hz gain LFO (breathing), through a ConvolverNode whose IR is
// SYNTHESIZED at runtime (no audio file — synth-first, 0 KB payload). Feeds the
// engine master bus. Idempotent; safe before initAudio (no-ops).
//
// Lifetime (Task 9 + region wiring): startAmbient() returns a handle the owning
// shell disposes on unmount (stop + disconnect every node) so a route change
// can't leak the graph. The handle also exposes setBedGain(level) so the region
// atmosphere (App.RegionAtmosphere) can scale the bed to the streamed region's
// ambient floor. A module singleton (getAmbient) bridges the startAmbient and
// region-component lifetimes, mirroring sonify's active-handle registry.

import { getAudio } from './engine';

const BED_HZ = 55; // root
const DETUNE_HZ = 0.7; // beat rate between the three oscillators
const LP_HZ = 400; // lowpass cutoff
const LFO_HZ = 0.05; // slow gain breathing
const IR_SECONDS = 2.5; // reverb tail length

// Region ambientLevel (regions.ts: 0.008..0.02) → bed base gain. arrival (0.015)
// reproduces the original 0.18 bed; nearStar drops, swarm lifts. LFO depth tracks
// at 1/3 so bed.gain never goes negative across the breathing cycle.
const BED_GAIN_PER_LEVEL = 0.18 / 0.015;

export type AmbientHandle = {
  /** Scale the bed to a region's ambient floor (lerped by the caller). */
  setBedGain(level: number): void;
  /** Stop + disconnect every node; idempotent. */
  dispose(): void;
};

// Singleton handle so the region component can reach the live bed without a prop
// thread (startAmbient runs in the ENGAGE gesture; RegionAtmosphere mounts later).
let _handle: AmbientHandle | null = null;
export const getAmbient = (): AmbientHandle | null => _handle;

// Stereo impulse response synthesized in-code: decaying white noise → a cold,
// cavernous space tail. Replaces a shipped CC0 IR file (synth-first constraint).
function makeSpaceIR(ctx: AudioContext): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * IR_SECONDS);
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const env = Math.pow(1 - i / len, 2.6); // smooth power decay
      d[i] = (Math.random() * 2 - 1) * env;
    }
  }
  return buf;
}

export function startAmbient(): AmbientHandle | null {
  const a = getAudio();
  if (!a) return null;
  if (_handle) return _handle; // fire-once; idempotent
  const { ctx, master } = a;
  const now = ctx.currentTime;

  // Lowpass bus all three oscillators share.
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = LP_HZ;

  // Bed gain with a slow LFO on its .gain AudioParam (offset + LFO addend).
  const bed = ctx.createGain();
  bed.gain.value = BED_GAIN_PER_LEVEL * 0.015; // arrival default = 0.18
  const lfo = ctx.createOscillator();
  lfo.frequency.value = LFO_HZ;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = bed.gain.value / 3; // ± depth ≈ 1/3 of base (never negative)
  lfo.connect(lfoGain);
  lfoGain.connect(bed.gain);

  // Three detuned sines → shared lowpass → bed.
  const freqs = [BED_HZ - DETUNE_HZ, BED_HZ, BED_HZ + DETUNE_HZ];
  const oscGains: GainNode[] = [];
  const oscs = freqs.map((f) => {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.value = 1 / freqs.length; // mix to unity
    o.connect(g);
    g.connect(lp);
    oscGains.push(g);
    return o;
  });

  // Convolver (synthesized IR) on the post-bed signal, then to master.
  const conv = ctx.createConvolver();
  conv.buffer = makeSpaceIR(ctx);
  lp.connect(bed);
  bed.connect(conv);
  conv.connect(master);

  for (const o of oscs) o.start(now);
  lfo.start(now);

  function setBedGain(level: number): void {
    const t = ctx.currentTime;
    const base = level * BED_GAIN_PER_LEVEL;
    bed.gain.setTargetAtTime(base, t, 0.1);
    lfoGain.gain.setTargetAtTime(base / 3, t, 0.1); // keep the 1/3 depth ratio
  }

  function dispose(): void {
    if (!_handle) return;
    const t = ctx.currentTime;
    try {
      for (const o of oscs) o.stop(t);
      lfo.stop(t);
    } catch {
      /* already stopped */
    }
    for (const o of oscs) o.disconnect();
    for (const g of oscGains) g.disconnect();
    lp.disconnect();
    bed.disconnect();
    lfo.disconnect();
    lfoGain.disconnect();
    conv.disconnect();
    _handle = null;
  }

  _handle = { setBedGain, dispose };
  return _handle;
}
