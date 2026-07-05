// REAL astrophysics for the diegetic HUD (spec Task 4 + Amendment A1). Every
// value here is genuine SI for PSR B1257+12 "Lich" and is the site's actual
// content — the HUD displays these, never the tuned sim constants from
// world/scale.ts. Spec invariant: this module imports nothing from scale.ts.
//
// Star: PSR B1257+12, M = 1.4 M☉, R = 10 km, P = 6.219 ms (≈160.8 Hz).
// Display mapping: 1 world unit = 1 km, so rKm == r_wu everywhere downstream.

const G = 6.674e-11; // m³ kg⁻¹ s⁻² — gravitational constant
const M_SUN = 1.989e30; // kg
const C = 2.998e8; // m/s — speed of light

const M_KG = 1.4 * M_SUN; // neutron-star mass ≈ 2.785e30 kg
const R_M = 10_000; // 10 km surface radius in metres
const GM = G * M_KG; // ≈ 1.858e20 m³/s²
const R_SCHWARZSCHILD_M = (2 * GM) / (C * C); // ≈ 4134 m

export const PULSAR = {
  name: 'PSR B1257+12',
  periodS: 0.006219, // 6.219 ms spin period → ~160.8 Hz (sonification's real tone)
  massKg: M_KG,
  radiusM: R_M,
  schwarzschildM: R_SCHWARZSCHILD_M,
};

// Gravitational time dilation factor at distance rKm: sqrt(1 − r_s/r), with r_s
// and r in the same unit (r in metres = rKm·1000). Valid for rKm ≥ star surface
// (10 km > r_s ≈ 4.13 km), so the radicand is always positive in practice.
export function timeDilation(rKm: number): number {
  return Math.sqrt(1 - R_SCHWARZSCHILD_M / (rKm * 1000));
}

// Tidal acceleration differential across spanM at distance rKm:
// Δa = 2·GM·span/r³ (first-order Newtonian), r in metres.
export function tidalAccel(rKm: number, spanM: number): number {
  const rM = rKm * 1000;
  return (2 * GM * spanM) / (rM * rM * rM);
}

// Newtonian circular-orbit speed at distance rKm, m/s.
export function orbitalV(rKm: number): number {
  const rM = rKm * 1000;
  return Math.sqrt(GM / rM);
}

// Surface gravity GM/R², m/s².
export function surfaceGravity(): number {
  return GM / (R_M * R_M);
}
