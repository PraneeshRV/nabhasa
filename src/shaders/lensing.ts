// Gravitational-lensing skybox — Nabhasa signature #2 (spec Task 7, FABLE-OWNED core).
// One TSL graph → WGSL (WebGPU) + GLSL (WebGL2 fallback).
//
// Model: thin-lens deflection, not full geodesic integration. For a view ray with
// impact parameter b (closest approach to the star at origin), light bends toward
// the mass by alpha ≈ bendK·rsVis/b — the 4GM/(c²b) weak-field shape with an
// art-directed gain. Rays with b below the photon ring are captured (black), with
// a Lorentzian glow at the boundary = the Einstein/photon ring.
// ponytail: thin-lens approx; upgrade path = multi-step pseudo-geodesic march if
// close-orbit arc wrap reads weak vs refs (vlwkaos/threejs-blackhole).

import {
  Fn,
  uniform,
  float,
  vec3,
  cross,
  dot,
  normalize,
  length,
  abs,
  max,
  smoothstep,
  step,
  fract,
  floor,
  sin,
  pow,
  positionWorld,
  cameraPosition,
} from 'three/tsl';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { BackSide } from 'three';

// Tunable uniforms (leva-bound on /dev/lensing; committed values = art direction).
export const lensingUniforms = {
  rsVis: uniform(6.0), // visual Schwarzschild radius (wu)
  photonRing: uniform(15.0), // capture radius (wu) — matches spec photon-ring visual
  bendK: uniform(2.0), // deflection gain: alpha = bendK·rsVis/b
  ringIntensity: uniform(1.4),
  ringWidth: uniform(0.9), // wu — Lorentzian half-width of the ring glow
  dopplerStrength: uniform(0.12), // subtle blue/red tint by tangential direction
  starScale: uniform(64.0), // procedural starfield cell density
  starThreshold: uniform(0.984), // fraction of cells with no star
};

const { rsVis, photonRing, bendK, ringIntensity, ringWidth, dopplerStrength, starScale, starThreshold } =
  lensingUniforms;

// hash3 → 1: classic fract(sin(dot)) — good enough for star placement, zero deps.
const hash31 = /*@__PURE__*/ Fn(([p]: [any]) =>
  fract(sin(dot(p, vec3(127.1, 311.7, 74.7))).mul(43758.5453)),
);

// One starfield layer: cube-projected cells, jittered star per surviving cell.
const starLayer = /*@__PURE__*/ Fn(([dir, scale, thresh]: [any, any, any]) => {
  const s = dir.mul(scale);
  const id = floor(s);
  const f = fract(s);
  const h = hash31(id);
  const jitter = vec3(
    hash31(id.add(vec3(1.3, 7.7, 3.1))),
    hash31(id.add(vec3(4.4, 2.2, 8.8))),
    hash31(id.add(vec3(9.1, 5.5, 1.7))),
  )
    .mul(0.8)
    .add(0.1);
  const d = length(f.sub(jitter));
  const core = smoothstep(float(0.12), float(0.0), d);
  // brightness variation from the same hash so bright stars are rare
  const mag = pow(h, 8.0);
  return core.mul(step(thresh, h)).mul(mag.mul(3.0).add(0.4));
});

// Background sky sampled along an arbitrary direction. Task 5's starfield cubemap
// replaces this at integration on high tiers; this stays as the KB-weight fallback.
const skyColor = /*@__PURE__*/ Fn(([dir]: [any]) => {
  const l1 = starLayer(dir, starScale, starThreshold);
  const l2 = starLayer(dir.add(vec3(3.7, 1.9, 8.2)), starScale.mul(2.3), starThreshold.add(0.004));
  const cool = vec3(0.85, 0.92, 1.1);
  const warm = vec3(1.1, 0.88, 0.72);
  // faint directional haze — placeholder nebula, replaced by art-directed FBM later.
  // Off-axis + tight falloff: most of the sky must stay void-black (art direction).
  const haze = pow(max(dot(dir, normalize(vec3(0.8, 0.35, -0.5))), 0.0), 8.0).mul(
    vec3(0.02, 0.008, 0.03),
  );
  return cool.mul(l1).add(warm.mul(l2).mul(0.6)).add(haze);
});

// The lensed sky: full deflection + capture + ring, per pixel, in world space.
// Mount on a BackSide far sphere; star assumed at world origin.
export const lensedSky = /*@__PURE__*/ Fn(() => {
  const dir = normalize(positionWorld.sub(cameraPosition));
  // Closest approach of the ray (cameraPosition + t·dir) to the star at origin.
  // t < 0 → star behind the ray: clamp to 0 so b = |cameraPosition| and alpha → tiny.
  const t = max(dot(cameraPosition, dir).negate(), 0.0);
  const q = cameraPosition.add(dir.mul(t)); // closest-approach point
  const b = max(length(q), 1e-3); // impact parameter
  const m = normalize(q).negate(); // from closest point toward the mass
  const alpha = bendK.mul(rsVis).div(b);
  const bent = normalize(dir.add(m.mul(alpha)));

  // Doppler tint: light dragged with the tangential (spin) direction — subtle.
  const tangent = normalize(cross(vec3(0.0, 1.0, 0.0), normalize(q.add(vec3(0.0, 1e-4, 0.0)))));
  const dopp = dot(dir, tangent).mul(dopplerStrength);
  const sky = skyColor(bent).mul(vec3(float(1.0).sub(dopp), 1.0, float(1.0).add(dopp)));

  // Capture: inside the photon ring everything falls to black.
  const captureMask = smoothstep(photonRing.mul(0.98), photonRing.mul(1.06), b);
  // Photon-ring glow: Lorentzian around b = photonRing, ember-hot.
  const ringGlow = ringIntensity.div(pow(abs(b.sub(photonRing)).div(ringWidth), 2.0).add(1.0));
  const ringColor = vec3(1.0, 0.55, 0.3);

  return sky.mul(captureMask).add(ringColor.mul(ringGlow));
});

export function createLensedSkyMaterial() {
  const mat = new MeshBasicNodeMaterial();
  mat.colorNode = lensedSky();
  mat.side = BackSide;
  mat.depthWrite = false;
  mat.toneMapped = true;
  return mat;
}
