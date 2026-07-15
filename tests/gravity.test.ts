// Pure gravity tests (spec Task 6, Step 1). NO Rapier — a semi-implicit Euler
// integrator at 60Hz mirrors Rapier's step, so this harness is the orbital-feel
// oracle. Exact tolerance bands per spec.
import { describe, it, expect } from 'vitest';
import { Vector3 } from 'three';
import { gravityAccel, gravityAccelWithPlanets, PLANET_GMS, PLANET_RADII_WU, PLANET_MASS_EARTHS } from '../src/flight/gravity';
import { GM_SIM, KILL_RADIUS, FIXED_DT } from '../src/world/scale';
import { REACH_SYSTEM } from '../src/world/planets';

describe('gravityAccel', () => {
  it('|a| = GM/r² at r=300 → 3.0 wu/s² (±1e-6), points at origin', () => {
    const a = gravityAccel(new Vector3(300, 0, 0), new Vector3());
    expect(a.length()).toBeCloseTo(GM_SIM / (300 * 300), 6); // 3.0 exactly
    expect(a.length()).toBeCloseTo(3.0, 6);
    expect(a.x).toBeLessThan(0); // pulls toward origin (-x from +x)
    expect(a.y).toBeCloseTo(0, 12);
    expect(a.z).toBeCloseTo(0, 12);
  });

  it('clamps the singularity at r=1 → magnitude uses KILL_RADIUS²', () => {
    const a = gravityAccel(new Vector3(1, 0, 0), new Vector3());
    // |a| = GM / KILL² = 270000 / 2025 ≈ 133.3
    expect(a.length()).toBeCloseTo(GM_SIM / (KILL_RADIUS * KILL_RADIUS), 6);
    expect(a.length()).toBeCloseTo(133.3, 0);
  });

  it('returns zero at the exact origin (guard, not a gameplay path)', () => {
    const a = gravityAccel(new Vector3(0, 0, 0), new Vector3());
    expect(a.lengthSq()).toBe(0);
  });

  it('does not mutate the input position', () => {
    const pos = new Vector3(300, 0, 0);
    gravityAccel(pos, new Vector3());
    expect(pos.x).toBe(300);
  });
});

describe('orbit stability (semi-implicit Euler @ FIXED_DT, mirrors Rapier step)', () => {
  // Circular orbit: v_circ = sqrt(GM/r) = sqrt(270000/300) = 30 wu/s.
  it('r=300, v=(0,0,30) stays in [285,315] / speed in [27,33] over 60s', () => {
    const dt = FIXED_DT;
    const pos = new Vector3(300, 0, 0);
    const vel = new Vector3(0, 0, 30);
    const acc = new Vector3();
    const steps = 3600; // 60s @ 60Hz

    for (let i = 0; i < steps; i++) {
      gravityAccel(pos, acc);
      vel.addScaledVector(acc, dt); // v_{n+1} = v_n + a·dt
      pos.addScaledVector(vel, dt); // x_{n+1} = x_n + v_{n+1}·dt  (semi-implicit)
    }

    const r = pos.length();
    const speed = vel.length();
    expect(r).toBeGreaterThan(285);
    expect(r).toBeLessThan(315);
    expect(speed).toBeGreaterThan(27);
    expect(speed).toBeLessThan(33);
  });

  it('is not energy-injecting: a slower start spirals in, not out', () => {
    // v well below circular → inward spiral. Sanity that gravity is attractive.
    const dt = FIXED_DT;
    const pos = new Vector3(300, 0, 0);
    const vel = new Vector3(0, 0, 10); // 10 < 30 circular → falls inward
    const acc = new Vector3();
    for (let i = 0; i < 3600; i++) {
      gravityAccel(pos, acc);
      vel.addScaledVector(acc, dt);
      pos.addScaledVector(vel, dt);
    }
    expect(pos.length()).toBeLessThan(300);
  });
});

