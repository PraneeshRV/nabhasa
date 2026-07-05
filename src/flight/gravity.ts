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
