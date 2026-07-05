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
import { gravityAccel } from './gravity';
import { FIXED_DT, KILL_RADIUS, PLAY_RADIUS } from '../world/scale';
import { regionAt, useRegionStore } from '../world/regions';

// ---- feel tunables (one place; adjust during the manual session) -------------
const THRUST_ACCEL = 40; // wu/s² max linear (spec); boost multiplies by BOOST_MUL
const BOOST_MUL = 2.5; // spec
const ATTITUDE_TORQUE = 8; // rad/s² max angular accel — NOT in spec; feel knob
const BRAKE_DAMP = 0.3; // flight-assist retro-damping rate (1/s) when braking (spec value)
const BOUNDARY_K = 6; // inward spring stiffness (wu/s² per wu beyond PLAY_RADIUS)
const RESPAWN_POS: [number, number, number] = [600, 80, 0];

// BallCollider radius (JSX arg below). Drives the solid-sphere moment of inertia
// I = (2/5)·m·r² — addTorque wants torque = I·α, not m·α (finding 3).
const BALL_RADIUS = 2;
const INERTIA_OVER_MASS = (2 / 5) * BALL_RADIUS * BALL_RADIUS; // I/m, given r

// Region streaming cadence: push regionAt(pos) every N physics steps ≈ 10Hz at
// FIXED_DT=1/60 (finding 9). Post/audio/HUD select from useRegionStore.
const REGION_PUSH_EVERY = 6;

// ---- shared craft state (refs, NOT React state — zero per-frame setState) ----
// cameraRig reads this each frame; hudStore (Task 13) samples rKm/speed @10Hz.
export interface CraftState {
  pos: Vector3;
  vel: Vector3;
  forward: Vector3; // unit, local -Z in world space
  speed: number; // wu/s
  fuel: number; // 0..1; drain wired by Task 12 (missions)
  killFlash: number; // 0..1 envelope for the 600ms white-in (DOM overlay reads this)
}
export const craftState: CraftState = {
  pos: new Vector3(...RESPAWN_POS),
  vel: new Vector3(),
  forward: new Vector3(0, 0, -1),
  speed: 0,
  fuel: 1,
  killFlash: 0,
};
export function useCraftState(): CraftState {
  return craftState;
}

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
    </Physics>
  );
}

function CraftBody({ onKill }: { onKill?: () => void }) {
  const rb = useRef<RapierRigidBody | null>(null);
  const stepRef = useRef(0);

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

    // accumulate acceleration (gravity + linear thrust)
    gravityAccel(pos, _grav);
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

    // kill: tidal destruction + respawn
    if (r < KILL_RADIUS) respawn(b, onKill);
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
        <coneGeometry args={[1.5, 5, 12]} />
        <meshStandardMaterial color="#cfe4ff" emissive="#3a78c8" emissiveIntensity={0.4} metalness={0.6} roughness={0.4} />
      </mesh>
      <Thruster />
    </RigidBody>
  );
}

function respawn(b: RapierRigidBody, onKill?: () => void) {
  b.setTranslation({ x: RESPAWN_POS[0], y: RESPAWN_POS[1], z: RESPAWN_POS[2] }, true);
  b.setLinvel({ x: 0, y: 0, z: 0 }, true);
  b.setAngvel({ x: 0, y: 0, z: 0 }, true);
  // face the star at origin: rotate local -Z onto (pos → origin)
  _dir.set(-RESPAWN_POS[0], -RESPAWN_POS[1], -RESPAWN_POS[2]).normalize();
  _quat.setFromUnitVectors(FWD_LOCAL, _dir);
  b.setRotation({ x: _quat.x, y: _quat.y, z: _quat.z, w: _quat.w }, true);

  // 600ms white-in envelope (0→1→0); DOM overlay (Task 13) reads craftState.killFlash
  craftState.killFlash = 0;
  gsap.killTweensOf(craftState);
  gsap.to(craftState, { killFlash: 1, duration: 0.3, yoyo: true, repeat: 1, ease: 'power2.inOut' });

  onKill?.(); // tidal-destruction audio cue wired by Task 9
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
    <mesh ref={ref} position={[0, 0, 2.6]} rotation={[Math.PI / 2, 0, 0]}>
      <coneGeometry args={[0.8, 3, 8]} />
      <meshBasicMaterial color="#9fd0ff" transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}
