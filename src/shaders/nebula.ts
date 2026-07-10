// Dim FBM nebula backplate — TSL (spec Task 5; enriched A2 P5a). 6-octave
// fractal noise + domain warp (IQ pattern) on an inward-facing far sphere. Art
// direction is binding here: NO purple/teal "space nebula" gradients (hard slop
// ban), never competes with the star — most of the sky stays void-black. This is
// a breath of multi-hue dust on #030407, nothing more: a second low-frequency
// noise channel shifts the rare bright knots between cool star-mid blue and a
// faint warm tan (honest interstellar dust, never a second hot accent, still
// sub-star dim at intensity 0.025).

import { uniform, color, mix, pow, positionLocal, mx_fractal_noise_float } from 'three/tsl';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { BackSide } from 'three';

export const nebulaUniforms = {
  intensity: uniform(0.025), // stays well below the star — a breath, not a gradient
  scale: uniform(2.5),
};

// ponytail: one warp field (not full IQ multi-pass); visually indistinguishable
// for a backplate this dim. +1 fbm octave (5→6) and a 2-oct hue channel (A2 P5a)
// deliver "richer multi-hue" without doubling noise cost. Upgrade to iterative
// warp if knots read too smooth at high tier.
const nebulaFn = () => {
  const p = positionLocal.mul(nebulaUniforms.scale);
  // Domain warp: distort the sample coords by a noise field, then read FBM there.
  const warp = mx_fractal_noise_float(p.add(7.3), 3, 2.0, 0.5, 1.0);
  const fbm = mx_fractal_noise_float(p.add(warp.mul(0.9)), 6, 2.0, 0.55, 1.0); // ~[-1,1]
  const d = fbm.mul(0.5).add(0.5); // [0,1]
  // Sharpen toward bright knots so most of the sphere stays at the void floor.
  const dust = pow(d, 3.0);
  // Multi-hue (A2 P5a): a low-freq channel tints the dust cool↔warm. The warm
  // end is a desaturated tan (#4a4034), sub-1 — never the warm-emissive family
  // (lava/foundry/city-lights), never purple/teal, sanctioned dim dust only.
  const hue = mx_fractal_noise_float(p.mul(0.6).add(91.7), 2, 2.0, 0.5, 1.0).mul(0.5).add(0.5);
  const tint = mix(color('#3a5878'), color('#4a4034'), hue);
  const col = mix(color('#030407'), tint, dust); // void → faint multi-hue dust
  return col.mul(nebulaUniforms.intensity);
};

export function createNebulaMaterial() {
  const mat = new MeshBasicNodeMaterial();
  mat.colorNode = nebulaFn();
  mat.side = BackSide;
  mat.depthWrite = false;
  mat.toneMapped = true;
  return mat;
}
