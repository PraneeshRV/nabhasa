// Overture rail — Catmull-Rom spline through waypoints DERIVED from live
// world/star/swarm positions (spec §Architecture). Pure three only: NO
// @react-three/fiber import (the live-singleton reader lives in Overture.tsx, the
// R3F side) so this file loads under vitest's node env without dragging R3F.
//
// Fail-under-broken contract: if a waypoint stops matching its source, the spawn
// stops being the final point (wrong handover pose), or the curve loses C1
// continuity (a kinked/hardcoded path), a test below fails. World positions are
// passed IN (synthetic + REACH_SYSTEM-derived) — frameWaypoints taking them as
// args is itself the proof that rail.ts hardcodes no world coordinate.
import { describe, it, expect } from 'vitest';
import { Vector3 } from 'three';
import {
  SPAWN_POS,
  STAR_ORIGIN,
  frameWaypoints,
  createRail,
  railPointAt,
  chaseSpawnPose,
  STAR_START_OFFSET,
  type OvertureSources,
} from '../src/overture/rail';
import { craftState } from '../src/flight/craftState';
import { REACH_SYSTEM } from '../src/world/planets';
import { SWARM_CENTER } from '../src/world/scale';

const spawn = () => new Vector3(SPAWN_POS[0], SPAWN_POS[1], SPAWN_POS[2]);

// Synthetic sources — proves frameWaypoints honors whatever positions it is given.
function synthSources(): OvertureSources {
  return {
    star: new Vector3(0, 0, 0),
    worlds: [new Vector3(-130, 0, 5), new Vector3(-245, 0, -87)],
    swarm: new Vector3(900, 0, 0),
    spawn: spawn(),
  };
}

describe('SPAWN_POS / STAR_ORIGIN — pinned to the flight contract', () => {
  it('SPAWN_POS is [600,80,0] (flight/Craft RESPAWN_POS + craftState initial)', () => {
    expect(Array.from(SPAWN_POS)).toEqual([600, 80, 0]);
  });

  it('STAR_ORIGIN is the origin (world/scale: star at origin, r=10)', () => {
    expect(STAR_ORIGIN.length()).toBe(0);
  });
});

describe('frameWaypoints — waypoints match their source positions exactly', () => {
  it('the glide-world waypoint IS worlds[1] (Praesidium, the Reach-glide subject)', () => {
    const w = frameWaypoints(synthSources());
    expect(w.glideWorld.distanceTo(synthSources().worlds[1])).toBe(0);
  });

  it('the swarm waypoint IS the source swarm center', () => {
    const src = synthSources();
    expect(frameWaypoints(src).swarm.distanceTo(src.swarm)).toBe(0);
  });

  it('the final waypoint IS the spawn pose (handover target — fail-under-broken)', () => {
    const src = synthSources();
    expect(frameWaypoints(src).spawn.distanceTo(src.spawn)).toBe(0);
    // and it is the LAST control point
    const pts = frameWaypoints(src).points;
    expect(pts[pts.length - 1].distanceTo(src.spawn)).toBe(0);
  });

  it('the star-reveal start sits STAR_START_OFFSET from the star, never at it (no r=30 clip)', () => {
    const src = synthSources();
    const start = frameWaypoints(src).start;
    expect(start.distanceTo(src.star)).toBeCloseTo(STAR_START_OFFSET, 6);
    expect(start.distanceTo(src.star)).toBeGreaterThan(10); // outside the star surface
  });

  it('starts along the star→glideWorld ray (reveal sweeps in toward the Reach)', () => {
    const src = synthSources();
    const w = frameWaypoints(src);
    const ray = new Vector3().subVectors(src.worlds[1], src.star).normalize();
    const toStart = new Vector3().subVectors(w.start, src.star).normalize();
    // same direction ⇒ dot ≈ 1
    expect(toStart.dot(ray)).toBeGreaterThan(0.999);
  });

  it('falls back to worlds[0] when the glide index is absent (defensive, not a hot path)', () => {
    const src: OvertureSources = {
      star: new Vector3(0, 0, 0),
      worlds: [new Vector3(111, 0, 0)],
      swarm: new Vector3(900, 0, 0),
      spawn: spawn(),
    };
    expect(frameWaypoints(src).glideWorld.distanceTo(src.worlds[0])).toBe(0);
  });
});