describe('gravityAccelWithPlanets (Amendment A1)', () => {
  it('with empty planet arrays is bit-identical to star-only gravityAccel', () => {
    // The star path is reused verbatim then the planet loop runs zero times, so
    // zero planets ⇒ no change. Locks the spec invariant "star-only path stays
    // exact" (orbit-test tolerance 1e-6) against future edits.
    const pos = new Vector3(300, 12, -7);
    const starOnly = gravityAccel(pos.clone(), new Vector3());
    const withEmpty = gravityAccelWithPlanets(pos.clone(), new Vector3(), [], [], []);
    expect(withEmpty.distanceTo(starOnly)).toBeCloseTo(0, 12);
  });

  it('adds a planet pull toward the planet (clamped inverse-square)', () => {
    // Craft at origin (star guard ⇒ 0), planet at +x: net accel points +x and
    // |a| = GM/r² = 200000 / 1000² = 0.2 wu/s². Toward the body, not the star.
    const a = gravityAccelWithPlanets(
      new Vector3(0, 0, 0),
      new Vector3(),
      [new Vector3(1000, 0, 0)],
      [200000],
      [10],
    );
    expect(a.x).toBeCloseTo(0.2, 6);
    expect(a.y).toBeCloseTo(0, 12);
    expect(a.z).toBeCloseTo(0, 12);
  });
});

describe('gravityAccelWithPlanets — stability + perturbation magnitude (A1 path the Craft step runs)', () => {
  // Spec Task 6's stability gate exercises star-only gravityAccel, but the shipped
  // Craft step calls gravityAccelWithPlanets — a different function with no test.
  // These cover that path: planets perturb, never dominate (real-ratio physics),
  // and an orbit under planet perturbation stays bounded. Constants are the SAME
  // exports the Craft step passes (PLANET_GMS / PLANET_RADII_WU).
  it('planet pull stays ≪ star pull across the mission shells (150/260/340 wu)', () => {
    const shells = [150, 260, 340]; // Draugr / Poltergeist / Phobetor orbit shells
    const craft = new Vector3();
    const starOnly = new Vector3();
    const withPlanets = new Vector3();
    for (let i = 0; i < shells.length; i++) {
      const r = shells[i];
      craft.set(r, 0, 0); // craft on the shell at distance r from the star
      // Planet placed so the craft just clears its soft radius — the clamped worst
      // case (max planet pull). It pulls +x (away from the star) → the planet-only
      // contribution is the x-delta vs star-only.
      const planetPos = new Vector3(r + PLANET_RADII_WU[i], 0, 0);
      gravityAccel(craft.clone(), starOnly);
      gravityAccelWithPlanets(craft.clone(), withPlanets, [planetPos], [PLANET_GMS[i]], [PLANET_RADII_WU[i]]);
      const planetMag = Math.abs(withPlanets.x - starOnly.x);
      const starMag = starOnly.length(); // GM_SIM / r²
      // Worst case Phobetor @ r=340 ≈ 3.9% — well under 5% (planets never dominate).
      expect(planetMag).toBeLessThan(starMag * 0.05);
    }
  });

  it('r=260 circular orbit under planet perturbation stays bounded over 60s', () => {
    // m3 "Close Pass" region (Poltergeist shell). Planets parked on their shells
    // along +Y (off the xz orbital plane → the craft never sits on one), so their
    // tiny pull perturbs but can't collide/soft-clamp. Band mirrors the star-only
    // r=300 test ([285,315] / [27,33]) loosened for the perturbation + smaller r.
    const dt = FIXED_DT;
    const pos = new Vector3(260, 0, 0);
    const vel = new Vector3(0, 0, Math.sqrt(GM_SIM / 260)); // v_circ ≈ 32.25 wu/s
    const acc = new Vector3();
    const positions = [
      new Vector3(0, 150, 0),
      new Vector3(0, 260, 0),
      new Vector3(0, 340, 0),
    ];
    for (let i = 0; i < 3600; i++) { // 60s @ 60Hz
      gravityAccelWithPlanets(pos, acc, positions, PLANET_GMS, PLANET_RADII_WU);
      vel.addScaledVector(acc, dt);
      pos.addScaledVector(vel, dt);
    }
    const r = pos.length();
    const speed = vel.length();
    expect(r).toBeGreaterThan(245);
    expect(r).toBeLessThan(275);
    expect(speed).toBeGreaterThan(28);
    expect(speed).toBeLessThan(36);
  });
});

