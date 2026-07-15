// Overture rail — Catmull-Rom camera spline through waypoints DERIVED from the
// live world/star/swarm positions (spec §Architecture). PURE three only: no
// @react-three/fiber import. The live-singleton reader (which positions to feed
// the rail) lives in Overture.tsx on the R3F side; this module takes positions as
// arguments so it is unit-testable under vitest's node env (tests/overture-rail).
//
// Waypoints, in choreographic order: star-reveal start → Reach glide world → Dyson
// swarm → spawn. World/swarm/spawn waypoints are the EXACT source positions (no
// framing offset) so "waypoints match source positions" is honest; only the star
// start is offset radially so the reveal camera clears the r=50 star surface. The
// camera looks at the origin throughout (the star/system center) — the flight spawn
// faces the star (Craft respawn idiom), so a constant origin look-at hands off to
// free flight without a re-orientation pop.

import { CatmullRomCurve3, Vector3 } from 'three';

// The ONE hardcoded coordinate the spec permits: the flight spawn pose. Matches
// flight/Craft.tsx RESPAWN_POS and flight/craftState.ts's initial pos exactly.
// Finding 1: the rail's final waypoint is no longer this bare craft pose — the
// caller (Overture.tsx buildOvertureSources) passes the CHASE pose (deriving
// it from craftState + cameraRig offsets via chaseSpawnPose), so the rail ends
// exactly where CameraRig will place the camera at handover — no camera pop. rail.ts
// math is unchanged; it just consumes whatever `spawn` it is given. Kept exported so
// tests can pin the underlying craft contract.
export const SPAWN_POS: readonly [number, number, number] = [600, 80, 0];

// Star center (world/scale.ts: "star at origin", r=50). Readonly Vector3 — the rail
// reads it, never moves it.
export const STAR_ORIGIN: Vector3 = new Vector3(0, 0, 0);

// How far the reveal start sits from the star, along the star→glideWorld ray. A
// scalar offset (not a coordinate): large enough to clear the r=50 surface with
// room for the lensing reveal, small enough that the star still dominates the
// opening frame (4× the radius vs the original 6× — tightened so the start
// stays clear of Praesidium's 260 wu glide orbit).
export const STAR_START_OFFSET = 200;

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
// the live position is read from the singleton at runtime. Exported (Finding 5)
// so Overture.tsx reads the SAME world's live position for the glide-drift blend.
export const GLIDE_WORLD_INDEX = 1;

// Minimum gap (wu) between consecutive Catmull-Rom control points. Centripetal
// parameterization divides by inter-point distance — coincident (or near-
// coincident) neighbors produce NaN camera positions (Finding 3). Points closer
// than this to their predecessor are filtered out of `points`.
const MIN_WAYPOINT_GAP = 1;

export interface OvertureWaypoints {
  // Ordered Catmull-Rom control points (start…spawn), FILTERED so no consecutive
  // pair sits closer than MIN_WAYPOINT_GAP (Finding 3: coincident points → NaN).
  // The named fields below stay the RAW source-derived values; only `points` is
  // filtered. Start and spawn are sacred — filtering drops inner points, never
  // the endpoints.
  points: readonly Vector3[];
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

  // Finding 3: filter near-coincident control points (centripetal Catmull-Rom
  // NaNs on zero-distance neighbors). Inner points must clear MIN_WAYPOINT_GAP
  // from the last kept point; the spawn endpoint is sacred — if it lands too
  // close to the kept tail, drop inner points instead. Result always has >= 2
  // points (start + spawn); a 2-point Catmull-Rom degenerates to a line, which
  // is valid and finite.
  const raw: Vector3[] = [start, new Vector3().copy(glideWorld), swarm, spawn];
  const points: Vector3[] = [raw[0]];
  for (let i = 1; i < raw.length - 1; i++) {
    if (raw[i].distanceTo(points[points.length - 1]) >= MIN_WAYPOINT_GAP) points.push(raw[i]);
  }
  const last = raw[raw.length - 1];
  while (points.length > 1 && last.distanceTo(points[points.length - 1]) < MIN_WAYPOINT_GAP) {
    points.pop();
  }
  points.push(last);
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

const UP = new Vector3(0, 1, 0);

// The CHASE pose for a craft at craftPos facing craftForward: where CameraRig
// (flight/cameraRig.ts) drives the camera — pos − forward·offsetBack + up·offsetUp.
// Finding 1: the rail's final waypoint is THIS pose (not the bare craft pose) so
// the rail→CameraRig handover is pop-free. Offsets are passed in (not imported
// from cameraRig, a fiber module) so rail.ts stays fiber-free and node-testable;
// Overture.tsx supplies cameraRig's exported OFFSET_BACK/OFFSET_UP.
export function chaseSpawnPose(
  craftPos: Readonly<Vector3>,
  craftForward: Readonly<Vector3>,
  offsetBack: number,
  offsetUp: number,
): Vector3 {
  return new Vector3()
    .copy(craftPos)
    .addScaledVector(craftForward, -offsetBack)
    .addScaledVector(UP, offsetUp);
}
