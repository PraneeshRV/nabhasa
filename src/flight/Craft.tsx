// Player craft — Rapier dynamic body driven by clamped inverse-square gravity
// (gravity.ts) + input thrust. THE FEEL TASK (spec Task 6): flight must be
// assessed fun before Wave 2 merges.
//
// Force model: gravityAccel returns an ACCELERATION; we accumulate the step's
// total acceleration (gravity + thrust + boundary + brake) and commit it in a
// PER-PHYSICS-STEP hook (useBeforePhysicsStep) as addForce(a · mass). Spec
// Task6 Step3 mandates "addForce each step"; committing forces in useFrame
// decoupled them from the Physics accumulator (updateLoop="independent"), so a
// lag spike held gravity stale across multiple sub-steps and high-refresh
// recomputed it off-step. The hook re-runs before EVERY sub-step → matches the
// pure FIXED_DT integrator in gravity.test.ts regardless of accumulator count.
//
// Angular: torque = I·α with solid-sphere I = (2/5)·m·r² (finding 3), NOT m·α.
//
// WASM-lazy: @react-three/rapier's WASM stays out of the first-paint bundle by
// lazy-LOADING THIS MODULE at the mount point — App wires
// `React.lazy(() => import('./flight/Craft'))`. The static rapier imports below
// land in the flight chunk, never the main chunk.
import { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  Physics,
  RigidBody,
  BallCollider,
  useBeforePhysicsStep,
  type RapierRigidBody,
} from '@react-three/rapier';
import { Vector3, Quaternion, Mesh, MeshBasicMaterial } from 'three';
import gsap from 'gsap';
import { input, pollGamepad } from './input';
import { gravityAccelWithPlanets, PLANET_GMS, PLANET_RADII_WU } from './gravity';
import { FIXED_DT, KILL_RADIUS, PLAY_RADIUS } from '../world/scale';
import { regionAt, useRegionStore } from '../world/regions';
import { craftState } from './craftState'; // leaf — same singleton, no Rapier pull
import { getPlanetPositions } from '../world/LichPlanets'; // leaf singleton — planet perturbation (A1)
import { useCourierStore, fuelFraction, missionById } from '../game/courier'; // pure FSM (no Rapier/three) — spec Task 12 wiring

// ---- feel tunables (one place; adjust during the manual session) -------------
const THRUST_ACCEL = 40; // wu/s² max linear (spec); boost multiplies by BOOST_MUL
const BOOST_MUL = 2.5; // spec
const ATTITUDE_TORQUE = 8; // rad/s² max angular accel — NOT in spec; feel knob
const BRAKE_DAMP = 0.3; // flight-assist retro-damping rate (1/s) when braking (spec value)
const BOUNDARY_K = 6; // inward spring stiffness (wu/s² per wu beyond PLAY_RADIUS)
const RESPAWN_POS: [number, number, number] = [600, 80, 0];

// BallCollider radius (JSX arg below). Drives the solid-sphere moment of inertia
// I = (2/5)·m·r² — addTorque wants torque = I·α, not m·α (finding 3).
// Watch-gate feedback 2026-07-15: craft was planet-sized (cone 5 wu vs planet
// r 3-9 wu). Shrunk ~3.5x so worlds read as WORLDS; all world-scale numbers
// (orbits, GMs, rail, approach radii) intentionally untouched.
const BALL_RADIUS = 0.6;
const INERTIA_OVER_MASS = (2 / 5) * BALL_RADIUS * BALL_RADIUS; // I/m, given r

// Region streaming cadence: push regionAt(pos) every N physics steps ≈ 10Hz at
// FIXED_DT=1/60 (finding 9). Post/audio/HUD select from useRegionStore.
const REGION_PUSH_EVERY = 6;

// ---- shared craft state: defined in ./craftState (leaf, no Rapier import) ----
// Kept there so PulsarBeams/DysonSwarm/cameraRig (and the mobile film) can read
// the SAME singleton without dragging @react-three/rapier into their chunks
// (Task 14 mobile invariant). This module owns the WRITE side (Rapier body →
// craftState each physics step); the leaf owns the shape + identity. Imported at
// the top of this file; see the comment there.

