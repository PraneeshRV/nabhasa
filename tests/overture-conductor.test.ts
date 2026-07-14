// Overture conductor — pure timeline (spec §Architecture `src/overture/`). t (0..1)
// → { railParam, phase, fired beats }. NO three, NO R3F — pure number math, so the
// whole cinematic beat structure is unit-testable without WebGL. This file is the
// fail-under-broken contract: if beats reorder, a threshold moves out of [0,1], the
// rail param inverts, or fire-once duplicates, a test below fails.
import { describe, it, expect } from 'vitest';
import {
  OVERTURE_BEATS,
  HANDOVER_T,
  glideDriftWeight,
  railParamAt,
  phaseAt,
  beatsCrossedBy,
  Conductor,
  type OvertureBeatId,
  type OverturePhase,
} from '../src/overture/conductor';

const CANON: OvertureBeatId[] = ['lensing', 'beam', 'swarm', 'glide', 'handover'];

describe('OVERTURE_BEATS — canon + ordering (fail-under-broken: reorder/drift)', () => {
  it('is in canon choreographic order', () => {
    expect(OVERTURE_BEATS.map((b) => b.id)).toEqual(CANON);
  });

  it('thresholds are strictly increasing', () => {
    for (let i = 1; i < OVERTURE_BEATS.length; i++) {
      expect(OVERTURE_BEATS[i].t).toBeGreaterThan(OVERTURE_BEATS[i - 1].t);
    }
  });

  it('lensing starts at t=0 (reveal is immediate) and handover sits inside (0,1)', () => {
    expect(OVERTURE_BEATS[0].t).toBe(0);
    expect(HANDOVER_T).toBe(OVERTURE_BEATS[4].t);
    expect(HANDOVER_T).toBeGreaterThan(0);
    expect(HANDOVER_T).toBeLessThan(1);
  });
});

describe('railParamAt — monotonic clamp to [0,1]', () => {
  it('endpoints pin 0 and 1', () => {
    expect(railParamAt(0)).toBe(0);
    expect(railParamAt(1)).toBe(1);
  });

  it('clamps out-of-range t to the rail (skip scrub can overshoot; never negative param)', () => {
    expect(railParamAt(-0.5)).toBe(0);
    expect(railParamAt(2)).toBe(1);
  });

  it('is non-decreasing across the timeline (a reversed/eased rail param fails here)', () => {
    let prev = -Infinity;
    for (let i = 0; i <= 20; i++) {
      const p = railParamAt(i / 20);
      expect(p).toBeGreaterThanOrEqual(prev);
      prev = p;
    }
  });
});

describe('phaseAt — segment owned by the last crossed beat', () => {
  it('maps each beat threshold to its own phase', () => {
    expect(phaseAt(OVERTURE_BEATS[1].t)).toBe('beam' as OverturePhase);
    expect(phaseAt(OVERTURE_BEATS[2].t)).toBe('swarm' as OverturePhase);
    expect(phaseAt(OVERTURE_BEATS[3].t)).toBe('glide' as OverturePhase);
    expect(phaseAt(OVERTURE_BEATS[4].t)).toBe('handover' as OverturePhase);
  });

  it('t just before a threshold belongs to the previous phase', () => {
    expect(phaseAt(OVERTURE_BEATS[1].t - 1e-6)).toBe('lensing');
    expect(phaseAt(OVERTURE_BEATS[4].t - 1e-6)).toBe('glide');
  });

  it('clamps to lensing at the start and handover at/past the end', () => {
    expect(phaseAt(0)).toBe('lensing');
    expect(phaseAt(1)).toBe('handover');
    expect(phaseAt(1.5)).toBe('handover');
    expect(phaseAt(-1)).toBe('lensing');
  });
});

describe('beatsCrossedBy — cumulative set grows monotonically', () => {
  it('at t=0 only lensing has crossed', () => {
    expect(beatsCrossedBy(0)).toEqual(['lensing']);
  });

  it('mid-timeline carries every beat up to that point', () => {
    // 0.3 is past beam(0.22), before swarm(0.45)
    expect(beatsCrossedBy(0.3)).toEqual(['lensing', 'beam']);
  });

  it('at the end every beat has crossed', () => {
    expect(beatsCrossedBy(1)).toEqual(CANON);
  });

  it('is order-stable and never loses a beat as t grows', () => {
    let prev = beatsCrossedBy(0);
    for (let i = 1; i <= 10; i++) {
      const cur = beatsCrossedBy(i / 10);
      // each new set is a superset (same prefix + maybe more)
      expect(cur.slice(0, prev.length)).toEqual(prev);
      prev = cur;
    }
  });
});

