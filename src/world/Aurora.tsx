// Praesidium polar aurora mount (spec P5a). Renders the aurora.ts curtain shell
// and tracks Praesidium's live orbit position via the module-singleton from
// LichPlanets (same leaf-read idiom as gravity/courier). QUALITY-gated: off on
// `static`; ring count from QUALITY[tier].auroraBands (3 high / 1 elsewhere).
//
// Unmounted until P5b wires <Aurora tier={tier}/> into the scene. The component
// is contract-correct against P1.2's 8-body getPlanetPositions (Praesidium =
// index 1) today; it compiles against the current 3-body singleton but is dead
// code until mounted after P1.2 lands.

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import { auroraUniforms, createAuroraMaterial } from '../shaders/aurora';
import { getPlanetPositions } from './LichPlanets';
import { QUALITY } from '../core/quality';
import type { Tier } from '../core/tiers';

// Contract canon (docs/a2-fantasy-plan.md REACH_SYSTEM order: Brace=0, Praesidium=1, …).
const PRAESIDIUM_INDEX = 1;
const PRAESIDIUM_RADIUS = 15.0; // wu, contract (mirrors planets.ts REACH_SYSTEM[1].radiusWu)
const AURORA_SHELL_R = PRAESIDIUM_RADIUS * 1.1; // high-atmosphere curtain, just above the surface

export function Aurora({ tier }: { tier: Tier }) {
  const bands = QUALITY[tier].auroraBands; // static → 0
  const material = useMemo(() => createAuroraMaterial(), []);
  const groupRef = useRef<THREE.Group>(null);

  useEffect(() => () => material.dispose(), [material]);

  // Extra rings only on high tier; a uniform write, not a graph rebuild (lensing idiom).
  useEffect(() => {
    auroraUniforms.extraBands.value = bands >= 3 ? 1 : 0;
  }, [bands]);

  // Track Praesidium's orbit (singleton written in place once/frame by LichPlanets).
  useFrame(() => {
    if (tier === 'static') return;
    const pos = getPlanetPositions()[PRAESIDIUM_INDEX];
    if (groupRef.current && pos) groupRef.current.position.copy(pos);
  });

  if (tier === 'static') return null;

  return (
    <group ref={groupRef}>
      <mesh material={material} frustumCulled={false}>
        <sphereGeometry args={[AURORA_SHELL_R, 48, 48]} />
      </mesh>
    </group>
  );
}
