// Courier beacon pillars — Nabhasa signature for the courier loop (spec Task 12).
//
// One thin emissive light pillar per active-mission endpoint (source `from` +
// destination `to`), so the player can see where they came from and where to go
// against the void. Counts are trivially small (≤2 endpoints) → no QUALITY entry,
// no tier branching. Desktop-only mount (App MainExperience) — never imported by
// the mobile FlythroughFilm, so this (and its courier-store import) stays out of
// the mobile chunk (Task 14 invariant).
//
// Visual: bright #AFE3FF core, MeshBasicMaterial with toneMapped=false so it
// writes raw linear color → reads as a glowing line at full intensity with NO
// dependence on a bloom pass (art-direction: beacons visible from afar, bloom
// nearly off). "emissive >1 core only" = the unlit full-intensity core; no shaft.
//
// Frame loop: read courier store via getState() (no React subscription → no
// re-render); place/show the two pillar groups through refs. R3F disposes the
// JSX-declared geometry + material on unmount — no manual dispose needed.

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Group } from 'three'; // type-only; non-shader class (PulsarBeams idiom)
import { useCourierStore, missionById } from '../game/courier';

const PILLAR_H = 800; // wu tall — vertical extent reads at distance
const CORE_R = 2; // wu — thin but not sub-pixel up close

function place(g: Group | null, p: readonly [number, number, number] | null) {
  if (!g) return;
  if (p) {
    g.position.set(p[0], p[1], p[2]);
    g.visible = true;
  } else {
    g.visible = false;
  }
}

export function Beacons() {
  const fromRef = useRef<Group>(null);
  const toRef = useRef<Group>(null);

  useFrame(() => {
    const c = useCourierStore.getState();
    const m = c.status === 'active' && c.missionId ? missionById(c.missionId) : null;
    place(fromRef.current, m ? m.from : null);
    place(toRef.current, m ? m.to : null);
  });

  return (
    <>
      <group ref={fromRef} visible={false}>
        <mesh>
          <cylinderGeometry args={[CORE_R, CORE_R, PILLAR_H, 6]} />
          <meshBasicMaterial color="#AFE3FF" toneMapped={false} depthWrite={false} />
        </mesh>
      </group>
      <group ref={toRef} visible={false}>
        <mesh>
          <cylinderGeometry args={[CORE_R, CORE_R, PILLAR_H, 6]} />
          <meshBasicMaterial color="#AFE3FF" toneMapped={false} depthWrite={false} />
        </mesh>
      </group>
    </>
  );
}
