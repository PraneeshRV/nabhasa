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
  vec2,
  vec3,
  cross,
  dot,
  normalize,
  length,
  abs,
  max,
  clamp,
  smoothstep,
  step,
  fract,
  floor,
  pow,
  mix,
  asin,
  atan,
  positionWorld,
  cameraPosition,
  cubeTexture,
  texture,
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
  plateIntensity: uniform(0.3), // additive skybox-plate gain (conservative; below stars)
};

const {
  rsVis,
  photonRing,
  bendK,
  ringIntensity,
  ringWidth,
  dopplerStrength,
  starScale,
  starThreshold,
  plateIntensity,
} = lensingUniforms;

// Optional baked starfield cubemap (Task 5 bake; Task 7 locked approach — "sample
// starfieldCube along bent ray"). Null-safe: cubeTexture() defaults to an empty
// CubeTexture (placeholder on the GPU → samples black), and skyCubeBlend gates
// procedural skyColor ↔ cubemap. LensingSkybox swaps skyCube.value + flips blend→1
// once the bake lands (Starfield doesn't mount on lensing tiers, so bakeStarfieldCube
// triggers it standalone). One TSL graph → WGSL + GLSL; procedural skyColor stays the
// active sky until the blend flips (graceful-null fallback). .value is a uniform write,
// not a graph rebuild — set once, no per-frame work.
export const skyCube = cubeTexture();
export const skyCubeBlend = uniform(0.0);

// Optional 2D skybox "plate" (skybox-base.avif): a faint additive nebula/sky tint
// sampled along the bent ray via equirectangular UV, below the stars. Same
// null-safe pattern as skyCube — texture() defaults to EmptyTexture (samples
// black), LensingSkybox swaps plateTex.value once the asset loads. One TSL
// graph → WGSL + GLSL; until the load lands (or on the static tier, where this
// shader never runs) the plate is a black no-op. .value is a uniform write, not
// a graph rebuild.
export const plateTex = texture();

// hash3 → 1: PCG integer hash (uint bit ops). Mirrors three's nodes/math/Hash.js
// + src/world/Starfield.tsx hash31 — fract(sin(dot)) diverged WGSL vs WebGL2 for
// sin args far beyond 2π, so the lensed sky differed per backend. Determinism is
// the goal; visual output may shift slightly from the sin-hash version.
const hash31 = /*@__PURE__*/ Fn(([p]: [any]) => {
  const seed = p.x.toUint().add(p.y.toUint().shiftLeft(1)).add(p.z.toUint().shiftLeft(2));
  const state = seed.mul(747796405).add(2891336453);
  const word = state.shiftRight(state.shiftRight(28).add(4)).bitXor(state).mul(277803737);
  const result = word.shiftRight(22).bitXor(word);
  return result.toFloat().mul(1 / 2 ** 32);
});

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

// Background sky sampled along an arbitrary direction. This is the procedural
// fallback: lensedSky mixes it against the baked starfield cubemap (skyCube) under
// skyCubeBlend. While blend=0 (no bake / static tier) this IS the sky; once
// LensingSkybox flips blend→1 the cubemap sampled along the bent ray takes over.
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

  // Skybox plate: equirectangular UV from the bent ray → faint additive sky tint
  // BELOW the stars. plateTex is EmptyTexture (samples black) until LensingSkybox
  // loads skybox-base.avif and swaps plateTex.value. Static tier never runs this.
  const plateUV = vec2(
    atan(bent.z, bent.x).mul(1 / (2 * Math.PI)).add(0.5),
    asin(clamp(bent.y, float(-1.0), float(1.0))).mul(1 / Math.PI).add(0.5),
  );
  const plate = plateTex.sample(plateUV).rgb.mul(plateIntensity);

  // Doppler tint: light dragged with the tangential (spin) direction — subtle.
  const tangent = normalize(cross(vec3(0.0, 1.0, 0.0), normalize(q.add(vec3(0.0, 1e-4, 0.0)))));
  const dopp = dot(dir, tangent).mul(dopplerStrength);
  // Bent ray → sky. skyCubeBlend selects procedural skyColor (0) or the baked
  // starfield cubemap sampled along the bent direction (1). .sample(bent) clones the
  // cube node with bent as its uv; skyCube.value is swapped in by LensingSkybox once
  // baked and reaches the sample through the node's referenceNode (no graph rebuild).
  // The plate is added to the incoming light BEFORE the doppler tint so the dragged
  // light applies to the combined star+plate signal (single shared doppler term).
  const bentSky = mix(skyColor(bent), skyCube.sample(bent).rgb, skyCubeBlend);
  const sky = bentSky.add(plate).mul(vec3(float(1.0).sub(dopp), 1.0, float(1.0).add(dopp)));

  // Capture: inside the photon ring everything falls to black.
  const captureMask = smoothstep(photonRing.mul(0.98), photonRing.mul(1.06), b);
  // Photon-ring glow: Lorentzian around b = photonRing, ember-hot.
  const ringGlow = ringIntensity.div(pow(abs(b.sub(photonRing)).div(ringWidth), 2.0).add(1.0));
  const ringColor = vec3(0.686, 0.890, 1.0);

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
