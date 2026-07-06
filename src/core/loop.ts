// Fixed-step accumulator (spec Task 3). Drives deterministic physics at a fixed
// `hz` while the render loop runs free; returns the interpolation alpha for the
// renderer to blend between the last two physics states.
//
// NOTE on the spec's "clamp frameDt to 1/30": a GLOBAL 1/30 cap contradicts the
// gate test `tick(0.05) → 3 steps` (0.05 > 1/33 ⇒ a global cap yields 2). The
// 1/30 clamp therefore applies to the POST-PAUSE resume slice only: after a
// >0.5s gap (tab switch / suspend) the accumulator is zeroed and the resumed
// frame contributes at most one 1/33 slice (≤ 2 steps), preventing a catch-up
// storm. Normal frames accumulate unclamped and self-correct via carry.
// ponytail: unused in prod (Rapier updateLoop=independent owns stepping); kept as spec Task 3 contract artifact
export function createFixedLoop(step: (dt: number) => void, hz = 60) {
  const fixedDt = 1 / hz;
  let acc = 0;

  function tick(frameDt: number): number {
    if (frameDt > 0.5) {
      // Pause gap: drop any pre-pause leftover, then resume with a single clamped slice.
      acc = Math.min(frameDt, 1 / 30);
    } else {
      acc += frameDt;
    }

    let steps = 0;
    while (acc >= fixedDt) {
      step(fixedDt);
      acc -= fixedDt;
      steps += 1;
    }
    return acc / fixedDt; // interpolation alpha ∈ [0, 1)
  }

  return { tick };
}
