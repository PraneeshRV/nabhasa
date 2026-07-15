// REACH_SYSTEM contract sanity (Amendment A2, P1.1). Pure DATA tests — import
// from src/world/planets.ts only, no three.js rendering. Locks the 8-world table
// the render (P1.2) / gravity (P1.3) / approach panels (P3) / courier (P4) all
// consume: canon orbital order, Kepler-ratioed periods, the five content slots,
// the clean Dyson-swarm gap, per-world biomes, and positive geometry.
import { describe, it, expect } from 'vitest';
import { REACH_SYSTEM, type Biome } from '../src/world/planets';
import portfolio from '../src/content/portfolio.json';

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
  // T ∝ a^1.5, base Brace (130 wu → 50 s). The inner four (Brace / Praesidium /
  // Aletheia / Kiln) are near-exact Kepler (≤0.4% drift) — pinned to a 5% band.
  // The outer worlds are gameplay-tuned ("Kepler-ratioed in intent"): Vesper /
  // Riven / Corona / Threshold drift up to ~20% (Threshold is the loosest), so
  // they keep the 30% band that still fails a gross error (a swapped or
  // unit-wrong period lands ~1.0 off, not ~0.2).
  const brace = REACH_SYSTEM[0];
  const baseA = brace.orbitWu;
  const baseT = brace.periodS;

  it('Brace is the Kepler base (130 wu → 50 s)', () => {
    expect(brace.orbitWu).toBe(130);
    expect(brace.periodS).toBe(50);
  });

  it('periodS ≈ 50·(orbitWu/130)^1.5: inner four within 5%, outer four within 30%', () => {
    // Tightened from the old 30% blanket: the inner four (indices 0–3) are
    // near-exact Kepler and now carry a 5% band; the outer four keep 30% for
    // the intended gameplay tuning. Both bands are ≤ the prior 0.3 everywhere,
    // so this strictly tightens — never weakens.
    REACH_SYSTEM.forEach((w, i) => {
      const kepler = baseT * Math.pow(w.orbitWu / baseA, 1.5);
      const rel = Math.abs(w.periodS - kepler) / kepler;
      const tol = i < 4 ? 0.05 : 0.3;
      expect(rel).toBeLessThan(tol);
    });
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

describe('REACH_SYSTEM — exact contract pins (orbit / mass / radius)', () => {
  // Pins the contract table columns verbatim (docs/a2-fantasy-plan.md). A future
  // tuning edit to any orbit/mass/radius now fails a focused test instead of
  // silently drifting the gravity + courier duplicates that mirror these.
  it('orbitWu pins to the contract orbit shells', () => {
    expect(REACH_SYSTEM.map((w) => w.orbitWu)).toEqual([130, 260, 400, 560, 1250, 1600, 2050, 2700]);
  });

  it('massEarthsTuned pins to the tuned gameplay masses', () => {
    expect(REACH_SYSTEM.map((w) => w.massEarthsTuned)).toEqual([0.4, 1.0, 0.8, 1.2, 1.1, 0.6, 95, 0.1]);
  });

  it('radiusWu pins to the contract radii (Threshold = structure half-extent proxy)', () => {
    // The contract table marks Threshold (#8) radius as "(structure)" — it is a
    // station, not a sphere. 18.0 here is the structure half-extent proxy the
    // dedicated P1.2 render path consumes; the seven spheres pin their table radii
    // (×6 total scale rebalance 2026-07-15, two re-fly rounds — worlds read as worlds).
    expect(REACH_SYSTEM.map((w) => w.radiusWu)).toEqual([18.0, 30.0, 27.6, 34.8, 37.2, 32.4, 54.0, 18.0]);
  });
});

describe('portfolio.json — binds to the REACH_SYSTEM content worlds (P3)', () => {
  // The portfolio is a content layer keyed by slot; each slot must bind to the
  // single REACH_SYSTEM world whose contentSlot === that slot, echo the slot
  // key, and carry a non-empty myth. Locks the approach-trigger → panel wiring.
  const SLOTS = ['About', 'Research', 'Projects', 'Experience', 'Contact'] as const;
  const worldBySlot = (slot: string): string | undefined =>
    REACH_SYSTEM.find((w) => w.contentSlot === slot)?.name;

  it('exactly five slots, each backed by exactly one content world', () => {
    expect(Object.keys(portfolio).sort()).toEqual([...SLOTS].sort());
    for (const slot of SLOTS) {
      expect(worldBySlot(slot)).toBeDefined();
    }
  });

  it('each section binds its slot + matching REACH_SYSTEM world + non-empty myth', () => {
    for (const slot of SLOTS) {
      const section = (portfolio as Record<string, { slot: string; world: string; myth: string }>)[slot];
      expect(section, `portfolio section ${slot}`).toBeDefined();
      expect(section.slot).toBe(slot);
      expect(section.world).toBe(worldBySlot(slot));
      expect(section.myth.length).toBeGreaterThan(0);
    }
  });
});
