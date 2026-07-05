// WebAudio engine — spec Task 9. Owns the one AudioContext and the master graph:
// sources → master GainNode → DynamicsCompressorNode → destination. Mute is the
// default until the user gestures (the ENGAGE click calls initAudio); NOTHING is
// constructed at module load, so loading this file creates zero nodes and zero
// autoplay-policy warnings. Ambient + sonify reach the graph via getAudio() and
// no-op while audio is uninited (safe before the gesture).
//
// Graph: master(gain, default 0 = muted) → compressor → ctx.destination.
// visibilitychange suspends/resumes the context (CPU save when tab hidden).

export type AudioGraph = {
  ctx: AudioContext;
  master: GainNode; // pre-compressor input bus for all sources
  comp: DynamicsCompressorNode;
};

let audio: AudioGraph | null = null;
let muted = true;

const VIS_TARGET = 0.9; // master gain when unmuted (compressor catches peaks)

function onVisibility(): void {
  if (!audio) return;
  void (document.hidden ? audio.ctx.suspend() : audio.ctx.resume());
}

// MUST be called from a user gesture (the ENGAGE / "sound on" click). Builds the
// graph, resumes the (gesture-allowed) context, and arms visibility suspend.
// Idempotent — repeated calls are a no-op.
export function initAudio(): void {
  if (audio) return;
  const ctx = new AudioContext();
  const comp = ctx.createDynamicsCompressor();
  const master = ctx.createGain();
  master.gain.value = 0; // muted by default until setMuted(false)
  master.connect(comp);
  comp.connect(ctx.destination);
  audio = { ctx, master, comp };
  if (ctx.state === 'suspended') void ctx.resume();
  document.addEventListener('visibilitychange', onVisibility);
}

// Smooth master mute/unmute. Safe to call before initAudio (no-op then).
export function setMuted(b: boolean): void {
  muted = b;
  if (!audio) return;
  const t = audio.ctx.currentTime;
  audio.master.gain.cancelScheduledValues(t);
  audio.master.gain.setTargetAtTime(b ? 0 : VIS_TARGET, t, 0.05);
}

export function isMuted(): boolean {
  return muted;
}

// Source modules (ambient, sonify) pull the graph through this. null before the
// gesture — callers must treat null as "audio not ready" and stay silent.
export function getAudio(): AudioGraph | null {
  return audio;
}
