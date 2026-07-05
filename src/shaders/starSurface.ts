// Neutron-star surface — TSL (spec Task 5 core, prototyped early for /dev/system).
// Blackbody-hot emissive with magnetic-pole hotspots aligned to the beam axis;
// scrolling surface turbulence. Mesh rotation (not shader) carries the spin so
// beams/HUD/sonification can phase-lock to the same object transform.

import {
  Fn,
  uniform,
  float,
  vec3,
  color,
  mix,
  clamp,
  pow,
  abs,
  normalLocal,
  positionLocal,
  time,
  mx_fractal_noise_float,
} from 'three/tsl';
import { MeshBasicNodeMaterial } from 'three/webgpu';

export const starUniforms = {
  emissive: uniform(4.0), // >1 → selective-bloom target
  hotspotSharpness: uniform(6.0),
};

export function createStarSurfaceMaterial() {
  const mat = new MeshBasicNodeMaterial();

  // Surface churn: fast shallow turbulence, slow deep bands.
  const churn = mx_fractal_noise_float(positionLocal.mul(6.0).add(time.mul(0.15)), 4, 2.0, 0.5, 1.0)
    .mul(0.5)
    .add(0.5);

  // Magnetic poles along local Y (mesh is tilted by the scene): hot caps.
  const polar = pow(abs(normalLocal.y), starUniforms.hotspotSharpness);

  // Blackbody ramp: white-hot poles → orange body → deep ember limb.
  const bodyCol = mix(color('#ff8a50'), color('#ffd9b8'), churn.mul(0.6));
  const capCol = color('#fff4e8');
  const col = mix(bodyCol, capCol, clamp(polar.mul(1.6), 0.0, 1.0));

  mat.colorNode = col.mul(starUniforms.emissive.mul(churn.mul(0.35).add(0.75)));
  return mat;
}
