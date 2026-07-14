// Pure HUD emphasis helpers (W5 Steps 1 + 4). Leaf module — no React/CSS imports,
// so the unit tests load it with zero side effects. Single source for the two
// thresholds the breath + dilation states key off; Telemetry imports them.

// beamState.transit above this ⇒ "RADIATION TRANSIT" banner + danger breath. Was
// Telemetry.tsx's local const; hoisted here as the single source (W5 Step 1) so
// the breath helper and the banner share one definition, not two.
export const TRAN_THRESHOLD = 0.4;

// t_you below this ⇒ time-dilation UI cue (W5 Step 4). 0.9 sits between cruise
// (dilation→1 far from the star) and the surface (timeDilation(10 km)≈0.766).
export const DILATION_EMPHASIS_THRESHOLD = 0.9;

export type BreathState = 'rest' | 'approach' | 'danger';

// rest ⇔ approach ⇔ danger. Danger (beam transit) outranks approach — a radiation
// sweep is the louder hazard. Strict >: transit 0.4 exactly is NOT danger (the
// banner itself uses the same strict comparison in Telemetry; edge pinned in tests).
export function hudBreathState(approaching: boolean, beamTransit: number): BreathState {
  if (beamTransit > TRAN_THRESHOLD) return 'danger';
  if (approaching) return 'approach';
  return 'rest';
}

// Strict <: dilation 0.9 exactly is NOT emphasized (mirrors the breath edge).
export function dilationEmphasis(dilation: number): boolean {
  return dilation < DILATION_EMPHASIS_THRESHOLD;
}