describe('Conductor.step — fire-once across the timeline', () => {
  it('fires lensing on the first step and marks it done only at t>=1', () => {
    const c = new Conductor();
    const s0 = c.step(0);
    expect(s0.fired).toEqual(['lensing']);
    expect(s0.phase).toBe('lensing');
    expect(s0.done).toBe(false);
  });

  it('fires a beat exactly once: re-stepping the same t emits nothing', () => {
    const c = new Conductor();
    c.step(0);
    expect(c.step(0.3).fired).toEqual(['beam']); // lensing already fired
    expect(c.step(0.3).fired).toEqual([]); // nothing new
  });

  it('can fire multiple beats in one step across a jump (skip scrub lands past several)', () => {
    const c = new Conductor();
    const s = c.step(1); // jump to the end in one step
    expect(s.fired).toEqual(CANON);
    expect(s.done).toBe(true);
  });

  it('skip-from-any-t: jumping from mid-glide to the end fires only the remaining beats', () => {
    const c = new Conductor();
    c.step(0.5); // crosses lensing + beam + swarm
    const s = c.step(1); // remaining: glide + handover
    expect(s.fired).toEqual(['glide', 'handover']);
    expect(s.done).toBe(true);
  });

  it('reset re-arms fire-once from scratch', () => {
    const c = new Conductor();
    c.step(1);
    c.reset();
    expect(c.step(0.1).fired).toEqual(['lensing']);
  });

  it('never reports a beat twice even under back-and-forth t (skip then resume)', () => {
    // A beat whose threshold is already crossed must not re-fire if t dips and rises.
    const c = new Conductor();
    c.step(0.5); // lensing, beam, swarm
    c.step(0.2); // t moves backward — nothing new
    expect(c.step(0.2).fired).toEqual([]);
    const s = c.step(0.7); // forward again — glide newly crossed, swarm NOT re-fired
    expect(s.fired).toEqual(['glide']);
  });
});

describe('glideDriftWeight — triangular live-glide blend (Finding 5)', () => {
  // The glide world keeps orbiting while the rail is baked once; Overture adds
  // (liveGlidePos − bakedGlidePos)·w to the camera, where w is a TRIANGLE keyed off
  // the glide/handover beat thresholds: 0 at glide, 1 at the midpoint, 0 at handover.
  const glideT = OVERTURE_BEATS[3].t;
  const handoverT = HANDOVER_T;
  const mid = (glideT + handoverT) / 2;

  it('is 0 at the glide beat, 1 at the midpoint, 0 at the handover beat', () => {
    expect(glideDriftWeight(glideT)).toBe(0);
    expect(glideDriftWeight(mid)).toBeCloseTo(1, 6);
    expect(glideDriftWeight(handoverT)).toBe(0);
  });

  it('is 0 outside [glide, handover] (rail start and sacred end poses untouched)', () => {
    expect(glideDriftWeight(0)).toBe(0);
    expect(glideDriftWeight(glideT - 1e-6)).toBe(0);
    expect(glideDriftWeight(handoverT + 1e-6)).toBe(0);
    expect(glideDriftWeight(1)).toBe(0);
  });

  it('rises monotonically to the peak then falls monotonically', () => {
    let prev = -Infinity;
    for (let i = 0; i <= 10; i++) {
      const t = glideT + (mid - glideT) * (i / 10);
      expect(glideDriftWeight(t)).toBeGreaterThanOrEqual(prev);
      prev = glideDriftWeight(t);
    }
    expect(prev).toBeCloseTo(1, 6); // peak at midpoint
    prev = 2;
    for (let i = 0; i <= 10; i++) {
      const t = mid + (handoverT - mid) * (i / 10);
      expect(glideDriftWeight(t)).toBeLessThanOrEqual(prev);
      prev = glideDriftWeight(t);
    }
  });
});
