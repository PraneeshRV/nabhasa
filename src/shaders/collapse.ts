// Stellar-collapse preloader — Nabhasa signature #1 (spec Task 8).
// One TSL graph → WGSL (WebGPU) + GLSL (WebGL2). A red supergiant compresses
// with load progress, implodes, blacks out, and is reborn as the tiny blue-white
// neutron star (the --star-hot accent, the loading gate).
//
// Palette honesty (art-direction): the dying star rides the ember family
// (--irradiated #C46A4A, transient emissive blackbody 4500K→1800K); the reborn
// neutron star IS --star-hot #AFE3FF. No second accent survives the flash. All
// bright values are emissive >1 (selective-bloom / blinding target), never a
// diffuse surface blooming. Lens dirt: never.
//
// Uniforms are module singletons (same pattern as starSurface.ts): useFrame in
// CollapsePreloader writes .value; every material reads them by reference.

import {
  uniform,
  float,
  vec3,
  mix,
  pow,
  abs,
  smoothstep,
  normalize,
  length,
  sin,
  cos,
  positionLocal,
  normalLocal,
  mx_fractal_noise_float,
} from 'three/tsl';
import { MeshBasicNodeMaterial, PointsNodeMaterial } from 'three/webgpu';
import { AdditiveBlending, DoubleSide } from 'three';

export const collapseUniforms = {
  // 0..1 — load progress drives compression + turbulence + color-temp drop.
  uProgress: uniform(0),
  // 0..1 — particle inward drift (implosion beat).
  uImplosion: uniform(0),
  // 0..1 — rebirth shockwave ring expansion.
  uShockwave: uniform(0),
  // 0..1 — white implosion flash.
  uFlash: uniform(0),
  uTime: uniform(0),
};

const { uProgress, uImplosion, uShockwave, uFlash, uTime } = collapseUniforms;

// Dying red supergiant — FBM turbulent surface, gravity-darkened limb, color
// temp falling 4500K→1800K (peach → ember) as progress rises. Radius/scale is
// driven on the mesh transform by CollapsePreloader (one mesh, cheap), so this
// shader only owns surface appearance, not size.
export function createCollapseStarMaterial() {
  const mat = new MeshBasicNodeMaterial();
  mat.toneMapped = true;

  const p = positionLocal;

  // Turbulence: amplitude + frequency climb with compression (star agitates).
  const amp = float(0.5).add(uProgress.mul(1.5));
  const uvw = p
    .mul(float(1.1).add(uProgress.mul(2.0)))
    .add(vec3(0.0, uTime.mul(0.18), uTime.mul(0.05)));
  const fbm = mx_fractal_noise_float(uvw, 5, 2.0, 0.5, 1.0).mul(0.5).add(0.5);

  // Gravity-darkening limb: edges darken as compression rises.
  const limb = pow(abs(normalLocal.y.add(normalLocal.x.mul(0.3))), 1.2);
  const darkening = mix(float(1.0), limb, uProgress.mul(0.85));

  // Blackbody ramp: warm 4500K peach → 1800K ember (--irradiated family).
  const warm = vec3(1.0, 0.72, 0.46); // ~4500K
  const ember = vec3(0.77, 0.42, 0.29); // #C46A4A normalized
  const body = mix(warm, ember, uProgress);
  // Bright churn veins above the body.
  const col = mix(body, body.mul(1.7), pow(fbm, 2.0));

  // Emissive >1 (bloom target); climbs with compression toward the flash.
  const emis = float(2.0).add(uProgress.mul(2.4)).mul(amp.mul(0.6).add(0.7));
  mat.colorNode = col.mul(emis).mul(darkening);
  return mat;
}

// Implosion particles — a CPU-seeded spherical shell (built in CollapsePreloader)
// drifted radially inward by uImplosion. No per-instance buffer / no instanceIndex:
// direction comes from positionLocal itself, so the same node graph runs on both
// backends. Additive ember, fading as the shell converges to center.
export function createCollapseParticleMaterial() {
  const mat = new PointsNodeMaterial();
  mat.transparent = true;
  mat.depthWrite = false;
  mat.blending = AdditiveBlending;
  mat.toneMapped = true;
  mat.size = 0.65;
  mat.sizeAttenuation = true;

  const p = positionLocal; // seeded shell position (CPU random once)
  const dir = normalize(p);
  const r0 = length(p);

  // Inward radial drift + faint swirl that grows with implosion.
  const swirl = vec3(
    sin(uTime.mul(3.0).add(r0)),
    cos(uTime.mul(2.3).add(r0.mul(0.5))),
    sin(uTime.mul(1.7).add(r0.mul(0.3))),
  );
  const liveR = r0.mul(float(1.0).sub(uImplosion));
  mat.positionNode = dir.mul(liveR).add(swirl.mul(uImplosion.mul(0.5)));

  // Ember, bright early, fading near full convergence.
  const ember = vec3(1.0, 0.55, 0.32);
  const fade = smoothstep(float(1.0), float(0.0), uImplosion);
  mat.colorNode = ember.mul(float(2.6).mul(fade.add(0.12)));
  return mat;
}

// Rebirth shockwave — thin ring expanding from the new neutron star, fading as it
// grows. Color is the --star-hot accent (this is the moment the accent is born).
export function createShockwaveMaterial() {
  const mat = new MeshBasicNodeMaterial();
  mat.transparent = true;
  mat.depthWrite = false;
  mat.blending = AdditiveBlending;
  mat.side = DoubleSide;
  mat.toneMapped = true;

  const accent = vec3(0.69, 0.89, 1.0); // #AFE3FF
  const fade = float(1.0).sub(uShockwave);
  mat.colorNode = accent.mul(pow(fade, 1.5)).mul(float(3.2));
  return mat;
}

// Full-frame implosion flash — transient beat (scripted, NOT lens dirt / NOT
// bloom-on-everything). Additive white keyed to uFlash.
export function createFlashMaterial() {
  const mat = new MeshBasicNodeMaterial();
  mat.transparent = true;
  mat.depthWrite = false;
  mat.blending = AdditiveBlending;
  mat.toneMapped = true;
  mat.colorNode = vec3(1.0).mul(uFlash.mul(float(2.2)));
  return mat;
}