// ---- frame-loop scratch (never allocate in useFrame) -------------------------
const _grav = new Vector3();
const _force = new Vector3(); // accumulated ACCELERATION this frame
const _fwd = new Vector3();
const _right = new Vector3();
const _up = new Vector3();
const _torque = new Vector3();
const _inward = new Vector3();
const _quat = new Quaternion();
const _dir = new Vector3();
const FWD_LOCAL = new Vector3(0, 0, -1);
const RIGHT_LOCAL = new Vector3(1, 0, 0);
const UP_LOCAL = new Vector3(0, 1, 0);

export function Craft({ onKill }: { onKill?: () => void }) {
  return (
    <Physics gravity={[0, 0, 0]} timeStep={FIXED_DT} updateLoop="independent">
      {/* useBeforePhysicsStep must run inside <Physics> context, so the body
          lives in a child component. */}
      <CraftBody onKill={onKill} />
      <PlanetColliders />
    </Physics>
  );
}

function CraftBody({ onKill }: { onKill?: () => void }) {
  const rb = useRef<RapierRigidBody | null>(null);
  const stepRef = useRef(0);
  const prevInteract = useRef(false); // rising-edge detect for courier mission accept

  useEffect(() => {
    const b = rb.current;
    if (!b) return;
    b.setTranslation({ x: RESPAWN_POS[0], y: RESPAWN_POS[1], z: RESPAWN_POS[2] }, true);
    b.setLinvel({ x: 0, y: 0, z: 0 }, true);
    b.setAngvel({ x: 0, y: 0, z: 0 }, true);
    // finding 8: gsap tweens the persistent craftState singleton; kill on
    // unmount so a mid-tween unmount can't keep mutating it.
    return () => gsap.killTweensOf(craftState);
  }, []);

  // Per-physics-step force/torque commit (finding 2). Runs before EVERY sub-step
  // so gravity+thrust are never held stale across the accumulator.
  useBeforePhysicsStep(() => {
    const b = rb.current;
    if (!b) return;
    // finding 2: a delivered/failed FSM state mounts an opaque overlay, but the
    // Rapier world kept stepping — gravity, boundary spring, AND live thrust drove
    // the craft blind under it (drifted/respawned somewhere unexpected on dismiss).
    // Freeze the body for the overlay's duration: clear queued force/torque + zero
    // velocity, skip the rest of the step. No setState — getState() read only.
    const st = useCourierStore.getState().status;
    if (st === 'delivered' || st === 'failed') {
      b.resetForces(true);
      b.resetTorques(true);
      b.setLinvel({ x: 0, y: 0, z: 0 }, true);
      b.setAngvel({ x: 0, y: 0, z: 0 }, true);
      return;
    }
    pollGamepad();

    const p = b.translation();
    const pos = craftState.pos.set(p.x, p.y, p.z);
    const mass = b.mass();

    // orientation → world basis
    const q = b.rotation();
    _quat.set(q.x, q.y, q.z, q.w);
    _fwd.copy(FWD_LOCAL).applyQuaternion(_quat);
    _right.copy(RIGHT_LOCAL).applyQuaternion(_quat);
    _up.copy(UP_LOCAL).applyQuaternion(_quat);
    craftState.forward.copy(_fwd);

    // accumulate acceleration (gravity [star + planet perturbation, A1] + thrust)
    gravityAccelWithPlanets(pos, _grav, getPlanetPositions(), PLANET_GMS, PLANET_RADII_WU);
    const ta = THRUST_ACCEL * (input.boost ? BOOST_MUL : 1);
    _force.set(0, 0, 0)
      .addScaledVector(_fwd, input.thrust * ta)
      .addScaledVector(_right, input.strafe * ta)
      .addScaledVector(_up, input.lift * ta)
      .add(_grav);

    // velocity / speed (for brake + state)
    const lv = b.linvel();
    const vel = craftState.vel.set(lv.x, lv.y, lv.z);
    craftState.speed = vel.length();

    // flight-assist retro-damping when braking: accel = -BRAKE_DAMP · v
    if (input.brake) _force.addScaledVector(vel, -BRAKE_DAMP);

    // soft play boundary: inward spring beyond PLAY_RADIUS
    const r = pos.length();
    if (r > PLAY_RADIUS) {
      _inward.copy(pos).multiplyScalar(-1 / r);
      _force.addScaledVector(_inward, BOUNDARY_K * (r - PLAY_RADIUS));
    }

    // commit force (acceleration × mass) for this sub-step
    b.resetForces(true);
    b.addForce({ x: _force.x * mass, y: _force.y * mass, z: _force.z * mass }, true);

    // attitude torque = I·α (finding 3); _torque holds α in world frame
    _torque.set(input.pitch, input.yaw, input.roll).applyQuaternion(_quat).multiplyScalar(ATTITUDE_TORQUE);
    b.resetTorques(true);
    const ti = mass * INERTIA_OVER_MASS;
    b.addTorque({ x: _torque.x * ti, y: _torque.y * ti, z: _torque.z * ti }, true);

    // region streaming: regionAt(pos) → store, throttled ~10Hz (finding 9)
    if (stepRef.current++ % REGION_PUSH_EVERY === 0) {
      useRegionStore.getState().setRegion(regionAt(pos));
    }

    // courier mission loop (spec Task 12): step senses offer/delivery + drains
    // fuel ONCE per FIXED_DT. No throttle here — drain is dt-accurate, unlike the
    // spatial region push above. getState()/set() is external-store mutation, not
    // React setState — safe in this hook (same idiom as useRegionStore).
    const courier = useCourierStore.getState();
    courier.step({ pos: [pos.x, pos.y, pos.z], thrust: input.thrust, dt: FIXED_DT });
    // Accept an offered mission on the interact rising edge (KeyC / gamepad A).
    // reduce() is a no-op unless status === 'offered', so a held C is safe.
    const after = useCourierStore.getState();
    if (after.status === 'offered' && input.interact && !prevInteract.current) {
      after.reduce({ type: 'accept' });
    }
    prevInteract.current = input.interact;
    // Sync mission fuel → shared craftState so the HUD Fuel% line reflects drain
    // (craftState.fuel is the 10Hz HUD sink; the courier store owns the value).
    craftState.fuel = fuelFraction(useCourierStore.getState());

    // kill: tidal destruction + respawn
    if (r < KILL_RADIUS) {
      // finding 3: dispatch the fail SYNCHRONOUSLY. The old path went through an
      // async import('./game/courier').then(...) in App's onKill, so the FSM stayed
      // 'active' (fuel draining, sensing) for ≥1 frame after death. courier is
      // already statically imported here (line 37), so the dynamic import bought
      // nothing chunk-wise either. reduce() is an external-store set, same idiom as
      // the step() call above — safe in this hook. Fires once per death: the
      // finding-2 gate freezes the body next step (status === 'failed'), so this
      // block can't re-enter before the FSM reset.
      useCourierStore.getState().reduce({ type: 'fail', reason: 'destroyed' });
      // Respawn at the ACTIVE mission's source beacon (finding 6): a kill on m2–m5
      // otherwise drops the craft at m1.from (RESPAWN_POS) → a long dead-air flight
      // back to the failed mission's `from`. Idle (no mission) falls back to spawn.
      const cs = useCourierStore.getState();
      const m = cs.missionId ? missionById(cs.missionId) : null;
      respawn(b, onKill, m?.from ?? RESPAWN_POS);
    }
  });

  return (
    <RigidBody
      ref={rb}
      type="dynamic"
      colliders={false}
      linearDamping={0}
      angularDamping={2}
      ccd
    >
      <BallCollider args={[BALL_RADIUS]} />
      {/* placeholder hull (hero glTF lands Task 13); nose toward local -Z */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.45, 1.5, 12]} />
        <meshStandardMaterial color="#cfe4ff" emissive="#3a78c8" emissiveIntensity={0.4} metalness={0.6} roughness={0.4} />
      </mesh>
      <Thruster />
    </RigidBody>
  );
}

