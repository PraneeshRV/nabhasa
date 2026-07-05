// Player craft — Rapier dynamic body driven by clamped inverse-square gravity
// (gravity.ts) + input thrust. THE FEEL TASK (spec Task 6): flight must be
// assessed fun before Wave 2 merges.
//
// Force model: gravityAccel returns an ACCELERATION; we accumulate the frame's
// total acceleration (gravity + thrust + boundary + brake) and commit it once
// per R3F frame as addForce(a · mass). Rapier's addForce is persistent until
// resetForces, so across the Physics accumulator's fixed sub-step(s) this frame
// the same constant force applies at each sub-step — i.e. "addForce each step".
// We resetForces+addForce every frame regardless, which is correct whether the
// pipeline auto-resets forces or not (robust to that API uncertainty). With
// timeStep=FIXED_DT at steady 60fps the accumulator runs one sub-step per
// frame, matching the pure integrator in gravity.test.ts.
//
// WASM-lazy: @react-three/rapier's WASM stays out of the first-paint bundle by
// lazy-LOADING THIS MODULE at the mount point — App wires
// `React.lazy(() => import('./flight/Craft'))`. The static rapier imports below
// land in the flight chunk, never the main chunk. (Spec suggested lazying
// <Physics> in-file; lazying the whole module is the same effect with cleaner
// JSX — flagged in task notes.)
import { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Physics, RigidBody, BallCollider, type RapierRigidBody } from '@react-three/rapier';
import { Vector3, Quaternion, Mesh, MeshBasicMaterial } from 'three';
import gsap from 'gsap';
import { input, pollGamepad } from './input';
import { gravityAccel } from './gravity';
import { FIXED_DT, KILL_RADIUS, PLAY_RADIUS } from '../world/scale';

// ---- feel tunables (one place; adjust during the manual session) -------------
const THRUST_ACCEL = 40; // wu/s² max linear (spec); boost multiplies by BOOST_MUL
const BOOST_MUL = 2.5; // spec
const ATTITUDE_TORQUE = 8; // rad/s² max angular — NOT in spec; feel knob
const BRAKE_DAMP = 0.3; // flight-assist retro-damping rate (1/s) when braking (spec value)
const BOUNDARY_K = 6; // inward spring stiffness (wu/s² per wu beyond PLAY_RADIUS)
const RESPAWN_POS: [number, number, number] = [600, 80, 0];

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
  const rb = useRef<RapierRigidBody | null>(null);

  useEffect(() => {
    const b = rb.current;
    if (!b) return;
    b.setTranslation({ x: RESPAWN_POS[0], y: RESPAWN_POS[1], z: RESPAWN_POS[2] }, true);
    b.setLinvel({ x: 0, y: 0, z: 0 }, true);
    b.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }, []);

  useFrame((_, _frameDt) => {
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

    // commit force (acceleration × mass) for this frame's sub-step(s)
    b.resetForces(true);
    b.addForce({ x: _force.x * mass, y: _force.y * mass, z: _force.z * mass }, true);

    // attitude torque (pitch/yaw/roll) in the craft's LOCAL frame → world
    _torque.set(input.pitch, input.yaw, input.roll).applyQuaternion(_quat).multiplyScalar(ATTITUDE_TORQUE);
    b.resetTorques(true);
    b.addTorque({ x: _torque.x * mass, y: _torque.y * mass, z: _torque.z * mass }, true);

    // kill: tidal destruction + respawn
    if (r < KILL_RADIUS) respawn(b, onKill);
  });

  return (
    <Physics gravity={[0, 0, 0]} timeStep={FIXED_DT} updateLoop="independent">
      <RigidBody
        ref={rb}
        type="dynamic"
        colliders={false}
        linearDamping={0}
        angularDamping={2}
        ccd
      >
        <BallCollider args={[2]} />
        {/* placeholder hull (hero glTF lands Task 13); nose toward local -Z */}
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <coneGeometry args={[1.5, 5, 12]} />
          <meshStandardMaterial color="#cfe4ff" emissive="#3a78c8" emissiveIntensity={0.4} metalness={0.6} roughness={0.4} />
        </mesh>
        <Thruster />
      </RigidBody>
    </Physics>
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
