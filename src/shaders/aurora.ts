// Praesidium polar aurora — TSL (spec P5a). Green curl-curtain ribbons over
// Praesidium's pole (lore: "a green aurora curls over its pole"). Additive,
// sub-star: the green (#7BE8A0) crosses >1 only at ribbon peaks so bloom
// (threshold >1.0) picks up a faint green wash there, while the rest stays
// near-void — it never competes with the star and is the single non-warm,
// non-star-hot emissive in the Reach (art-direction sanctioned, localized).
//
// "Curl" = domain-warped FBM (IQ pattern, same proven approach as nebula.ts),
// not an analytical curl-noise gradient — visually equivalent for a dim curtain
// and far cheaper on webgl2 (no per-axis finite-difference noise sampling).
// Drift is a slow (<0.5Hz) time shift on the warp/fbm coords → continuous, no
// strobe (photosafety lock). ponytail: 1 warp + 1 fbm eval regardless of band
// count; the tier band count is a cheap lat-mask toggle, never extra noise.
// Upgrade to true curl-noise if curtains read too flat at high tier.

import {
  uniform,
  vec3,
  float,
  pow,
  abs,
  smoothstep,
  positionLocal,
  normalize,
  mx_fractal_noise_float,
  time,
} from 'three/tsl';
import { MeshBasicNodeMaterial, AdditiveBlending, FrontSide } from 'three/webgpu';

export const auroraUniforms = {
  intensity: uniform(1.4), // peak ~1.27 at ribbon cores → faint bloom; average stays dim
  drift: uniform(0.03), // coord-shift / sec → visible drift well under 0.5Hz
  scale: uniform(2.2), // ribbon frequency on the shell
  bandLat0: uniform(0.55), // primary poleward band, lower latitude edge
  extraBands: uniform(0.0), // 1.0 on webgpu-high → two fainter equatorward rings
};

const auroraFn = () => {
  const p = positionLocal;
  const n = normalize(p);
  const lat = n.y; // [-1,1]; +1 = north pole. Signed (not abs) so the curl sits
  // over ONE pole only — art-direction.md "green curl over one pole" + lore
  // "curls over its pole" (both singular). abs(n.y) would mirror it south too.
  // Primary poleward curtain, plus (high tier only) two fainter rings — all
  // cheap lat masks, so band count adds zero noise cost.
  const b0 = smoothstep(auroraUniforms.bandLat0, auroraUniforms.bandLat0.add(0.22), lat);
  const b1 = smoothstep(float(0.06), float(0.0), abs(lat.sub(0.62)));
  const b2 = smoothstep(float(0.06), float(0.0), abs(lat.sub(0.40)));
  const bandMask = b0.add(b1.add(b2).mul(auroraUniforms.extraBands));
  // Curl-curtain ribbons: domain-warped FBM with a slow counter-drifting time shift.
  const q = n.mul(auroraUniforms.scale);
  const t = time.mul(auroraUniforms.drift);
  const warp = mx_fractal_noise_float(q.add(vec3(7.3, 1.1, 9.7)).add(t), 3, 2.0, 0.5, 1.0);
  const fbm = mx_fractal_noise_float(q.add(warp.mul(0.9)).sub(t.mul(0.5)), 4, 2.0, 0.55, 1.0);
  const ribbons = pow(fbm.mul(0.5).add(0.5), 2.5);
  const cur = bandMask.mul(ribbons);
  const green = vec3(0.482, 0.910, 0.627); // #7BE8A0
  return green.mul(cur).mul(auroraUniforms.intensity);
};

export function createAuroraMaterial() {
  const mat = new MeshBasicNodeMaterial();
  mat.colorNode = auroraFn();
  mat.side = FrontSide; // viewed from space; close fly-through inside the shell fades out (acceptable)
  mat.blending = AdditiveBlending;
  mat.transparent = true;
  mat.depthWrite = false;
  mat.toneMapped = true;
  return mat;
}