function respawn(b: RapierRigidBody, onKill: (() => void) | undefined, at: readonly [number, number, number]) {
  b.setTranslation({ x: at[0], y: at[1], z: at[2] }, true);
  b.setLinvel({ x: 0, y: 0, z: 0 }, true);
  b.setAngvel({ x: 0, y: 0, z: 0 }, true);
  // finding 1: resetForces/addForce earlier in the step ran BEFORE the kill check,
  // so the stale force (incl. ~432 wu/s² gravity computed at the death radius) was
  // still queued — Rapier applied it at the new position, kicking the zeroed craft
  // ~7 wu/s on respawn. Clear it now so the body is truly at rest at the new pose.
  b.resetForces(true);
  b.resetTorques(true);
  // face the star at origin: rotate local -Z onto (pos → origin)
  _dir.set(-at[0], -at[1], -at[2]).normalize();
  _quat.setFromUnitVectors(FWD_LOCAL, _dir);
  b.setRotation({ x: _quat.x, y: _quat.y, z: _quat.z, w: _quat.w }, true);

  // 600ms white-in envelope (0→1→0); DOM overlay (Task 13) reads craftState.killFlash.
  // Task 15 a11y floor: skip the animated flash envelope when the user opts out
  // of motion (reduced-motion normally routes to the static tier; this gates the
  // edge case where a live-tier user also has the preference set).
  craftState.killFlash = 0;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduceMotion) {
    gsap.killTweensOf(craftState);
    gsap.to(craftState, { killFlash: 1, duration: 0.3, yoyo: true, repeat: 1, ease: 'power2.inOut' });
  }

  onKill?.(); // tidal-destruction audio cue wired by Task 9
}

