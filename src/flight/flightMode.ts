// Flight mode toggle (re-fly gate feedback 2026-07-15: "real physics is
// screwing the UX"). Two modes:
//
// - 'explorer' (DEFAULT): UX-first assist. No gravity pull on the craft and an
//   always-on velocity damping — the craft goes where you point it, caps at a
//   predictable terminal speed, and coasts to a stop when you let go. Portfolio
//   visitors get this; nobody bounces off orbital mechanics.
// - 'pilot': the original Task-6 sim — clamped inverse-square star + planet
//   gravity, momentum, brake-only damping. The enthusiast mode.
//
// Pure zustand leaf (no three/Rapier/fiber): Craft's physics step reads it via
// getState() (regionStore idiom); Telemetry subscribes as a hook; input.ts
// fires toggle() on the V rising edge. World scale, courier FSM, kill radius,
// colliders, and fuel drain are identical in both modes — only the force model
// on the craft changes.
import { create } from 'zustand';

export type FlightMode = 'explorer' | 'pilot';

interface FlightModeState {
  mode: FlightMode;
  toggle: () => void;
  set: (m: FlightMode) => void;
}

export const useFlightModeStore = create<FlightModeState>((set) => ({
  mode: 'explorer',
  toggle: () => set((s) => ({ mode: s.mode === 'explorer' ? 'pilot' : 'explorer' })),
  set: (m) => set({ mode: m }),
}));
