// Neutron-star surface — TSL (spec Task 5 core). Blue-white blackbody: art
// direction makes --star-hot #AFE3FF THE single hot accent, and a ~10^6 K
// neutron-star surface genuinely reads blue-white — so art + physics agree.
// Magnetic-pole hotspots sit on local Y (the group tilts the axis 15° in
// NeutronStar.tsx → beam axis); scrolling surface turbulence. Mesh rotation,
// not the shader, carries the spin so beams / HUD / sonification phase-lock to
// the same object transform via starSpinAngle (world/NeutronStar.tsx).

import {
  uniform,
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
  // >1 → selective-bloom target. Art direction: bloom threshold >1 catches ONLY
  // this (diffuse surfaces can never bloom).
  // 4.0 → 1.8 (2026-07-15 look-loop round 1, capture evidence): tuned pre-scale
  // for the r=10 star with post OFF; at r=50 with bloom ON the disc blew out to
  // a white blob that ate half the frame. 1.8 keeps it above the bloom
  // threshold while letting churn detail survive the AgX tonemap.
  emissive: uniform(1.8),
  hotspotSharpness: uniform(6.0),
  // Blackbody bias: 1 = nominal B1257+12 blue-white; raise to push poles whiter.
  temperature: uniform(1.0),
};

export function createStarSurfaceMaterial() {
  const mat = new MeshBasicNodeMaterial();

  // Surface churn: fast shallow turbulence riding slow deep bands.
  const churn = mx_fractal_noise_float(positionLocal.mul(6.0).add(time.mul(0.15)), 4, 2.0, 0.5, 1.0)
    .mul(0.5)
    .add(0.5);

  // Magnetic poles along local Y → hot caps.
  const polar = pow(abs(normalLocal.y), starUniforms.hotspotSharpness);

  // Blue-white blackbody ramp: deep --star-mid limb → --star-hot body → near-white cap.
  const limb = color('#5FA8D8'); // --star-mid
  const body = color('#AFE3FF'); // --star-hot (the single accent)
  const cap = color('#eaf6ff'); // near-white peak
  const tempBody = mix(limb, body, churn.mul(0.6).add(0.2));
  const col = mix(
    tempBody,
    cap,
    clamp(polar.mul(1.6).mul(starUniforms.temperature), 0.0, 1.0),
  );

  mat.colorNode = col.mul(starUniforms.emissive.mul(churn.mul(0.35).add(0.75)));
  return mat;
}
