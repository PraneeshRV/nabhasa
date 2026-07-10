// Clamped inverse-square gravity toward the neutron star at the origin (spec
// Task 6). The clamp max(r², KILL_RADIUS²) removes the r→0 singularity: inside
// the kill radius the magnitude is capped (the craft respawns at KILL_RADIUS
// anyway, so the clamp is a safety net, not the gameplay boundary).
//
// This is the SINGLE source of the gravity force. Both the pure integrator
// test (tests/gravity.test.ts) and the Rapier Craft step call it, so the test
// harness — not Rapier — is the correctness oracle for orbital feel.
//
// Sim units only. NEVER import the real-SI constants from hud/physics-data.
import { GM_SIM, KILL_RADIUS } from '../world/scale';
import { Vector3 } from 'three';

// a = -GM · r̂ / max(r², KILL_RADIUS²)   (negative ⇒ toward the star)
//   = pos · (-GM) / (|pos| · max(|pos|², KILL²))
export function gravityAccel(pos: Vector3, out: Vector3): Vector3 {
  const dist = pos.length();
  if (dist === 0) return out.set(0, 0, 0); // guarded; craft respawns before here
  const r2 = Math.max(dist * dist, KILL_RADIUS * KILL_RADIUS);
  const k = -GM_SIM / (r2 * dist);
  return out.copy(pos).multiplyScalar(k);
}

// ---- planet gravity (Amendment A1 → A2 Reach system) ------------------------
// The eight Reach worlds perturb the craft with the SAME clamped inverse-square
// form as the star. Per-world GM ∝ mass ratio vs the neutron star (PSR B1257+12
// ≈ 1.4 M☉ ≈ 466,124 M⊕). Masses here are the FICTIONAL gameplay-tuned Reach
// contract values (planets.ts REACH_SYSTEM), not real — so Corona's 95 M⊕ is
// only honest because it sits far out (2050 wu): at inner orbits 1/r² makes its
// pull gravity-noise next to the star, like every world. Planets perturb, never
// dominate; bump PLANET_GM_SCALE if the perturbation should read in gameplay.
//
// gravityAccel (star-only) is UNCHANGED — the orbit test's 1e-6 tolerance stays
// exact. This separate fn is what the craft step calls with the live planet
// centers from world/LichPlanets.getPlanetPositions().
//
// Masses + radii are DUPLICATED here (not imported from planets.ts): this is a
// three-free pure module, and planets.ts pulls three/tsl which must stay out of
// the gravity chunk + its node test.
const M_SUN_EARTH = 332946; // M☉ in Earth masses
const M_STAR_EARTH = 1.4 * M_SUN_EARTH; // PSR B1257+12 ≈ 466,124 M⊕
export const PLANET_GM_SCALE = 1; // 1.0 = true ratio-scale perturbation

// [Brace, Praesidium, Aletheia, Kiln, Vesper, Riven, Corona, Threshold];
// orbit shells 130/260/400/560/1250/1600/2050/2700 wu (inside PLAY_RADIUS,
// outside KILL_RADIUS) — mirror planets.ts REACH_SYSTEM. Soft radii are the
// worlds' radiusWu except Threshold (a station, not a sphere): ~6 keeps its
// collider clamped off the craft (A1 kinematic-collider close-out pattern).
export const PLANET_MASS_EARTHS = [0.4, 1.0, 0.8, 1.2, 1.1, 0.6, 95, 0.1] as const;
export const PLANET_RADII_WU = [3.0, 5.0, 4.6, 5.8, 6.2, 5.4, 9.0, 6.0] as const;
export const PLANET_GMS: readonly number[] = PLANET_MASS_EARTHS.map(
  (m) => (GM_SIM * PLANET_GM_SCALE * m) / M_STAR_EARTH,
);

const _bodyDir = new Vector3(); // scratch for the planet loop (never allocate per call)

// Star (exact, via gravityAccel) + each planet body's clamped inverse-square
// pull. positions/gms/softRadii are parallel arrays (length = #planets); pass
// empty arrays for star-only → result is bit-identical to gravityAccel.
export function gravityAccelWithPlanets(
  pos: Vector3,
  out: Vector3,
  positions: readonly Vector3[],
  gms: readonly number[],
  softRadii: readonly number[],
): Vector3 {
  gravityAccel(pos, out); // star — exact, unchanged path
  const n = Math.min(positions.length, gms.length, softRadii.length);
  for (let i = 0; i < n; i++) {
    _bodyDir.copy(pos).sub(positions[i]); // body → pos
    const dist = _bodyDir.length();
    if (dist === 0) continue; // guarded; craft doesn't sit on a planet center
    const r2 = Math.max(dist * dist, softRadii[i] * softRadii[i]); // clamp singularity
    const k = -gms[i] / (r2 * dist); // a = (pos−body)·k ⇒ toward the body
    out.addScaledVector(_bodyDir, k);
  }
  return out;
}
