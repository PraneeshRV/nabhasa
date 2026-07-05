// Pulsar lighthouse beams — Nabhasa signature #3 (spec Task 10).
//
// Twin opposed volumetric cones from the magnetic poles, sweeping at the
// display-rate spin (1:2000 real, ≈0.16 beam-passes/s — comfortably <3Hz,
// photosensitivity-safe). Flying through a beam: bloom lift + craft rim-light +
// HUD "RADIATION TRANSIT" + sonify ping at max gain — the moment must feel
// physical.
//
// PHASE-LOCK (finding 1, frozen contract): spin is read from the SHARED clamped
// clock — spinRef.rotation.y = starSpinAngle(starClock.t) each frame. NEVER
// state.clock.elapsedTime (unclamped, Canvas-epoch → drifts after a lag spike),
// NEVER a private accumulator. starClock.t is published by NeutronStar's
// useFrame; this component mounts AFTER NeutronStar in App so R3F runs its frame
// callback the same frame, reading the just-published value. A one-frame lag
// would still converge (shared monotonic source) — it cannot diverge.
//
// Emits phase + transit to beamState (module singleton, mirrors flight/craft's
// craftState): sonify (Task 9) reads .phase for the heartbeat ping + .transit
// for gain; Telemetry (Task 13) reads .transit for the RADIATION TRANSIT line.
// Both land later and consume this verbatim — no audio/HUD import here.

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Group, PointLight, Quaternion, Vector3 } from 'three';
import { starClock, starSpinAngle } from '../world/NeutronStar';
import { craftState } from '../flight/Craft';
import { createBeamMaterial, BEAM_LENGTH, BEAM_RADIUS, beamUniforms } from '../shaders/pulsarBeam';
import type { Tier } from '../core/tiers';

// 15° = spin-axis inclination (world Y → star's spin axis), matches the
// NeutronStar group tilt so beams share the star's exact spin axis.
const TILT = (15 * Math.PI) / 180;
// 15° obliquity = magnetic axis off the SPIN axis (real pulsar geometry; the
// thing that makes the beam sweep). Distinct role from TILT — both feed the
// "wobble" the spec calls out.
const OBLIQUITY = (15 * Math.PI) / 180;

// Beam half-angle and its cos — fixed by the cone geometry (shader-coupled).
const HALF_ANGLE = Math.atan(BEAM_RADIUS / BEAM_LENGTH);
const COS_HALF = Math.cos(HALF_ANGLE);
const ONE_MINUS_COS_HALF = 1 - COS_HALF;

// Photosafety slew: transit bloom lift reaches ≤1.8× over ≤400ms (no strobe).
// τ=0.08 → ~99% in 4τ ≈ 0.32s. Even if alignment flips per frame, intensity
// cannot change faster than this envelope.
const TRANSIT_TAU = 0.08;
const TRANSIT_LIFT = 0.8; // intensity 1.0 → 1.8 at full transit
const LIGHT_SCALE = 4000; // point-light intensity at full transit (decay=2)

// Per-tier cone resolution (QUALITY owns particle/swarm counts, not beams;
// this local dial is the beam tier knob — static ships no canvas).
const CONE_SEG: Record<Exclude<Tier, 'static'>, number> = {
  'webgpu-high': 32,
  'webgpu-low': 24,
  webgl2: 16,
};

// ---- shared beam state (refs, NOT React state — zero per-frame setState) ----
// sonify (Task 9) + Telemetry (Task 13) read this; phase-locked to starSpinAngle.
export interface BeamState {
  phase: number; // starSpinAngle(starClock.t) — display-rate spin phase
  transit: number; // 0..1 max beam↔craft alignment (HUD + sonify gain)
  beamDir: Vector3; // world dir of the craft-facing beam (sonify ping phase)
}
export const beamState: BeamState = {
  phase: 0,
  transit: 0,
  beamDir: new Vector3(0, 1, 0),
};

// ---- frame scratch (never allocate in useFrame) ----
const _q = new Quaternion();
const _dirA = new Vector3();
const _dirB = new Vector3();
const _craftDir = new Vector3();
const _Y = new Vector3(0, 1, 0);

