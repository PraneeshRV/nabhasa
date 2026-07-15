// Threshold jump-gate (spec P5b). Adds the gate's two P5 surfaces on top of the
// P1.2 dark gate-ring placeholder in LichPlanets.ThresholdStructure:
//  1. a thin emissive --star-hot torus rim — the sanctioned >1 surface (art-
//     direction §post: "Threshold jump-gate … what bloom is for"). Opaque, unlit
//     (the station powers itself; r≈2700 wu, reflected Ember is negligible).
//  2. a subtle localized "fold" disc — a camera-facing disc sized to the ring's
//     inner radius whose TSL material shimmers (slow FBM drift, <0.5Hz — the
//     photosafety lock). Sub-1 additive: it never competes with the star; only
//     the rim crosses >1.
//
// Tracks Threshold's live orbit via the LichPlanets position singleton (Aurora
// idiom: position copy in useFrame, no setState). Mirrors the placeholder ring's
// transform exactly (rotation [PI/2+0.3,0,0], annulus 3.4–3.8) so the rim sits
// on the dark ring's face.
//
// Tier behavior (plan-verbatim, P5 tier matrix):
//   webgpu-high / webgpu-low → rim + fold disc.
//   webgl2                    → rim only (fold dropped; post off, webgl2 budget
//                               is legibility, not flourish).
//   static                    → render null.
//
// APPROACH (FALLBACK, per P5b expected-failure-mode clause): a true screen-space
// distortion pass needs the post/lensing graph (non-scope) or
// viewportSharedTexture (unverified in this build; headless can't iterate on a
// wrong API). Shipped the sanctioned in-world fallback: a camera-facing disc
// whose TSL material fakes the fold with a slow noise shimmer (no backdrop
// sampling). Upgrade path: swap gateFoldFn to sample viewportSharedTexture with
// a radial UV pinch for a literal backdrop warp.

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import { MeshBasicNodeMaterial, AdditiveBlending, DoubleSide } from 'three/webgpu';
import {
  vec3,
  float,
  smoothstep,
  length,
  mx_fractal_noise_float,
  time,
  positionLocal,
} from 'three/tsl';
import { getPlanetPositions } from './LichPlanets';
import type { Tier } from '../core/tiers';

// Contract canon: Threshold = REACH_SYSTEM index 7 (docs/a2-fantasy-plan.md).
const THRESHOLD_INDEX = 7;

// Mirror the P1.2 gate-ring placeholder transform EXACTLY (LichPlanets.tsx
// ThresholdStructure): rotation [PI/2 + 0.3, 0, 0], ringGeometry [3.4, 3.8, 64].
// If P1.2 changes that placeholder, update these to match.
const GATE_ROT: [number, number, number] = [Math.PI / 2 + 0.3, 0, 0];
const GATE_INNER = 10.2;
const GATE_CENTER_R = 10.8; // annulus centerline (10.2–11.4)

// --star-hot #AFE3FF (art-direction: the Ember re-emitted — Threshold's gate is
// the one place self-illumination outweighs reflected Ember).
// Rim >1 → bloom (sanctioned). Fold sub-1, additive, subtle.
const RIM_INTENSITY = 2.2; // peak channel ~2.2, well over the >1 bloom floor
const FOLD_INTENSITY = 0.7; // sub-1 additive veil — never competes with the star
const FOLD_DRIFT = 0.05; // noise-field shift / sec → near-static (<0.5Hz)
const FOLD_SCALE = 1.5; // noise frequency across the disc

// ponytail: no uniforms — tier is handled by conditional render, not runtime
// uniform writes, so the intensities are plain consts (aurora uses uniforms only
// because extraBands is a runtime tier write; JumpGate has no such write).

const gateRimFn = () => vec3(0.686, 0.890, 1.0).mul(float(RIM_INTENSITY));