describe('frameWaypoints — derived from the live data shape (REACH_SYSTEM, no fiber)', () => {
  // Build sources the way Overture.tsx will (star origin, swarm center, spawn) but
  // with world positions reconstructed from the PUBLIC contract at a phase azimuth
  // — proves the rail wires to the real orbit radii, not a hardcoded coord. (The
  // live singleton getPlanetPositions() is the same data written by LichPlanets;
  // frameWaypoints takes positions as args, so passing the live array at runtime
  // is a trivial substitution covered by the synthetic-source tests above.)
  it('the glide world sits on Praesidium’s orbit shell (260 wu)', () => {
    const phase = 2.8; // LichPlanets PHASES[1] shape (i*2.1+0.7)
    const praesidium = new Vector3(
      REACH_SYSTEM[1].orbitWu * Math.cos(phase),
      0,
      -REACH_SYSTEM[1].orbitWu * Math.sin(phase),
    );
    const src: OvertureSources = {
      star: new Vector3(0, 0, 0),
      worlds: [new Vector3(0, 0, 0), praesidium],
      swarm: new Vector3(SWARM_CENTER[0], SWARM_CENTER[1], SWARM_CENTER[2]),
      spawn: spawn(),
    };
    const w = frameWaypoints(src);
    expect(w.glideWorld.distanceTo(praesidium)).toBe(0);
    expect(w.swarm.distanceTo(new Vector3(...SWARM_CENTER))).toBe(0);
  });
});

describe('createRail — Catmull-Rom continuity + handover endpoint', () => {
  const rail = () => createRail(frameWaypoints(synthSources()));

  it('getPoint(0) is the reveal start and getPoint(1) is EXACTLY spawn (handover pose)', () => {
    const r = rail();
    const w = frameWaypoints(synthSources());
    expect(r.getPoint(0).distanceTo(w.start)).toBeCloseTo(0, 6);
    expect(r.getPoint(1).distanceTo(spawn())).toBeCloseTo(0, 6);
  });

  it('railPointAt mirrors the curve getter and clamps to the domain', () => {
    const r = rail();
    expect(railPointAt(r, 0).distanceTo(r.getPoint(0))).toBe(0);
    expect(railPointAt(r, 1).distanceTo(r.getPoint(1))).toBe(0);
    expect(railPointAt(r, -0.5).distanceTo(r.getPoint(0))).toBe(0);
    expect(railPointAt(r, 1.5).distanceTo(r.getPoint(1))).toBe(0);
  });

  it('C0: no teleport — consecutive samples step less than 100 wu (200 samples)', () => {
    const r = rail();
    let prev = r.getPoint(0);
    for (let i = 1; i <= 200; i++) {
      const cur = r.getPoint(i / 200);
      expect(cur.distanceTo(prev)).toBeLessThan(100);
      prev = cur;
    }
  });

  it('C1: tangent-continuous — max adjacent-sample angle SHRINKS as sampling refines', () => {
    // A C¹ curve's tangent is continuous, so the max angle between adjacent samples
    // scales ~1/N (halves when N doubles). A kinked/polyline rail keeps a constant
    // joint spike that does NOT shrink. This is threshold-free and curvature-free:
    // it fails a non-C¹ rail regardless of how gentle or sharp the path is.
    const r = rail();
    const maxAngleAt = (n: number): number => {
      let m = 0;
      for (let i = 0; i < n; i++) {
        const a = r.getTangent(i / n).normalize();
        const b = r.getTangent((i + 1) / n).normalize();
        const ang = Math.acos(Math.min(1, Math.max(-1, a.dot(b))));
        if (ang > m) m = ang;
      }
      return m;
    };
    const coarse = maxAngleAt(100);
    const fine = maxAngleAt(400);
    expect(fine).toBeLessThan(coarse * 0.5); // C¹ ⇒ ~4× finer ⇒ ~4× smaller
  });

  it('the whole rail stays inside PLAY_RADIUS (3000 wu) — no boundary escape', () => {
    const r = rail();
    for (let i = 0; i <= 100; i++) {
      expect(r.getPoint(i / 100).length()).toBeLessThan(3000);
    }
  });
});

