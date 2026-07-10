// REACH_SYSTEM contract sanity (Amendment A2, P1.1). Pure DATA tests — import
// from src/world/planets.ts only, no three.js rendering. Locks the 8-world table
// the render (P1.2) / gravity (P1.3) / approach panels (P3) / courier (P4) all
// consume: canon orbital order, Kepler-ratioed periods, the five content slots,
// the clean Dyson-swarm gap, per-world biomes, and positive geometry.
import { describe, it, expect } from 'vitest';
import { REACH_SYSTEM, type Biome } from '../src/world/planets';

const NAMES = REACH_SYSTEM.map((w) => w.name);
const byName = (n: string) => REACH_SYSTEM[NAMES.indexOf(n)];

describe('REACH_SYSTEM — canon table', () => {
  it('has exactly 8 entries', () => {
    expect(REACH_SYSTEM).toHaveLength(8);
  });

  it('is in canon orbital order (burn → garden → library → forge → history → ruins → beauty → door)', () => {
    expect(NAMES).toEqual([
      'Brace',
      'Praesidium',
      'Aletheia',
      'Kiln',
      'Vesper',
      'Riven',
      'Corona',
      'Threshold',
    ]);
  });

  it('each world carries its contract biome', () => {
    const expected: Record<string, Biome> = {
      Brace: 'magma',
      Praesidium: 'ocean',
      Aletheia: 'glass',
      Kiln: 'industrial',
      Vesper: 'bioluminescent',
      Riven: 'shattered',
      Corona: 'gasGiant',
      Threshold: 'station',
    };
    for (const w of REACH_SYSTEM) {
      expect(w.biome).toBe(expected[w.name]);
    }
  });
});

describe('REACH_SYSTEM — Kepler periods', () => {
  // T ∝ a^1.5, base Brace (130 wu → 50 s). The inner four are near-exact Kepler;
  // the outer three (Vesper / Corona / Threshold) are gameplay-tuned and drift
  // 10–20% (the contract comment: "Kepler-ratioed in intent"). 30% relative
  // tolerance accommodates that tuning while still failing a gross error (a
  // swapped or unit-wrong period lands ~1.0 off, not ~0.2).
  const brace = REACH_SYSTEM[0];
  const baseA = brace.orbitWu;
  const baseT = brace.periodS;

  it('Brace is the Kepler base (130 wu → 50 s)', () => {
    expect(brace.orbitWu).toBe(130);
    expect(brace.periodS).toBe(50);
  });

  it('periodS ≈ 50·(orbitWu/130)^1.5 within 30% (inner exact, outer tuned)', () => {
    for (const w of REACH_SYSTEM) {
      const kepler = baseT * Math.pow(w.orbitWu / baseA, 1.5);
      const rel = Math.abs(w.periodS - kepler) / kepler;
      expect(rel).toBeLessThan(0.3);
    }
  });

  it('periodS and orbitWu are strictly monotonic increasing (no inversions)', () => {
    for (let i = 1; i < REACH_SYSTEM.length; i++) {
      expect(REACH_SYSTEM[i].orbitWu).toBeGreaterThan(REACH_SYSTEM[i - 1].orbitWu);
      expect(REACH_SYSTEM[i].periodS).toBeGreaterThan(REACH_SYSTEM[i - 1].periodS);
    }
  });
});

describe('REACH_SYSTEM — content slots (P3 docks here)', () => {
  it('content slots exist on exactly the five named worlds', () => {
    const slotted = REACH_SYSTEM.filter((w) => w.contentSlot).map((w) => w.name);
    expect(slotted).toEqual(['Praesidium', 'Aletheia', 'Kiln', 'Vesper', 'Threshold']);
  });

  it('each content world binds its contract slot', () => {
    expect(byName('Praesidium').contentSlot).toBe('About');
    expect(byName('Aletheia').contentSlot).toBe('Research');
    expect(byName('Kiln').contentSlot).toBe('Projects');
    expect(byName('Vesper').contentSlot).toBe('Experience');
    expect(byName('Threshold').contentSlot).toBe('Contact');
  });

  it('the three eye-candy / warning worlds carry no slot', () => {
    for (const n of ['Brace', 'Riven', 'Corona']) {
      expect(byName(n).contentSlot).toBeUndefined();
    }
  });
});

describe('REACH_SYSTEM — orbit geometry + swarm gap', () => {
  it('radii, orbits, periods, axial days are all positive', () => {
    for (const w of REACH_SYSTEM) {
      expect(w.radiusWu).toBeGreaterThan(0);
      expect(w.orbitWu).toBeGreaterThan(0);
      expect(w.periodS).toBeGreaterThan(0);
      expect(w.axialDayS).toBeGreaterThan(0);
    }
  });

  it('keeps a clean orbit gap around the untouched Dyson swarm (650–1150 wu)', () => {
    // Swarm centered (900,0,0) r≈250 → spans ~650–1150 wu; no world orbits there.
    for (const w of REACH_SYSTEM) {
      expect(w.orbitWu <= 650 || w.orbitWu >= 1150).toBe(true);
    }
  });

  it('all worlds sit inside PLAY_RADIUS (3000 wu)', () => {
    for (const w of REACH_SYSTEM) {
      expect(w.orbitWu).toBeLessThan(3000);
    }
  });

  it('every world has a tuned mass (gravity perturbation feed, P1.3)', () => {
    for (const w of REACH_SYSTEM) {
      expect(w.massEarthsTuned).toBeGreaterThan(0);
    }
  });
});

describe('REACH_SYSTEM — per-world props (render contract, P1.2)', () => {
  it('Threshold is a station, not a sphere (biome only signal; geometry is P1.2)', () => {
    expect(byName('Threshold').biome).toBe('station');
  });

  it('carries the lore props the render keys off', () => {
    expect(byName('Praesidium').props?.moons).toBe(1); // one small moon
    expect(byName('Kiln').props?.ring).toBeDefined(); // orbital habitat ring
    expect(byName('Kiln').props?.tether).toBe(true); // space-elevator
    expect(byName('Riven').props?.debris).toBeGreaterThan(0); // shattered belt
    expect(byName('Corona').props?.ring).toBeDefined(); // vast ring system
    expect(byName('Corona').props?.moons).toBe(3); // shepherd moons
    expect(byName('Threshold').props?.antennaFarm).toBe(true); // antenna farm
  });

  it('every palette is a [light, dark] pair of hex strings', () => {
    for (const w of REACH_SYSTEM) {
      expect(w.palette).toHaveLength(2);
      for (const hex of w.palette) expect(/^#[0-9a-f]{6}$/i.test(hex)).toBe(true);
    }
  });
});
