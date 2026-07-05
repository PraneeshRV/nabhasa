// Dim FBM nebula backplate — TSL (spec Task 5). 5-octave fractal noise + domain
// warp (IQ pattern) on an inward-facing far sphere. Art direction is binding
// here: NO purple/teal "space nebula" gradients (hard slop ban), never competes
// with the star — most of the sky stays void-black. This is a breath of
// blue-grey dust on #030407, nothing more.

import { uniform, color, mix, pow, positionLocal, mx_fractal_noise_float } from 'three/tsl';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { BackSide } from 'three';

export const nebulaUniforms = {
  intensity: uniform(0.025), // stays well below the star — a breath, not a gradient
  scale: uniform(2.5),
};

// ponytail: two-sample domain warp (one warp field) instead of full IQ multi-pass;
// visually indistinguishable for a backplate this dim. Upgrade to iterative warp
// if knots read too smooth at high tier.
const nebulaFn = () => {
  const p = positionLocal.mul(nebulaUniforms.scale);
  // Domain warp: distort the sample coords by a noise field, then read FBM there.
  const warp = mx_fractal_noise_float(p.add(7.3), 3, 2.0, 0.5, 1.0);
  const fbm = mx_fractal_noise_float(p.add(warp.mul(0.9)), 5, 2.0, 0.55, 1.0); // ~[-1,1]
  const d = fbm.mul(0.5).add(0.5); // [0,1]
  // Sharpen toward bright knots so most of the sphere stays at the void floor.
  const dust = pow(d, 3.0);
  const col = mix(color('#030407'), color('#3a5878'), dust); // void → faint star-mid dust
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