export function PulsarBeams({ tier }: { tier: Tier }) {
  const spinRef = useRef<Group>(null);
  const beamARef = useRef<Group>(null);
  const beamBRef = useRef<Group>(null);
  const lightRef = useRef<PointLight>(null);
  const material = useMemo(() => createBeamMaterial(), []);
  const seg = tier === 'static' ? 16 : CONE_SEG[tier];

  useEffect(() => () => material.dispose(), [material]);

  useFrame((_, rawDt) => {
    const spin = spinRef.current;
    const a = beamARef.current;
    const b = beamBRef.current;
    if (!spin || !a || !b) return;

    // ── phase-lock: spin from the shared clamped clock ──
    const ang = starSpinAngle(starClock.t);
    spin.rotation.y = ang;
    // Force fresh world matrices (set this frame) before reading beam axes below
    // — otherwise getWorldQuaternion returns last frame's orientation.
    spin.updateWorldMatrix(true, true);

    // beam world axes = each inner group's local +Y in world space
    a.getWorldQuaternion(_q);
    _dirA.copy(_Y).applyQuaternion(_q);
    b.getWorldQuaternion(_q);
    _dirB.copy(_Y).applyQuaternion(_q);

    // ── transit: max alignment of either beam with the craft direction ──
    const dist = craftState.pos.length();
    _craftDir.copy(craftState.pos).normalize(); // star at origin
    let transit = 0;
    let dominant = _dirA;
    if (dist > 0.5 && dist < BEAM_LENGTH) {
      const alignA = _craftDir.dot(_dirA);
      const alignB = _craftDir.dot(_dirB);
      const tA = Math.max(0, (alignA - COS_HALF) / ONE_MINUS_COS_HALF);
      const tB = Math.max(0, (alignB - COS_HALF) / ONE_MINUS_COS_HALF);
      if (tB >= tA) {
        transit = tB;
        dominant = _dirB;
      } else {
        transit = tA;
      }
    }

    // ── bloom lift, slew-capped (≤1.8× over ≤400ms; no strobe) ──
    const dt = Math.min(rawDt, 1 / 30);
    const target = 1 + TRANSIT_LIFT * transit;
    const k = 1 - Math.exp(-dt / TRANSIT_TAU);
    beamUniforms.intensity.value += (target - beamUniforms.intensity.value) * k;

    // ── rim light snapped to nearest beam-axis point, ∝ alignment ──
    const light = lightRef.current;
    if (light) {
      light.intensity = transit * LIGHT_SCALE;
      // nearest point on the beam axis line (through origin along `dominant`)
      const t = Math.min(Math.max(craftState.pos.dot(dominant), 0), BEAM_LENGTH);
      light.position.copy(dominant).multiplyScalar(t);
    }

    // ── publish phase + transit for sonify / HUD ──
    beamState.phase = ang;
    beamState.transit = transit;
    beamState.beamDir.copy(dominant);
  });

  if (tier === 'static') return null;

  return (
    <group>
      {/* Tilt inclines the spin axis 15° from world Y (matches NeutronStar group
          so beams share the star's exact spin axis). Beams live under it; the
          transit rim light lives OUTSIDE it (world space, below). */}
      <group rotation={[0, 0, TILT]}>
        <group ref={spinRef}>
          {/* Beam A: +magnetic axis. Cone flipped [π,0,0] + offset so the apex
              (point) lands ON the star and the shaft widens outward. */}
          <group ref={beamARef} rotation={[0, 0, -OBLIQUITY]}>
            <mesh material={material} position={[0, BEAM_LENGTH / 2, 0]} rotation={[Math.PI, 0, 0]}>
              <coneGeometry args={[BEAM_RADIUS, BEAM_LENGTH, seg, 1]} />
            </mesh>
          </group>
          {/* Beam B: -magnetic axis (opposed). */}
          <group ref={beamBRef} rotation={[0, 0, Math.PI - OBLIQUITY]}>
            <mesh material={material} position={[0, BEAM_LENGTH / 2, 0]} rotation={[Math.PI, 0, 0]}>
              <coneGeometry args={[BEAM_RADIUS, BEAM_LENGTH, seg, 1]} />
            </mesh>
          </group>
        </group>
      </group>
      {/* Moving rim light when a beam sweeps over the craft (spec). World space —
          position is written as a world coord each frame. Blue-white. */}
      <pointLight ref={lightRef} color="#AFE3FF" intensity={0} decay={2} distance={0} />
    </group>
  );
}
