// Diegetic telemetry store (spec Task 13). 10Hz sink — the HUD reads this, never
// the per-frame refs. <HudSampler/> (below) lives inside <NabhasaCanvas>, reads
// craftState (flight/Craft), beamState (PulsarBeams), the region store, and
// computes REAL astrophysics from physics-data.ts. Sim constants never imported
// except SPIN_DISPLAY_SLOWDOWN (a display-rate label, not a physics value).
//
// 1 world unit = 1 km (physics-data mapping) ⇒ rKm == craftState.pos.length().
// HUD invariant: every number shown is real SI from physics-data.ts, never the
// tuned sim constants. The two sources stay separate (spec Task 4 invariant).

import { create } from 'zustand';
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { craftState } from '../flight/craftState';
import { beamState } from '../signatures/PulsarBeams';
import { useRegionStore, type RegionId } from '../world/regions';
import { timeDilation, tidalAccel, surfaceGravity } from './physics-data';
import { SPIN_DISPLAY_SLOWDOWN } from '../world/scale';

// Tidal Δa is the differential across the craft body — "how much harder the near
// end pulls than the far end" (diegetic; the HUD's reason to exist). 2 m ≈ a
// small-ship length. physics-data.test.ts uses span=2 for its fixture.
const TIDAL_SPAN_M = 2;

// 10Hz cadence (spec Global Constraints: throttled zustand sink @10Hz).
const HUD_DT = 1 / 10;

export const DISPLAY_RATE = SPIN_DISPLAY_SLOWDOWN; // HUD "display 1:N" label

// Live physics readout pushed each tick. Constants (surfaceG, dilationSurface)
// live in the store init, NOT here — zustand's shallow merge keeps them.
export interface TelemetryTick {
  rKm: number;
  speed: number; // km/s (== wu/s)
  dilation: number; // timeDilation(rKm): clock rate where the craft is
  tidalG: number; // tidalAccel(rKm, TIDAL_SPAN_M) m/s²
  fuel: number; // 0..1
  region: RegionId;
  beamTransit: number; // 0..1 beam↔craft alignment (RADIATION TRANSIT line)
  killFlash: number; // 0..1 white-in veil envelope (respawn)
}

export interface HudState extends TelemetryTick {
  dilationSurface: number; // timeDilation(10 km): clock rate at the surface (const)
  surfaceG: number; // surfaceGravity() m/s² (const)
  mission: string | null; // active mission label (Task 12 courier pushes via setMission)
  pushTelemetry: (t: TelemetryTick) => void;
  setMission: (label: string | null) => void;
}

export const useHudStore = create<HudState>((set) => ({
  rKm: 0,
  speed: 0,
  dilation: 1,
  tidalG: 0,
  fuel: 1,
  region: 'arrival',
  beamTransit: 0,
  killFlash: 0,
  dilationSurface: timeDilation(10), // ≈0.766 — computed once (const for the session)
  surfaceG: surfaceGravity(), // ≈1.86e12 m/s² — computed once
  mission: null,
  pushTelemetry: (t) => set(t), // shallow merge ⇒ mission + consts preserved
  setMission: (mission) => set({ mission }),
}));

// 10Hz sampler. useFrame is the existing per-frame loop; we accumulate dt and
// setState only at 10Hz — never per-frame React state (spec perf rule). Rendered
// inside <NabhasaCanvas> (App.tsx) like <PerfLogger/>.
export function HudSampler() {
  const acc = useRef(0);
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30); // clamp per Global Constraints
    acc.current += dt;
    if (acc.current < HUD_DT) return;
    acc.current -= HUD_DT;
    const rKm = craftState.pos.length();
    useHudStore.getState().pushTelemetry({
      rKm,
      speed: craftState.speed,
      dilation: timeDilation(rKm),
      tidalG: tidalAccel(rKm, TIDAL_SPAN_M),
      fuel: craftState.fuel,
      region: useRegionStore.getState().region,
      beamTransit: beamState.transit,
      killFlash: craftState.killFlash,
    });
  });
  return null;
}
