// Neutron star — spec Task 5. Sphere r=STAR_RADIUS at origin, blue-white TSL surface,
// spinning about +Y tilted 15° (magnetic/beam axis obliquity, Task 10). The star
// is the SOLE key light in the system (photographic discipline: one key, one
// rim, ambient floor — set per region). Spin is on the mesh transform, not in
// the shader, so beams + sonification can phase-lock to the same angle.

import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Mesh } from 'three';
import { createStarSurfaceMaterial } from '../shaders/starSurface';
import { SPIN_DISPLAY_SLOWDOWN, STAR_RADIUS } from './scale';

// Visual-layer spin: PSR B1257+12 really spins at P=6.219 ms (~161 Hz). The site
// shows it slowed 1:SPIN_DISPLAY_SLOWDOWN → one rev every P·slowdown s ≈ 12.4 s
// (keeps flash events <3Hz; photosafety). The real ~161 Hz tone is the
// sonification layer's job — visual + audio lock to starSpinAngle, the
// display-rate honesty label lives in the HUD.
const P_B1257_S = 0.006219;
export const STAR_SPIN_RAD_S = (2 * Math.PI) / (P_B1257_S * SPIN_DISPLAY_SLOWDOWN);

// Pure phase fn — deterministic in t. Beams (Task 10) and sonify (Task 9) call
// starSpinAngle(starClock.t) so every consumer phase-locks to the SAME clamped
// clock the mesh uses; using state.clock.elapsedTime (unclamped, Canvas-epoch)
// desyncs after the first lag spike → beams/audio drift off the visible mesh.
export function starSpinAngle(t: number): number {
  return STAR_SPIN_RAD_S * t;
}

// Shared monotonic clock: the clamped-dt accumulator the mesh actually spins on.
// Updated once/frame in NeutronStar's useFrame; consumers READ-ONLY. (finding 1)
export const starClock = { t: 0 };

const TILT_15 = (15 * Math.PI) / 180;

export function NeutronStar() {
  const meshRef = useRef<Mesh>(null);
  const [material] = useState(createStarSurfaceMaterial);
  useEffect(() => () => material.dispose(), [material]);

  // Local monotonic clock (clamped dt) so a lag spike can't fling the phase.
  const tRef = useRef(0);
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30);
    tRef.current += dt;
    starClock.t = tRef.current; // publish once/frame for beams/sonify (finding 1)
    if (meshRef.current) meshRef.current.rotation.y = starSpinAngle(tRef.current);
  });

  return (
    <group rotation={[0, 0, TILT_15]}>
      <mesh ref={meshRef} material={material}>
        <sphereGeometry args={[STAR_RADIUS, 64, 64]} />
      </mesh>
      {/* The star is the only key light. Blue-white (--star-hot family). */}
      <pointLight intensity={60000} distance={0} decay={2} color={'#cfe9ff'} />
    </group>
  );
}
