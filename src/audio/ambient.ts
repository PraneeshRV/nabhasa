// Composed ambient bed — spec Task 9. A static deep-space drone: three detuned
// low sine oscillators (55 Hz ± 0.7 Hz → ~0.7 Hz beat), lowpassed at 400 Hz,
// with a 0.05 Hz gain LFO (breathing), through a ConvolverNode whose IR is
// SYNTHESIZED at runtime (no audio file — synth-first, 0 KB payload). Feeds the
// engine master bus. Idempotent; safe before initAudio (no-ops).

import { getAudio } from './engine';

const BED_HZ = 55; // root
const DETUNE_HZ = 0.7; // beat rate between the three oscillators
const LP_HZ = 400; // lowpass cutoff
const LFO_HZ = 0.05; // slow gain breathing
const IR_SECONDS = 2.5; // reverb tail length

let started = false;

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

export function startAmbient(): void {
  const a = getAudio();
  if (!a || started) return;
  started = true; // guard even if graph build throws partway — ambient is fire-once
  const { ctx, master } = a;
  const now = ctx.currentTime;

  // Lowpass bus all three oscillators share.
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = LP_HZ;

  // Bed gain with a slow LFO on its .gain AudioParam (offset + LFO addend).
  const bed = ctx.createGain();
  bed.gain.value = 0.18;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = LFO_HZ;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 0.06; // ± depth around bed.gain offset
  lfo.connect(lfoGain);
  lfoGain.connect(bed.gain);

  // Three detuned sines → shared lowpass → bed.
  const freqs = [BED_HZ - DETUNE_HZ, BED_HZ, BED_HZ + DETUNE_HZ];
  const oscs = freqs.map((f) => {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.value = 1 / freqs.length; // mix to unity
    o.connect(g);
    g.connect(lp);
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
}
