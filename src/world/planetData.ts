// Planet DATA layer (W6a chunk split) — three-free ON PURPOSE. The static
// (reduced-motion) route renders the real-astrophysics table from LICH_SYSTEM;
// importing it must never pull three/tsl into the entry chunk. Materials and
// everything three-flavored stay in planets.ts, which re-exports this module
// so live-scene importers keep their single source.

// ── Reach world contract (P1.1 — single source for P1.2/P1.3/P3/P4) ──────────

export type Biome =
  | 'magma'
  | 'ocean'
  | 'glass'
  | 'industrial'
  | 'bioluminescent'
  | 'shattered'
  | 'gasGiant'
  | 'station';

export type ContentSlot = 'About' | 'Research' | 'Projects' | 'Experience' | 'Contact';

export interface WorldProps {
  moons?: number; // small shepherd / habitat moons
  ring?: { inner: number; outer: number; tilt: number }; // wu band + tilt (rad)
  debris?: number; // instanced fragment base count (Riven; render scales by QUALITY)
  tether?: boolean; // space-elevator line (Kiln)
  antennaFarm?: boolean; // (Threshold structure)
}

export interface PlanetSpec {
  name: string;
  // Reach lore metadata — present on the 8 fictional worlds; OPTIONAL so the
  // real Lich bodies (LICH_SYSTEM) still satisfy PlanetSpec for the live-scene
  // importers. createPlanetMaterial treats a missing biome as the default
  // rocky path (the original Lich look).
  title?: string; // lore epithet, e.g. 'the garden'
  biome?: Biome;
  myth?: string; // lore.md myth line (HUD / panel flavor)
  massEarthsTuned?: number; // FICTIONAL gameplay-tuned; feeds gravity perturbation (P1.3)
  props?: WorldProps; // rings / moons / debris / tether / station
  contentSlot?: ContentSlot; // P3 docks a portfolio panel here
  // display (scene) — shared with the real Lich bodies
  radiusWu: number;
  orbitWu: number;
  periodS: number; // contract table (Kepler-ratioed in intent)
  axialDayS: number;
  palette: [string, string]; // light, dark — biome albedo (art-direction v2, ≤1)
  crater: number; // worley strength 0..1 (rocky biomes)
  displaceAmp: number; // silhouette bump (fraction of radius)
}

// Real Lich bodies carry real astrophysics for the diegetic HUD + the static
// fallback table. Subtype of PlanetSpec: adds the real-* columns. The shown
// worlds are now fictional (REACH_SYSTEM); these three stay only as the
// "first exoplanets" instrumentation reference.
export interface LichBodySpec extends PlanetSpec {
  realMassEarths: number;
  realSemiMajorAU: number;
  realPeriodDays: number;
}


// ── Real PSR B1257+12 "Lich" bodies — RETAINED for the static fallback ──────
// Real bodies, undead names: Draugr, Poltergeist, Phobetor (Wolszczan & Frail
// 1992; IAU names 2015). Real values ride along for the diegetic HUD + the
// StaticExperience table. [VERIFY against NASA Exoplanet Archive at physics
// review — masses/periods from training knowledge.]
export const LICH_SYSTEM: LichBodySpec[] = [
  {
    name: 'Draugr',
    realMassEarths: 0.02, // smallest known exoplanet
    realSemiMajorAU: 0.19,
    realPeriodDays: 25.26,
    radiusWu: 2.2,
    orbitWu: 150,
    periodS: 60,
    axialDayS: 41,
    palette: ['#74747c', '#33333b'],
    crater: 0.85,
    displaceAmp: 0.035,
  },
  {
    name: 'Poltergeist',
    realMassEarths: 4.3,
    realSemiMajorAU: 0.36,
    realPeriodDays: 66.54,
    radiusWu: 5.4,
    orbitWu: 260,
    periodS: 158, // 60 × (66.54/25.26)
    axialDayS: 67,
    palette: ['#8a5a44', '#41281f'],
    crater: 0.45,
    displaceAmp: 0.02,
  },
  {
    name: 'Phobetor',
    realMassEarths: 3.9,
    realSemiMajorAU: 0.46,
    realPeriodDays: 98.21,
    radiusWu: 5.0,
    orbitWu: 340,
    periodS: 233, // 60 × (98.21/25.26)
    axialDayS: 89,
    palette: ['#7c88a2', '#2e3547'],
    crater: 0.3,
    displaceAmp: 0.025,
  },
];