describe('chaseSpawnPose — rail ends at the CHASE pose, not the craft pose (Finding 1)', () => {
  // CameraRig drives the camera to craftPos − forward·OFFSET_BACK + up·OFFSET_UP;
  // the rail's final waypoint must equal THAT (not the bare craft pose) so handover
  // is pop-free. The offset VALUES (28/8) live in cameraRig — a fiber module — so
  // importing them here would drag R3F into this node test. They are restated against
  // the craftState contract and the RESULT coords are DERIVED from craftState, never
  // hardcoded as magic 88/28. (This is the documented Finding-1 test delta: a pure
  // helper is tested instead of buildOvertureSources to keep the suite fiber-free.)
  it('computes pos − forward·back + up·up for arbitrary inputs', () => {
    const pos = new Vector3(10, 20, 30);
    const fwd = new Vector3(1, 0, 0); // looking +x ⇒ behind is −x
    const chase = chaseSpawnPose(pos, fwd, 5, 7);
    expect(chase.toArray()).toEqual([10 - 5, 20 + 7, 30]);
  });

  it('for the craftState initial equals the CameraRig chase pose (600,82.5,9), derived not magic', () => {
    // 9/2.5 restate cameraRig's OFFSET_BACK/OFFSET_UP (rescaled with the craft
    // shrink, watch-gate 2026-07-15) — kept literal so this test stays fiber-free.
    const chase = chaseSpawnPose(craftState.pos, craftState.forward, 9, 2.5);
    expect(chase.x).toBeCloseTo(craftState.pos.x, 6);
    expect(chase.y).toBeCloseTo(craftState.pos.y + 2.5, 6); // +up·2.5
    expect(chase.z).toBeCloseTo(craftState.pos.z + 9, 6); // forward (0,0,−1) ⇒ −forward·9 = +z·9
  });

  it('differs from the bare craft pose (regression: the rail must NOT end at craftPos)', () => {
    const chase = chaseSpawnPose(craftState.pos, craftState.forward, 9, 2.5);
    expect(chase.distanceTo(craftState.pos)).toBeGreaterThan(0);
  });
});

describe('frameWaypoints — coincident waypoints filtered (Finding 3: no CatmullRom NaN)', () => {
  it('drops a swarm coincident with the glide world — no consecutive pair < 1 wu, finite everywhere', () => {
    const glide = new Vector3(-245, 0, -87);
    const src: OvertureSources = {
      star: new Vector3(0, 0, 0),
      worlds: [new Vector3(-130, 0, 5), glide],
      swarm: new Vector3().copy(glide), // EXACT coincidence with the glide world
      spawn: new Vector3(600, 80, 0),
    };
    const w = frameWaypoints(src);
    for (let i = 1; i < w.points.length; i++) {
      expect(w.points[i].distanceTo(w.points[i - 1])).toBeGreaterThanOrEqual(1);
    }
    const curve = createRail(w);
    for (const p of [0, 0.25, 0.5, 0.75, 1]) {
      const v = railPointAt(curve, p);
      expect(Number.isFinite(v.x)).toBe(true);
      expect(Number.isFinite(v.y)).toBe(true);
      expect(Number.isFinite(v.z)).toBe(true);
    }
  });

  it('degenerate all-coincident sources stay finite with >= 2 points', () => {
    const origin = new Vector3(0, 0, 0);
    const src: OvertureSources = {
      star: new Vector3(0, 0, 0),
      worlds: [origin], // glide index absent → falls back to worlds[0] === star
      swarm: new Vector3(0, 0, 0),
      spawn: new Vector3(0, 0, 0),
    };
    const w = frameWaypoints(src);
    expect(w.points.length).toBeGreaterThanOrEqual(2);
    const curve = createRail(w);
    for (const p of [0, 0.5, 1]) {
      const v = railPointAt(curve, p);
      expect(Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z)).toBe(true);
    }
  });

  it('never drops the sacred start or spawn (handover endpoint survives filtering)', () => {
    const src: OvertureSources = {
      star: new Vector3(0, 0, 0),
      worlds: [new Vector3(500, 0, 0)], // glide fallback to worlds[0]
      swarm: new Vector3(500, 0, 0), // coincident with glide → dropped as inner dup
      spawn: new Vector3(600, 80, 0),
    };
    const w = frameWaypoints(src);
    expect(w.points[0].distanceTo(w.start)).toBe(0);
    expect(w.points[w.points.length - 1].distanceTo(w.spawn)).toBe(0);
  });
});
