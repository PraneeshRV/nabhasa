// Pulsar lighthouse beams — Nabhasa signature #3 (spec Task 10 core shader).
// One TSL graph → WGSL (WebGPU) + GLSL (WebGL2 fallback).
//
// Volumetric cone: additive, radial-falloff core, noise-modulated density.
// Art direction makes --star-hot #AFE3FF THE single hot accent — beam cores are
// near-star white pushed >1 so the (>1-threshold) bloom catches ONLY them
// (diffuse surfaces can never bloom). The cone apex sits on the star, base far
// out: a searchlight shaft widening with distance.
//
// Phase: this shader is TIME-INVARIANT in spin — it never reads the spin clock.
// Rotation is carried by the PulsarBeams group transform (rotation.y =
// starSpinAngle(starClock.t)), so visual / audio / HUD all lock to the one
// shared clamped clock (finding 1, world/NeutronStar.tsx). The only `time` use
// here is the density-noise scroll, which is independent of phase.

import {
  uniform,
  float,
  color,
  mix,
  pow,
  clamp,
  length,
  positionLocal,
  time,
  mx_fractal_noise_float,
} from 'three/tsl';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { AdditiveBlending, DoubleSide } from 'three';

// Geometry coupling: BEAM_LENGTH/BEAM_RADIUS MUST match the coneGeometry args in
// PulsarBeams.tsx (the density math assumes this exact cone). Exported so the
// component imports the single source.
export const BEAM_LENGTH = 2000; // wu (spec: ~2000)
export const BEAM_RADIUS = 90; // wu base — half-angle atan(90/2000) ≈ 2.58°

export const beamUniforms = {
  // Global brightness multiplier; PulsarBeams lifts this on transit (bloom).
  intensity: uniform(1.0),
  // >1 pushes the near-axis core past the (>1) bloom threshold so beam cores
  // read as blinding near the star (art direction: bloom is FOR beam cores).
  coreHot: uniform(1.5),
};

export function createBeamMaterial() {
  const mat = new MeshBasicNodeMaterial();

  const L = float(BEAM_LENGTH);
  const R = float(BEAM_RADIUS);

  // Cone object space (NOT translated by mesh.position): y ∈ [-L/2, L/2].
  // Apex (point) at +L/2 → that end sits on the star; base (disk) at -L/2 → far.
  const y = positionLocal.y;
  const d = y.add(L.div(2.0)); // [0, L]; 0 at base(far), L at apex(star)
  const t01 = d.div(L); // 0 = far end, 1 = star

  // Cone widens from apex (t01=1 → rMax 0) to base (t01=0 → rMax R).
  const rMax = R.mul(float(1.0).sub(t01)).max(1e-3);
  const r = length(positionLocal.xz);
  const radial = clamp(rMax.sub(r).div(rMax), 0.0, 1.0); // 1 on axis, 0 at edge

  // Axial density: hot near the star, falling off toward the far tip.
  const axial = pow(t01, 1.4);

  // Volumetric clumping — subtle FBM so the shaft isn't a plastic cone.
  const noise = mx_fractal_noise_float(positionLocal.mul(0.02).add(time.mul(0.5)), 3, 2.0, 0.5, 1.0)
    .mul(0.5)
    .add(0.5); // [-1,1] → [0,1]

  const density = axial.mul(radial).mul(noise);

  // --star-hot family: beam body = #AFE3FF (the accent), core → near-white peak.
  const body = color('#AFE3FF'); // --star-hot
  const core = color('#eaf6ff'); // near-white (--star-hot pushed to peak)
  const col = mix(body, core, clamp(pow(radial, 3.0), 0.0, 1.0));

  mat.colorNode = col.mul(beamUniforms.coreHot); // >1 → bloom threshold catches cores
  mat.opacityNode = density.mul(beamUniforms.intensity);

  mat.transparent = true;
  mat.depthWrite = false; // additive shafts never occlude
  mat.blending = AdditiveBlending;
  mat.side = DoubleSide; // see inside the cone wall
  mat.toneMapped = true; // AgX rolls the >1 core back into a readable highlight
  return mat;
}
