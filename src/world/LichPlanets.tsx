// Lich planets in the MAIN scene (Amendment A1). The three real PSR B1257+12
// bodies — Draugr / Poltergeist / Phobetor — orbit the neutron star on
// Kepler-ratio compressed orbits (periods from planets.ts preserve the real
// period ratios; only the absolute timescale is compressed, ~1 rev / 60 s at
// Draugr). Gameplay anchors, not decoration: gravity.ts reads their live
// positions (planet perturbation on the craft), courier missions route between
// their orbit shells.
//
// Reuses planets.ts materials + data verbatim — no shader re-derivation. The
// star stays the sole point light (art-direction); MeshStandardNodeMaterial
// planets are lit only by it. The ember rim is sub-1 emissive (irradiation),
// not a second light.
//
// Live positions: module-singleton Vector3[] (leaf idiom, same shape as
// flight/craftState), written in place once/frame here, read by gravity (Craft
// physics step) + courier. Refs only — zero per-frame setState (perf rule).
// Materials disposed on unmount.

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import { LICH_SYSTEM, createPlanetMaterial, type PlanetSpec } from './planets';

// Planet metadata (real masses/periods/radii) for the diegetic HUD layer
// (Task 13) + any consumer. planets.ts stays the single source.
export const PLANETS = LICH_SYSTEM;

// Staggered start phases (rad) — mirrors the /dev/system harness so the three
// bodies don't line up at t=0. Pure constants.
const PHASES = LICH_SYSTEM.map((_, i) => i * 2.1 + 0.7);

// ---- live position singleton (leaf: written here, read by gravity + courier) --
// Initialized phase-correct so consumers see the true start pose before the
// first frame; written in place each frame → no per-frame allocation.
const POSITIONS: THREE.Vector3[] = LICH_SYSTEM.map((p, i) => {
  const az = PHASES[i];
  return new THREE.Vector3(p.orbitWu * Math.cos(az), 0, -p.orbitWu * Math.sin(az));
});

export function getPlanetPositions(): readonly THREE.Vector3[] {
  return POSITIONS;
}

function Planet({ spec, phase, idx }: { spec: PlanetSpec; phase: number; idx: number }) {
  const orbitRef = useRef<THREE.Group>(null);
  const bodyRef = useRef<THREE.Mesh>(null);
  const material = useMemo(() => createPlanetMaterial(spec), [spec]);
  useEffect(() => () => material.dispose(), [material]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30); // clamp per perf rule
    if (orbitRef.current) orbitRef.current.rotation.y += ((2 * Math.PI) / spec.periodS) * dt;
    if (bodyRef.current) bodyRef.current.rotation.y += ((2 * Math.PI) / spec.axialDayS) * dt;

    // Publish the live world position into the singleton so gravity + courier
    // read EXACTLY what the player sees. Orbit = the group's Y rotation (starts
    // at `phase`, grows by 2π/periodS·dt); world pos of the body at local
    // [orbitWu,0,0] under R_y(θ) is [r·cosθ, 0, -r·sinθ]. Analytic (not a
    // getWorldPosition readback) so singleton + mesh agree to the last digit
    // with no matrix-update lag.
    const theta = orbitRef.current?.rotation.y ?? phase;
    POSITIONS[idx]?.set(spec.orbitWu * Math.cos(theta), 0, -spec.orbitWu * Math.sin(theta));
  });

  return (
    <group ref={orbitRef} rotation={[0, phase, 0]}>
      <mesh ref={bodyRef} position={[spec.orbitWu, 0, 0]} material={material}>
        <sphereGeometry args={[spec.radiusWu, 96, 96]} />
      </mesh>
    </group>
  );
}

export function LichPlanets() {
  return (
    <>
      {LICH_SYSTEM.map((spec, i) => (
        <Planet key={spec.name} spec={spec} phase={PHASES[i]} idx={i} />
      ))}
    </>
  );
}
