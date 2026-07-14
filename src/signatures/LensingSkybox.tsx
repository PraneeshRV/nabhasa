// Gravitational-lensing skybox — production mount (spec Task 7, step 3+).
// Wraps the PROVEN dual-backend lensing shader (shaders/lensing.ts) as the
// always-on ambient sky behind the chase camera. This file does not touch the
// shader graph — it mounts it and drives its existing uniforms.
//
// Tier behavior (QUALITY[tier].lensing):
//   'full' — skybox sphere at full resolution (proven dev-harness path).
//   'off'  — renders nothing; <Starfield> owns the sky (App gates the branch).
//   (half-res RT + bilateral upscale is DEFERRED — see DEVIATION 3; until a live
//   tier proves <30fps at full-res every lensing tier ships 'full'.)
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
//     sky input, sampled along bent rays. PLUMBED — bakeStarfieldCube(gl) fires
//     once on mount (Starfield doesn't mount on lensing tiers), then a useFrame
//     ref poll feeds getStarfieldCube() into skyCube + flips skyCubeBlend→1 once
//     non-null. Procedural skyColor stays the pre-bake fallback (blend=0) and the
//     null-safe path if the bake never lands. RT dispose stays owned by Starfield;
//     on lensing tiers Starfield never mounts, so the standalone-bake RT persists
//     for the session (one 512 cube RT, 6 faces — accepted, freed on page unload).
//  3. HALF-RES: no 'half' tier ships — every lensing tier renders the full-res
//     sphere (QUALITY says 'full'). The RT+bilateral pipeline is blind WebGPU
//     render-graph work (can't verify pass ordering here); dev harness measured
//     60fps WebGL2/Intel, so the fps gate holds without it. Add a 'half' tier
//     when a live tier proves <30fps at full-res.

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { RepeatWrapping, SRGBColorSpace, TextureLoader } from 'three';
import {
  createLensedSkyMaterial,
  lensingUniforms,
  plateTex,
  skyCube,
  skyCubeBlend,
} from '../shaders/lensing';
import { bakeStarfieldCube, getStarfieldCube } from '../world/Starfield';
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
// starScale baseline: the procedural skyColor cell density must match the baked
// cube's density (QUALITY[tier].bakeStarScale) or the skyCubeBlend flip pops —
// procedural skyColor (blend=0) ↔ cubemap sample (blend=1) read at different
// densities. We lift starScale to the tier's bake value on mount and restore it
// on unmount so a later /?dev=lensing session starts at the committed baseline.
const STAR_SCALE_BASELINE = lensingUniforms.starScale.value;
// Boost band: full lift at/below NEAR (near-star boundary, r<150 per regions.ts),
// none at/above FAR (well inside arrival spawn r≈1500). Keeps the ring a "thin
// anomaly" at arrival (art-direction) and blazes it only on approach.
const RING_NEAR_DIST = 150;
const RING_FAR_DIST = 600;
const RING_BOOST = 2.2; // peak ringIntensity multiplier at the near-star boundary

export function LensingSkybox({ tier }: { tier: Tier }) {
  const mode = QUALITY[tier].lensing;
  const { camera, gl } = useThree();

  // Proven material (procedural lensing graph, dual-backend). One per mount;
  // R3F auto-disposes JSX geometry but not a passed material → manual dispose.
  const material = useMemo(() => createLensedSkyMaterial(), []);

  // Latch: feed the baked cubemap into the shader exactly once (ref, no setState).
  const cubeFed = useRef(false);

  // Trigger the starfield bake once on mount. <Starfield> doesn't mount on lensing
  // tiers, so without this the shader's bent-ray cubemap sample never sees a real
  // sky (procedural skyColor would be the permanent fallback). Idempotent —
  // bakeStarfieldCube's singleton guard no-ops if Starfield already baked. RT
  // ownership stays in Starfield (we only read getStarfieldCube(), never dispose).
  useEffect(() => {
    if (mode === 'off') return; // 'off' → Starfield owns the sky + its own bake
    bakeStarfieldCube(gl, QUALITY[tier].bakeStarScale);
    // Match procedural skyColor cell density to the baked cube so the skyCubeBlend
    // flip (procedural → cubemap) doesn't pop on a density mismatch.
    lensingUniforms.starScale.value = QUALITY[tier].bakeStarScale;
    // Skybox plate: non-suspending async load (matches the cube-bake async idiom).
    // plateTex stays EmptyTexture (samples black) until the load lands; the .value
    // write reaches the bent-ray sample via the node's referenceNode (no rebuild).
    const plate = new TextureLoader().load(
      `${import.meta.env.BASE_URL}assets/skybox/skybox-base.avif`,
    );
    plate.colorSpace = SRGBColorSpace;
    plate.wrapS = RepeatWrapping; // equirect azimuth wraps; elevation ∈ [0,1]
    plateTex.value = plate;
    return () => {
      plate.dispose();
    };
  }, [gl, mode, tier]);

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
      lensingUniforms.starScale.value = STAR_SCALE_BASELINE;
    };
  }, [material]);

  // Drive ring strength from camera distance (refs, no setState). The emergent
  // physics adds the non-linear blaze; this just lifts the floor on approach.
  useFrame(() => {
    if (mode === 'off') return;
    const dist = camera.position.length(); // star at world origin
    const t = 1 - Math.min(1, Math.max(0, (dist - RING_NEAR_DIST) / (RING_FAR_DIST - RING_NEAR_DIST)));
    lensingUniforms.ringIntensity.value = RING_BASELINE * (1 + (RING_BOOST - 1) * t);

    // Feed the baked cubemap once it lands. The bake is one-shot but its texture
    // may take a frame to surface (WebGPU async pipeline compile), so poll until
    // non-null, then bind + flip blend once. skyCube is a UniformNode → .value is
    // a live uniform write (no graph rebuild); cubeFed gates it to a single set.
    if (!cubeFed.current) {
      const cube = getStarfieldCube();
      if (cube) {
        skyCube.value = cube;
        skyCubeBlend.value = 1;
        cubeFed.current = true;
      }
    }
  });

  if (mode === 'off') return null;

  // 'full' renders the proven sphere (DEVIATION 3: half-res deferred). renderOrder=-1
  // + the material's depthWrite=false → paints as a background behind all geometry.
  return (
    <mesh material={material} frustumCulled={false} renderOrder={-1}>
      <sphereGeometry args={[SKY_RADIUS, 48, 24]} />
    </mesh>
  );
}
