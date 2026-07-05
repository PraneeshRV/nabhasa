// Shared craft state — LEAF module (no Rapier import).
// Extracted from flight/Craft.tsx so the mobile film (Task 14) can drive the
// SAME singleton the world reacts to (PulsarBeams transit, DysonSwarm assembly)
// WITHOUT pulling @react-three/rapier into the mobile chunk — the binding
// invariant "no Rapier/game load on mobile" (spec Task 14). Craft.tsx imports
// this; the three readers (PulsarBeams, DysonSwarm, cameraRig) import this leaf
// directly so none of them drag in the flight/Rapier module either.
//
// Refs, NOT React state — zero per-frame setState. Written by Craft each physics
// step (desktop) or by FlythroughFilm's spline each frame (mobile). Read by
// cameraRig, PulsarBeams, DysonSwarm, and (10 Hz) the HUD.
//
// ponytail: this is a type + one object + one accessor — too small to justify a
// heavier store, and it must stay a leaf (no upward import) for the chunk split.

import { Vector3 } from 'three';

export interface CraftState {
  pos: Vector3;
  vel: Vector3;
  forward: Vector3; // unit, local -Z in world space
  speed: number; // wu/s
  fuel: number; // 0..1; drain wired by Task 12 (missions)
  killFlash: number; // 0..1 envelope for the 600ms white-in (DOM overlay reads this)
}

// Matches Craft.tsx's RESPAWN_POS = [600, 80, 0] (inlined so the leaf has no
// upward import into Craft.tsx — that would re-couple the chunk split).
export const craftState: CraftState = {
  pos: new Vector3(600, 80, 0),
  vel: new Vector3(),
  forward: new Vector3(0, 0, -1),
  speed: 0,
  fuel: 1,
  killFlash: 0,
};

export function useCraftState(): CraftState {
  return craftState;
}
