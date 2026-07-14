// Overture conductor — PURE timeline (spec §Architecture `src/overture/`). Maps
// normalized time t (0..1) to the rail parameter, the active phase, and the set of
// cinematic beats that have been crossed. No three, no R3F — pure number math, so
// the beat structure is unit-testable without WebGL (tests/overture-conductor).
//
// The conductor owns ONLY the timeline. Real wall-clock → t (duration, skip scrub)
// lives in skip.ts; t → world position lives in rail.ts; the R3F glue lives in
// Overture.tsx. Keeping this pure is what makes "fail if beats reorder" testable.
//
// Beats (canon choreographic order): lensing reveal → beam sweep → swarm glitter →
// Reach glide → handover. Thresholds are spaced for a ~75 s default duration:
// handover at 0.85 ⇒ the handover phase is the last ~11 s (the HUD fade-in "last
// 10 s" window lives there). railParam is clamp(t) for v1 — the Catmull-Rom rail
// supplies the spatial drama; a pacing ease is a future knob and the tests assert
// monotonicity, not identity, so adding one won't break them.

export type OvertureBeatId = 'lensing' | 'beam' | 'swarm' | 'glide' | 'handover';

// Phase == the beat currently owning the timeline. Named identically to its beat;
// the handover phase is the final approach + HUD fade + "YOU HAVE THE CRAFT".
export type OverturePhase = OvertureBeatId;

export interface Beat {
  id: OvertureBeatId;
  t: number; // normalized threshold in [0,1]
}

// Canon beat table. Reordering or moving a threshold out of [0,1] fails
// overture-conductor.test.ts (canon + strict-increasing + range asserts).
export const OVERTURE_BEATS: readonly Beat[] = [
  { id: 'lensing', t: 0.0 },
  { id: 'beam', t: 0.22 },
  { id: 'swarm', t: 0.45 },
  { id: 'glide', t: 0.68 },
  { id: 'handover', t: 0.85 },
];

// Handover phase start = the handover beat threshold. Exported so Overture.tsx can
// key the HUD fade + "YOU HAVE THE CRAFT" overlay off the exact same value the
// conductor uses to delimit the phase (single source).
export const HANDOVER_T = OVERTURE_BEATS[4].t;

// Clamp a raw t into the rail domain [0,1]. Skip scrub can overshoot past 1 and a
// resumed timeline can dip negative; the rail param must stay in-domain.
export function clampT(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

// Rail parameter for a given t. Linear (identity) for v1; monotonic-clamped so the
// camera never runs the spline backwards.
export function railParamAt(t: number): number {
  return clampT(t);
}

// Active phase = the last beat whose threshold has been crossed. At t=0 that is
// lensing; at/past the handover threshold it is handover for the rest of the rail.
export function phaseAt(t: number): OverturePhase {
  const ct = clampT(t);
  let phase: OverturePhase = OVERTURE_BEATS[0].id;
  for (let i = 0; i < OVERTURE_BEATS.length; i++) {
    if (ct >= OVERTURE_BEATS[i].t) phase = OVERTURE_BEATS[i].id;
    else break;
  }
  return phase;
}

// Every beat crossed at or before t, in canon order. The cumulative set the
// fire-once Conductor diffs against. Deterministic in t alone.
export function beatsCrossedBy(t: number): readonly OvertureBeatId[] {
  const ct = clampT(t);
  const out: OvertureBeatId[] = [];
  for (let i = 0; i < OVERTURE_BEATS.length; i++) {
    if (ct >= OVERTURE_BEATS[i].t) out.push(OVERTURE_BEATS[i].id);
    else break;
  }
  return out;
}

export interface ConductorStep {
  t: number; // clamped t the step was taken at
  railParam: number;
  phase: OverturePhase;
  fired: readonly OvertureBeatId[]; // beats newly crossed since the previous step
  done: boolean; // t has reached the end (>= 1)
}

// Stateful fire-once wrapper around the pure queries. Tracks the set of beats
// already emitted and fires each beat at most ONCE EVER — the first step whose t
// crosses its threshold. A beat that has fired never re-fires, even if t dips
// backward below its threshold and rises again (skip scrub then resume): fire-once
// is monotonic in emitted-knowledge, not in t-direction. lastT is NOT used because
// diffing cumulative-crossed sets would re-fire a beat after a backward dip.
// Overture.tsx calls step() once per frame with the timeline's current t.
export class Conductor {
  private emitted = new Set<OvertureBeatId>();

  step(t: number): ConductorStep {
    const ct = clampT(t);
    const fired: OvertureBeatId[] = [];
    for (const b of OVERTURE_BEATS) {
      if (ct >= b.t && !this.emitted.has(b.id)) {
        fired.push(b.id);
        this.emitted.add(b.id);
      }
    }
    return {
      t: ct,
      railParam: railParamAt(ct),
      phase: phaseAt(ct),
      fired,
      done: ct >= 1,
    };
  }

  reset(): void {
    this.emitted.clear();
  }
}
