import { describe, it, expect } from 'vitest';
import {
  assemblyParam,
  hash01,
  slotDir,
  slotPos,
  scatterPos,
  stagger,
  shellOf,
  baseOf,
  flareIntervalS,
  SHELL_RADIUS,
} from '../src/signatures/dysonMath';
import { SWARM_CENTER, SWARM_RADIUS } from '../src/world/scale';

describe('assemblyParam proximity smoothstep', () => {
  it('is 0 at/ beyond 2×SWARM_RADIUS and 1 at/ within 0.3×', () => {
    expect(assemblyParam(2 * SWARM_RADIUS)).toBe(0);
    expect(assemblyParam(2 * SWARM_RADIUS + 1000)).toBe(0);
    expect(assemblyParam(0.3 * SWARM_RADIUS)).toBe(1);
    expect(assemblyParam(0)).toBe(1);
  });
  it('is monotonic non-decreasing as the craft approaches', () => {
    let prev = -1;
    for (let d = 600; d >= 0; d -= 25) {
      const a = assemblyParam(d);
      expect(a).toBeGreaterThanOrEqual(prev);
      prev = a;
    }
  });
  it('hits 0.5 at the midpoint', () => {
    const mid = (2 * SWARM_RADIUS + 0.3 * SWARM_RADIUS) / 2;
    expect(assemblyParam(mid)).toBeCloseTo(0.5, 6);
  });
});

describe('slot distribution (partial-node cap)', () => {
  it('produces unit directions inside the cone', () => {
    for (let b = 0; b < 500; b++) {
      const d = slotDir(b);
      const len = Math.hypot(d[0], d[1], d[2]);
      expect(len).toBeCloseTo(1, 4);
      // cap centered on +X, half-angle 70° → x ≥ cos(70°)
      expect(d[0]).toBeGreaterThanOrEqual(Math.cos((70 * Math.PI) / 180) - 1e-9);
    }
  });
  it('round-robins tiles across the 3 shells', () => {
    expect(shellOf(0)).toBe(0);
    expect(shellOf(1)).toBe(1);
    expect(shellOf(2)).toBe(2);
    expect(shellOf(3)).toBe(0);
    expect(baseOf(7)).toBe(2);
  });
  it('places slots at the shell radius from SWARM_CENTER', () => {
    for (let i = 0; i < 30; i++) {
      const p = slotPos(i);
      const dx = p[0] - SWARM_CENTER[0];
      const dy = p[1] - SWARM_CENTER[1];
      const dz = p[2] - SWARM_CENTER[2];
      expect(Math.hypot(dx, dy, dz)).toBeCloseTo(SHELL_RADIUS[shellOf(i)], 4);
    }
  });
});

describe('scatter cloud + stagger', () => {
  it('keeps scatter within the cloud envelope of SWARM_CENTER', () => {
    for (let i = 0; i < 200; i++) {
      const p = scatterPos(i);
      const d = Math.hypot(p[0] - SWARM_CENTER[0], p[1] - SWARM_CENTER[1], p[2] - SWARM_CENTER[2]);
      expect(d).toBeGreaterThanOrEqual(SWARM_RADIUS * 0.5 - 1e-6);
      expect(d).toBeLessThanOrEqual(SWARM_RADIUS * 1.4 + 1e-6);
    }
  });
  it('is deterministic + stagger in [0,1)', () => {
    for (let i = 0; i < 50; i++) {
      expect(scatterPos(i)).toEqual(scatterPos(i));
      const s = stagger(i);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThan(1);
      expect(hash01(i)).toBeGreaterThanOrEqual(0);
      expect(hash01(i)).toBeLessThan(1);
    }
  });
});

describe('flareIntervalS cadence (photosafety <3Hz)', () => {
  it('emits no flares until assembly is underway', () => {
    expect(flareIntervalS(0)).toBe(Infinity);
    expect(flareIntervalS(0.25)).toBe(Infinity);
  });
  it('tightens to a ≥0.5s floor as assembly completes (≤2Hz)', () => {
    expect(flareIntervalS(1)).toBe(0.5);
    expect(flareIntervalS(1)).toBeGreaterThanOrEqual(1 / 3);
    // mid-band
    expect(flareIntervalS(0.625)).toBeCloseTo(1.25, 6);
  });
});