// finding 4: planet physics proxies. The Lich planets had NO Rapier colliders, so
// the craft (BallCollider r=2) clipped straight through their bodies — undercut the
// "must feel physical" line for the very bodies missions route between. They ORBIT,
// so static bodies are wrong: kinematicPosition bodies whose translation we sync
// each sub-step from the SAME getPlanetPositions() singleton gravity + the visual
// <LichPlanets> meshes publish. kinematicPosition ⇒ the dynamic craft bounces/stops
// against them (ccd on the craft keeps the contact clean); no forces, no drift.
// Collider-only — the planet hull stays in <LichPlanets>; this is an invisible proxy.
function PlanetColliders() {
  const refs = useRef<(RapierRigidBody | null)[]>([]);
  useBeforePhysicsStep(() => {
    const ps = getPlanetPositions();
    const arr = refs.current;
    for (let i = 0; i < arr.length; i++) {
      const b = arr[i];
      const p = ps[i];
      if (!b || !p) continue;
      b.setTranslation({ x: p.x, y: p.y, z: p.z }, true);
    }
  });
  return (
    <>
      {PLANET_RADII_WU.map((rw, i) => (
        <RigidBody
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="kinematicPosition"
          colliders={false}
        >
          <BallCollider args={[rw]} />
        </RigidBody>
      ))}
    </>
  );
}

// Thruster FX: emissive cone keyed to forward thrust (placeholder this wave).
function Thruster() {
  const ref = useRef<Mesh | null>(null);
  useFrame(() => {
    const m = ref.current;
    if (!m) return;
    const t = Math.max(0, input.thrust);
    const s = 0.2 + t; // base glow + thrust scale
    m.scale.set(s, s * 2, s);
    (m.material as MeshBasicMaterial).opacity = t * 0.9;
  });
  return (
    <mesh ref={ref} position={[0, 0, 0.8]} rotation={[Math.PI / 2, 0, 0]}>
      <coneGeometry args={[0.25, 0.9, 8]} />
      <meshBasicMaterial color="#9fd0ff" transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}
