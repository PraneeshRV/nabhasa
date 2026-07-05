import { describe, it, expect } from 'vitest';
import {
  PULSAR,
  timeDilation,
  tidalAccel,
  orbitalV,
  surfaceGravity,
} from '../src/hud/physics-data';

// Spec Task 4 + Amendment A1 (PSR B1257+12 "Lich"). Gates are hand-checked SI
// values (M = 1.4 M☉, R = 10 km, P = 6.219 ms). These numbers ARE the site's
// content — Praneesh physics-reviews them. Tolerances mirror the spec's gate
// language (±1% / ±0.005 / ±2%) verbatim.

const pctOff = (got: number, want: number) =>
  (Math.abs(got - want) / Math.abs(want)) * 100;

describe('PULSAR (PSR B1257+12 "Lich")', () => {
  it('names Lich and carries the 6.219 ms period', () => {
    expect(PULSAR.name).toBe('PSR B1257+12');
    expect(PULSAR.periodS).toBe(0.006219);
    expect(PULSAR.radiusM).toBe(10_000);
    expect(PULSAR.massKg).toBeGreaterThan(2.7e30);
    expect(PULSAR.massKg).toBeLessThan(2.9e30);
  });

  it('Schwarzschild radius ≈ 4134 m (±1%)', () => {
    expect(pctOff(PULSAR.schwarzschildM, 4134)).toBeLessThan(1);
  });
});

describe('timeDilation', () => {
  it('at surface (10 km) ≈ 0.766 (±0.005)', () => {
    expect(Math.abs(timeDilation(10) - 0.766)).toBeLessThanOrEqual(0.005);
  });

  it('at 300 km ≈ 0.9931 (±0.005)', () => {
    expect(Math.abs(timeDilation(300) - 0.9931)).toBeLessThanOrEqual(0.005);
  });

  it('approaches 1 far from the star', () => {
    expect(timeDilation(100_000)).toBeGreaterThan(0.9999);
  });
});

describe('tidalAccel', () => {
  it('at 300 km across 2 m ≈ 2.75e4 m/s² (±2%)', () => {
    expect(pctOff(tidalAccel(300, 2), 2.75e4)).toBeLessThan(2);
  });

  it('scales ∝ 1/r³ (2× distance ⇒ 8× weaker)', () => {
    const near = tidalAccel(300, 2);
    const far = tidalAccel(600, 2);
    expect(far / near).toBeCloseTo(1 / 8, 2);
  });
});

describe('orbitalV', () => {
  it('scales ∝ 1/√r (2× distance ⇒ ÷√2 speed)', () => {
    const inner = orbitalV(300);
    const outer = orbitalV(600);
    expect(inner / outer).toBeCloseTo(Math.SQRT2, 2);
  });
});

describe('surfaceGravity', () => {
  it('≈ 1.86e12 m/s² (±2%)', () => {
    expect(pctOff(surfaceGravity(), 1.86e12)).toBeLessThan(2);
  });
});