const gateFoldFn = () => {
  // Disc lives in its local XY plane (circleGeometry, z≈0). positionLocal gives
  // the in-disc coordinate directly — no UV math, no vec3(vec2) construction.
  const p = positionLocal;
  const r = length(p).mul(float(1 / GATE_INNER)); // 0..1 outward
  const t = time.mul(float(FOLD_DRIFT));
  // FBM drift (aurora's proven mx_fractal_noise_float call: vec3 pos, octaves,
  // lacunarity, gain, normalize). vec3.add(float) broadcast is aurora-proven.
  const n = mx_fractal_noise_float(p.mul(float(FOLD_SCALE)).add(t), 3, 2.0, 0.5, 1.0);
  const fold = n.mul(float(0.5)).add(float(0.5)); // 0..1
  // Gate the fold to the ring interior: fade the very center (keep the hole
  // readable) and the outer edge (meet the rim cleanly). Reversed smoothstep
  // (edge0>edge1) is aurora-proven (its lat-band masks use the same form).
  const mask = smoothstep(float(0.08), float(0.35), r).mul(smoothstep(float(1.0), float(0.6), r));
  return vec3(0.686, 0.890, 1.0).mul(fold).mul(mask).mul(float(FOLD_INTENSITY));
};

function createGateRimMaterial() {
  const m = new MeshBasicNodeMaterial();
  m.colorNode = gateRimFn();
  m.side = DoubleSide; // gate readable from either approach side
  m.toneMapped = true;
  return m;
}

function createGateFoldMaterial() {
  const m = new MeshBasicNodeMaterial();
  m.colorNode = gateFoldFn();
  m.blending = AdditiveBlending;
  m.transparent = true;
  m.depthWrite = false;
  m.side = DoubleSide;
  m.toneMapped = true;
  return m;
}

export function JumpGate({ tier }: { tier: Tier }) {
  // Fold disc only on webgpu tiers (plan tier matrix). Rim stays on webgl2;
  // static → null (below). Hooks run unconditionally (Aurora idiom).
  const fold = tier === 'webgpu-high' || tier === 'webgpu-low';

  const rimMat = useMemo(() => createGateRimMaterial(), []);
  const foldMat = useMemo(() => createGateFoldMaterial(), []);
  const groupRef = useRef<THREE.Group>(null);
  const discRef = useRef<THREE.Mesh>(null);

  useEffect(
    () => () => {
      rimMat.dispose();
      foldMat.dispose();
    },
    [rimMat, foldMat],
  );

  // Track Threshold's orbit (singleton written in place once/frame by LichPlanets)
  // + billboard the fold disc to the camera so the shimmer reads from any approach
  // angle (the ring is tilted ~0.3 off horizontal → a planar-in-ring disc would be
  // edge-on from the orbital-plane approach). Refs only — no setState in useFrame.
  useFrame((state) => {
    if (tier === 'static') return;
    const pos = getPlanetPositions()[THRESHOLD_INDEX];
    if (groupRef.current && pos) groupRef.current.position.copy(pos);
    if (discRef.current) discRef.current.quaternion.copy(state.camera.quaternion);
  });

  if (tier === 'static') return null;

  return (
    <group ref={groupRef}>
      {/* emissive --star-hot rim, aligned with the dark gate-ring placeholder.
          Offset +z (along the ring normal) so the torus sits in front of the
          dark plane — no z-fight with the placeholder's flat annulus. */}
      <group rotation={GATE_ROT}>
        <mesh material={rimMat} position={[0, 0, 0.05]}>
          <torusGeometry args={[GATE_CENTER_R, 0.12, 16, 96]} />
        </mesh>
      </group>
      {/* localized fold disc (webgpu only): camera-facing, sized to the ring hole */}
      {fold ? (
        <mesh ref={discRef} material={foldMat} frustumCulled={false}>
          <circleGeometry args={[GATE_INNER, 64]} />
        </mesh>
      ) : null}
    </group>
  );
}
