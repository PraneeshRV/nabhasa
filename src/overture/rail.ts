// Overture rail — Catmull-Rom camera spline through waypoints DERIVED from the
// live world/star/swarm positions (spec §Architecture). PURE three only: no
// @react-three/fiber import. The live-singleton reader (which positions to feed
// the rail) lives in Overture.tsx on the R3F side; this module takes positions as
// arguments so it is unit-testable under vitest's node env (tests/overture-rail).
//
// Waypoints, in choreographic order: star-reveal start → Reach glide world → Dyson
// swarm → spawn. World/swarm/spawn waypoints are the EXACT source positions (no
// framing offset) so "waypoints match source positions" is honest; only the star
// start is offset radially so the reveal camera clears the r=10 star surface. The
// camera looks at the origin throughout (the star/system center) — the flight spawn
// faces the star (Craft respawn idiom), so a constant origin look-at hands off to
// free flight without a re-orientation pop.

import { CatmullRomCurve3, Vector3 } from 'three';

// The ONE hardcoded coordinate the spec permits: the flight spawn pose. Matches
// flight/Craft.tsx RESPAWN_POS and flight/craftState.ts's initial pos exactly.
export const SPAWN_POS: readonly [number, number, number] = [600, 80, 0];

// Star center (world/scale.ts: "star at origin", r=10). Readonly Vector3 — the rail
// reads it, never moves it.
export const STAR_ORIGIN: Vector3 = new Vector3(0, 0, 0);

// How far the reveal start sits from the star, along the star→glideWorld ray. A
// scalar offset (not a coordinate): large enough to clear the r=10 surface with
// room for the lensing reveal, small enough that the star still dominates the
// opening frame.
export const STAR_START_OFFSET = 60;

// Source positions the rail is built from. `worlds` is the live singleton
// (getPlanetPositions()); the others are constants. All passed in — rail.ts
// hardcodes no world coordinate.
export interface OvertureSources {
  star: Readonly<Vector3>;
  worlds: readonly Readonly<Vector3>[];
  swarm: Readonly<Vector3>;
  spawn: Readonly<Vector3>;
}

// Index into `worlds` the rail glides past (the "Reach glide" beat subject).
// Praesidium (REACH_SYSTEM[1], "the garden", contentSlot 'About') — the first
// portfolio world and a gentle inner-orbit subject. An ARRAY INDEX, not a coord;
// the live position is read from the singleton at runtime.
const GLIDE_WORLD_INDEX = 1;

export interface OvertureWaypoints {
  points: readonly Vector3[]; // ordered Catmull-Rom control points (start…spawn)
  start: Vector3; // star-derived reveal start
  glideWorld: Vector3; // exact source world position
  swarm: Vector3; // exact source swarm position
  spawn: Vector3; // exact spawn (final point = handover pose)
}

const _dir = new Vector3();

// Build ordered waypoints from live sources. star/swarm/spawn waypoints equal the
// source positions verbatim; the start is the star offset STAR_START_OFFSET along
// the star→glideWorld ray so the camera sweeps IN toward the Reach for the reveal.
export function frameWaypoints(src: OvertureSources): OvertureWaypoints {
  const glideSrc = src.worlds[GLIDE_WORLD_INDEX] ?? src.worlds[0];
  const glideWorld = new Vector3().copy(glideSrc ?? STAR_ORIGIN);

  // start = star + normalize(star→glideWorld)·STAR_START_OFFSET. Guard the degenerate
  // case (glideWorld === star, impossible for orbiting worlds but defensive): fall
  // back to +x so normalize never sees a zero vector.
  _dir.subVectors(glideWorld, src.star);
  if (_dir.lengthSq() < 1e-6) _dir.set(1, 0, 0);
  _dir.normalize();
  const start = new Vector3().copy(src.star).addScaledVector(_dir, STAR_START_OFFSET);

  const swarm = new Vector3().copy(src.swarm);
  const spawn = new Vector3().copy(src.spawn);
  const points: Vector3[] = [start, new Vector3().copy(glideWorld), swarm, spawn];
  return { points, start, glideWorld, swarm, spawn };
}

// Catmull-Rom through the waypoints. centripetal type ⇒ C¹ everywhere with no
// cusps/self-intersections (the parameterization is robust to uneven spacing, which
// the star→swarm leg has). closed=false; the arcLengthDivisions default is enough
// for getPoint at the conductor's per-frame rate.
export function createRail(w: OvertureWaypoints): CatmullRomCurve3 {
  // CatmullRomCurve3 keeps the array reference; pass a fresh copy so the rail owns
  // its control points independent of the waypoints object's lifetime.
  return new CatmullRomCurve3(w.points.slice(), false, 'centripetal');
}

// Sample the rail position at param p (the conductor's railParam). Clamps to [0,1]
// so a stale/overshot param can never index off the spline. Overture.tsx sets
// camera.position to this each frame and lookAts the origin.
export function railPointAt(curve: CatmullRomCurve3, p: number): Vector3 {
  return curve.getPoint(p < 0 ? 0 : p > 1 ? 1 : p);
}