describe('gravityAccelWithPlanets (Amendment A2 — 8-body Reach system)', () => {
  // Eight worlds parked at their contract orbit radii along +x. We isolate each
  // world's perturbation term by running gravityAccelWithPlanets with a
  // one-element array (star + that world) and subtracting the star-only accel —
  // |term_i| reduces to GM_i / max(dist_i², softRadius_i²). Near Kiln its term
  // dominates; Corona (95 M⊕ but at 2050 wu) is negligible vs the nearest world.
  const orbits = [130, 260, 400, 560, 1250, 1600, 2050, 2700]; // contract table
  const KILN = 3; // orbit 560, mass 1.2
  const CORONA = 6; // orbit 2050, mass 95
  const positions = orbits.map((r) => new Vector3(r, 0, 0));

  const termOf = (craft: Vector3, k: number): number => {
    const starOnly = new Vector3();
    gravityAccel(craft.clone(), starOnly);
    const withWorld = new Vector3();
    gravityAccelWithPlanets(
      craft.clone(),
      withWorld,
      [positions[k]],
      [PLANET_GMS[k]],
      [PLANET_RADII_WU[k]],
    );
    return withWorld.sub(starOnly).length();
  };

  it('near Kiln (560), Kiln dominates every other world perturbation term', () => {
    // Craft just outside Kiln's surface on the starward side (dist 18.4 > soft 17.4).
    const craft = new Vector3(orbits[KILN] - PLANET_RADII_WU[KILN] - 1, 0, 0);
    const kilnTerm = termOf(craft, KILN);
    for (let k = 0; k < orbits.length; k++) {
      if (k === KILN) continue;
      expect(termOf(craft, k)).toBeLessThan(kilnTerm);
    }
  });

  it("Corona (95 M⊕ at 2050) ≪ nearest world's term — mass scales GM, 1/r² kills it", () => {
    const craft = new Vector3(orbits[KILN] - PLANET_RADII_WU[KILN] - 1, 0, 0);
    const kilnTerm = termOf(craft, KILN);
    const coronaTerm = termOf(craft, CORONA);
    // Expected ratio ≈ (95/1.2)·(18.4/1508)² ≈ 1.2% — the ×3 body scale moved the
    // "just outside the surface" probe from 6.8 → 18.4 wu, shrinking Kiln's own
    // term ×7.3 while Corona's barely moved. Still ≪ dominant; pin at <2%.
    expect(coronaTerm).toBeLessThan(kilnTerm * 0.02); // <2% of nearest-world term
  });
});

describe('gravity.ts ↔ planets.ts cross-copy consistency (8-body Reach arrays mirror REACH_SYSTEM)', () => {
  // gravity.ts DELIBERATELY duplicates mass/radius (a three-free pure module —
  // planets.ts pulls three/tsl, kept out of the gravity chunk per its own
  // comment). This block pins the duplicate against the single contract so a
  // one-sided edit (a mass tuned in planets.ts but not gravity.ts, or vice-versa)
  // fails loudly. planets.ts loads under vitest (planets.test.ts imports it), so
  // the cross-module reference is safe here; only the test references the
  // contract — the gravity SOURCE stays three-free.
  it('PLANET_MASS_EARTHS mirrors REACH_SYSTEM massEarthsTuned (all 8, exact) + pins the full array', () => {
    expect(PLANET_MASS_EARTHS).toHaveLength(8);
    expect(Array.from(PLANET_MASS_EARTHS)).toEqual(REACH_SYSTEM.map((w) => w.massEarthsTuned));
    expect(Array.from(PLANET_MASS_EARTHS)).toEqual([0.4, 1.0, 0.8, 1.2, 1.1, 0.6, 95, 0.1]);
  });

  it('PLANET_RADII_WU mirrors REACH_SYSTEM radiusWu for the 7 spheres; Threshold soft-radius diverges by design', () => {
    expect(PLANET_RADII_WU).toHaveLength(8);
    for (let i = 0; i < 7; i++) {
      expect(PLANET_RADII_WU[i]).toBe(REACH_SYSTEM[i].radiusWu);
    }
    // Threshold (#8) is a station, not a sphere. Its gravity soft radius (18.0)
    // is INTENTIONALLY larger than its spec radiusWu (9.0 structure half-extent
    // proxy): the bigger soft radius keeps the kinematic station collider
    // clamped clear of the craft (A1 close-out pattern; gravity.ts comment lines
    // 46-48). This is the intended relation, NOT a copy-drift mismatch.
    expect(REACH_SYSTEM[7].radiusWu).toBe(9.0);
    expect(PLANET_RADII_WU[7]).toBe(18.0);
  });

  it('PLANET_GMS has one GM per Reach world (len 8)', () => {
    expect(PLANET_GMS).toHaveLength(8);
  });
});
