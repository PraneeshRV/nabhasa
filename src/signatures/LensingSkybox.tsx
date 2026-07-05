// Gravitational-lensing skybox — production mount (spec Task 7, step 3+).
// Wraps the PROVEN dual-backend lensing shader (shaders/lensing.ts) as the
// always-on ambient sky behind the chase camera. This file does not touch the
// shader graph — it mounts it and drives its existing uniforms.
//
// Tier behavior (QUALITY[tier].lensing):
//   'full' — skybox sphere at full resolution (proven dev-harness path).
//   'half' — same proven sphere; half-res RT + bilateral-upscale DEFERRED
//            (see DEVIATIONS). Lensing runs full-res here.
//   'off'  — renders nothing; <Starfield> owns the sky (App gates the branch).
//
// Einstein ring strengthens as the camera nears the star: camera→origin distance
// drives the shader's existing ringIntensity uniform each frame (refs only, no
// setState — Global perf rule). The shader's emergent physics already grows the
// ring on approach; this is the art-directed floor-lift (near-star = "violence").
//
// CAMERA FAR: the skybox sphere (radius SKY_RADIUS) must sit inside the camera's
// far plane or the geometry clips before any fragment runs → no sky. NabhasaCanvas
// doesn't set `far`, so we floor it here (Math.max → no-op if already large).
//
// DEVIATIONS (conductor review — each traces to a binding constraint):
//  2. CUBEMAP: getStarfieldCube() (Task 5 bake) is the lensing shader's intended
//     sky input, sampled along bent rays. NOT plumbed — feeding it to skyColor is
//     a shader extension (out of scope). Procedural skyColor is the active sky =
//     the graceful-null fallback. Wire when the conductor greenlights the extension.
//  3. HALF-RES: 'half' tier renders full-res. The RT+bilateral pipeline is blind
//     WebGPU render-graph work (can't verify pass ordering here); dev harness
//     measured 60fps WebGL2/Intel, so the fps gate holds without it. Add when a
//     live tier proves <30fps at full-res.

import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { createLensedSkyMaterial, lensingUniforms } from '../shaders/lensing';
import { QUALITY } from '../core/quality';
import type { Tier } from '../core/tiers';

// Encloses the camera everywhere inside PLAY_RADIUS (3000); matches the proven
// dev harness. BackSide → the inner surface is visible from any point inside.
const SKY_RADIUS = 5000;
// Far-plane floor: clears the sphere + headroom. No-op if the camera's far is larger.
const FAR_FLOOR = 20000;

// ringIntensity is a shared module singleton (also leva-bound on /dev/lensing, but
// that route never mounts this component). Cache the committed baseline so we
// modulate relative to it and restore on unmount.
const RING_BASELINE = lensingUniforms.ringIntensity.value;
// Boost band: full lift at/below NEAR (near-star boundary, r<150 per regions.ts),
// none at/above FAR (well inside arrival spawn r≈1500). Keeps the ring a "thin
// anomaly" at arrival (art-direction) and blazes it only on approach.
const RING_NEAR_DIST = 150;
const RING_FAR_DIST = 600;
const RING_BOOST = 2.2; // peak ringIntensity multiplier at the near-star boundary

export function LensingSkybox({ tier }: { tier: Tier }) {
  const mode = QUALITY[tier].lensing;
  const { camera } = useThree();

  // Proven material (procedural lensing graph, dual-backend). One per mount;
  // R3F auto-disposes JSX geometry but not a passed material → manual dispose.
  const material = useMemo(() => createLensedSkyMaterial(), []);

  // Guarantee the sphere renders regardless of the default far plane.
  useEffect(() => {
    if (camera.far < FAR_FLOOR) {
      camera.far = FAR_FLOOR;
      camera.updateProjectionMatrix();
    }
  }, [camera]);

  // Dispose + restore the shared uniform so a later /?dev=lensing session starts clean.
  useEffect(() => {
    return () => {
      material.dispose();
      lensingUniforms.ringIntensity.value = RING_BASELINE;
    };
  }, [material]);

  // Drive ring strength from camera distance (refs, no setState). The emergent
  // physics adds the non-linear blaze; this just lifts the floor on approach.
  useFrame(() => {
    if (mode === 'off') return;
    const dist = camera.position.length(); // star at world origin
    const t = 1 - Math.min(1, Math.max(0, (dist - RING_NEAR_DIST) / (RING_FAR_DIST - RING_NEAR_DIST)));
    lensingUniforms.ringIntensity.value = RING_BASELINE * (1 + (RING_BOOST - 1) * t);
  });

  if (mode === 'off') return null;

  // 'full' and 'half' both render the proven sphere (DEVIATION 3). renderOrder=-1
  // + the material's depthWrite=false → paints as a background behind all geometry.
  return (
    <mesh material={material} frustumCulled={false} renderOrder={-1}>
      <sphereGeometry args={[SKY_RADIUS, 48, 24]} />
    </mesh>
  );
}
