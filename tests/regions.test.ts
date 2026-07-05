import { describe, it, expect } from 'vitest';
import { Vector3 } from 'three';
import { regionAt, REGION_PROFILES } from '../src/world/regions';

describe('regionAt boundaries', () => {
  it('classifies near-star inside r<150', () => {
    expect(regionAt(new Vector3(0, 0, 0))).toBe('nearStar');
    expect(regionAt(new Vector3(100, 50, 0))).toBe('nearStar');
    expect(regionAt(new Vector3(0, 0, 149.9))).toBe('nearStar');
  });

  it('classifies swarm within SWARM_RADIUS of center', () => {
    expect(regionAt(new Vector3(900, 0, 0))).toBe('swarm');
    expect(regionAt(new Vector3(900, 250, 0))).toBe('swarm'); // boundary inclusive
    expect(regionAt(new Vector3(900, 0, 249))).toBe('swarm');
  });

  it('classifies arrival everywhere else', () => {
    expect(regionAt(new Vector3(3000, 0, 0))).toBe('arrival');
    expect(regionAt(new Vector3(0, 0, 150))).toBe('arrival'); // near-star boundary exclusive
    expect(regionAt(new Vector3(900, 251, 0))).toBe('arrival'); // just outside swarm
    expect(regionAt(new Vector3(600, 0, 0))).toBe('arrival'); // between star and swarm
  });

  it('profiles carry positive exposure + ambient floor per region', () => {
    (['arrival', 'nearStar', 'swarm'] as const).forEach((id) => {
      expect(REGION_PROFILES[id].exposure).toBeGreaterThan(0);
      expect(REGION_PROFILES[id].ambientLevel).toBeGreaterThanOrEqual(0);
    });
  });
});
