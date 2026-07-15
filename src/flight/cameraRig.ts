// Chase camera (spec Task 6). Mount inside the R3F <Canvas> (after <Craft> so
// Craft's useFrame updates craftState first — though a one-frame lag is
// invisible given the damping). Reads the shared craftState ONLY: it never
// auto-rotates against player input.
//
// Damping is frame-rate-independent via k = 1 − exp(−λ·dt) (the correct lerp
// factor for exponential approach, not a constant lerp alpha).
import { useRef, type MutableRefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3, PerspectiveCamera } from 'three';
import { craftState } from './craftState'; // leaf — same singleton, no Rapier pull

const LAMBDA_POS = 4; // spec: position approach rate
const LAMBDA_LOOK = 6; // spec: look-at approach rate
const FOV_MIN = 60; // spec
const FOV_MAX = 75; // spec
const SPEED_REF = 120; // wu/s at which FOV reaches max — feel knob
// Offsets rescaled with the craft shrink (watch-gate 2026-07-15): keep the same
// craft-lengths-behind framing (~6 lengths back, ~1.7 up) at the new 1.5 wu hull.
export const OFFSET_BACK = 9; // craft pos − forward·9
export const OFFSET_UP = 2.5; // + up·2.5

const _desired = new Vector3();
const _up = new Vector3(0, 1, 0);

export function CameraRig() {
  const { camera } = useThree();
  // persistent look target so it damps independently of camera position
  const look: MutableRefObject<Vector3> = useRef(new Vector3().copy(craftState.pos));

  useFrame((_, dt) => {
    const { pos, forward, speed } = craftState;

    // desired camera position: behind the craft along its heading, lifted
    _desired.copy(pos).addScaledVector(forward, -OFFSET_BACK).addScaledVector(_up, OFFSET_UP);
    const kp = 1 - Math.exp(-LAMBDA_POS * dt);
    camera.position.lerp(_desired, kp);

    // look-at damps toward the craft
    const kl = 1 - Math.exp(-LAMBDA_LOOK * dt);
    look.current.lerp(pos, kl);
    camera.lookAt(look.current);

    // FOV widens with speed (speed lines of the poor)
    if (camera instanceof PerspectiveCamera) {
      const t = Math.min(1, speed / SPEED_REF);
      const fov = FOV_MIN + (FOV_MAX - FOV_MIN) * t;
      if (Math.abs(fov - camera.fov) > 0.01) {
        camera.fov = fov;
        camera.updateProjectionMatrix();
      }
    }
  });

  return null;
}
