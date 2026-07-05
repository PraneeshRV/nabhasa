// Pure gravity tests (spec Task 6, Step 1). NO Rapier — a semi-implicit Euler
// integrator at 60Hz mirrors Rapier's step, so this harness is the orbital-feel
// oracle. Exact tolerance bands per spec.
import { describe, it, expect } from 'vitest';
import { Vector3 } from 'three';
import { gravityAccel } from '../src/flight/gravity';
import { GM_SIM, KILL_RADIUS, FIXED_DT } from '../src/world/scale';

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
    // |a| = GM / KILL² = 270000 / 625 = 432
    expect(a.length()).toBeCloseTo(GM_SIM / (KILL_RADIUS * KILL_RADIUS), 6);
    expect(a.length()).toBeCloseTo(432, 0);
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
