// Region graph + proximity streaming (spec Task 5). Pure spatial classification
// + per-region post/audio profile. Region boundaries:
//   nearStar = r < 150 wu from origin
//   swarm    = within SWARM_RADIUS of SWARM_CENTER
//   arrival  = everywhere else (the default spawn region)
// These two are disjoint (swarm center sits at r≈900), but nearStar is checked
// first so the star always wins its own neighborhood.

import { create } from 'zustand';
import type { Vector3 } from 'three';
import { SWARM_CENTER, SWARM_RADIUS } from './scale';

export type RegionId = 'arrival' | 'nearStar' | 'swarm';

// Spec Task 5 interface. Not a sim constant (KILL/PLAY live in scale.ts) — this
// is the streaming/feel boundary, local to the region graph.
const NEAR_STAR_RADIUS = 150;

export const REGION_PROFILES: Record<RegionId, { exposure: number; ambientLevel: number }> = {
  // Art direction per-region lighting keys: one key + one rim + ambient floor.
  arrival: { exposure: 1.0, ambientLevel: 0.015 }, // craft silhouette barely lifts off void
  nearStar: { exposure: 0.5, ambientLevel: 0.008 }, // ~1 stop down vs arrival; shadows near-black
  swarm: { exposure: 0.8, ambientLevel: 0.02 }, // cooler, geometry reads by rim not glow
};

export function regionAt(pos: Vector3): RegionId {
  const r = Math.hypot(pos.x, pos.y, pos.z);
  if (r < NEAR_STAR_RADIUS) return 'nearStar';
  const dx = pos.x - SWARM_CENTER[0];
  const dy = pos.y - SWARM_CENTER[1];
  const dz = pos.z - SWARM_CENTER[2];
  if (Math.hypot(dx, dy, dz) <= SWARM_RADIUS) return 'swarm';
  return 'arrival';
}

// Craft (Task 6) calls regionAt each fixed step and pushes the result here at
// 10Hz; post + audio + HUD select from it. Arrival is the safe default pre-spawn.
interface RegionState {
  region: RegionId;
  setRegion: (r: RegionId) => void;
}
export const useRegionStore = create<RegionState>((set) => ({
  region: 'arrival',
  setRegion: (region) => set({ region }),
}));

export const useRegion = (): RegionId => useRegionStore((s) => s.region);
