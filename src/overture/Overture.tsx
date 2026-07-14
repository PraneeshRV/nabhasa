// Overture — the cinematic camera-on-rails intro (spec §Architecture, W4). Mounts
// INSIDE the R3F <Canvas> as the sole camera driver for ~75 s, then hands off to
// free flight by calling onHandover() (the mount point swaps Overture out + flight
// in). Consumes the pure conductor (timeline) + rail (spline) + skip (scrub) and
// glues them to the camera with useFrame.
//
// Mount note (App.tsx is NOT modified — non-scope): render <Overture> as a child
// of <NabhasaCanvas> INSTEAD OF <CameraRig> for the intro (both drive the camera;
// Overture must be the only one while mounted). On onHandover, unmount Overture and
// mount <CameraRig> + the flight chunk. Route reduced-motion users
// (skip.prefersReducedMotion) straight to flight/static — Overture never mounts.
// The HUD fade + "YOU HAVE THE CRAFT" are emitted via onHud({fade,text}); render a
// sibling DOM overlay driven by that callback (mirrors the HudSampler→store→HUD
// idiom — keeps this component pure R3F, no DOM rendering inside the Canvas).
//
// Error path (spec §Error-handling: "never a black screen"): the per-frame drive
// and the rail build are both try/caught — any failure logs and calls onHandover()
// exactly once, skipping straight to flight. Overture loads no assets/shaders of
// its own (it reuses the scene the overture flies through), so logic throws are the
// only failure surface and they are covered.

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3, type CatmullRomCurve3 } from 'three';
import type { Tier } from '../core/tiers';
import { OFFSET_BACK, OFFSET_UP } from '../flight/cameraRig';
import { craftState } from '../flight/craftState';
import { getPlanetPositions } from '../world/LichPlanets';
import { SWARM_CENTER } from '../world/scale';
import { Conductor, glideDriftWeight, HANDOVER_T, type OvertureBeatId } from './conductor';
import {
  chaseSpawnPose,
  createRail,
  frameWaypoints,
  GLIDE_WORLD_INDEX,
  railPointAt,
  STAR_ORIGIN,
  type OvertureSources,
  type OvertureWaypoints,
} from './rail';
import { scrubAdvance } from './skip';

// Default overture length — the middle of the spec's 60–90 s band. durationS maps
// real elapsed seconds to the conductor's normalized t (t = elapsed/durationS);
// skip scrub overrides this with its own ≤SKIP_DURATION_S rate.
const DEFAULT_DURATION_S = 75;

export interface OvertureHudState {
  fade: number; // 0..1, ramps across the handover phase (the "last ~10 s" window)
  text: string; // '' until the handover phase, then 'YOU HAVE THE CRAFT'
}

export interface OvertureProps {
  tier: Tier;
  durationS?: number;
  onHandover: () => void; // flight takes over the camera
  onBeat?: (id: OvertureBeatId) => void; // future FX hook (lensing/beam/swarm/glide)
  onHud?: (state: OvertureHudState) => void; // DOM overlay driver (fade + text)
}

// Build the rail sources from the LIVE data: the world-position singleton
// (written each frame by LichPlanets), the Dyson-swarm center, and the spawn pose.
// The star is the origin. This is the single point that reads the live singleton;
// rail.ts (pure, fiber-free) consumes the result. Fresh Vector3s so frameWaypoints
// can .copy them without aliasing the shared STAR_ORIGIN singleton.
//
// Finding 1: `spawn` is the CHASE pose (craftState.pos − forward·OFFSET_BACK +
// up·OFFSET_UP) — exactly where CameraRig will place the camera at handover — NOT
// the bare craft pose. The rail's final waypoint is this chase pose, so the
// handover from the rail to CameraRig is pop-free. Derived from the craftState
// singleton + cameraRig consts; no hardcoded world coordinate.
export function buildOvertureSources(): OvertureSources {
  return {
    star: new Vector3().copy(STAR_ORIGIN),
    worlds: getPlanetPositions(),
    swarm: new Vector3(SWARM_CENTER[0], SWARM_CENTER[1], SWARM_CENTER[2]),
    spawn: chaseSpawnPose(craftState.pos, craftState.forward, OFFSET_BACK, OFFSET_UP),
  };
}

// Module-scoped scratch vectors for the per-frame drive — no per-frame allocation
// (R3F idiom). _look lerps the look target STAR_ORIGIN → craftState.pos across the
// handover phase; _drift carries the live-vs-baked glide-world offset.
const _look = new Vector3();
const _drift = new Vector3();

// Handover-phase HUD fade: 0 before the phase, 1 at the end. The handover phase is
// the last (1 − HANDOVER_T) of the timeline (≈11 s at 75 s), which contains the
// spec's "HUD fades in during last 10 s" window. Linear ramp is honest + matches
// the conductor's delimitation of the phase exactly.
function handoverFade(t: number): number {
  const span = 1 - HANDOVER_T;
  if (span <= 0) return 1;
  const f = (t - HANDOVER_T) / span;
  return f < 0 ? 0 : f > 1 ? 1 : f;
}

export function Overture({
  tier,
  durationS = DEFAULT_DURATION_S,
  onHandover,
  onBeat,
  onHud,
}: OvertureProps) {
  // ponytail: tier is accepted for the future tier-gated FX hook (trimmed effects
  // on webgl2) but drives no branching this wave — the overture runs on every live
  // tier. Referenced so tsc doesn't flag the prop as drift bait.
  void tier;

  const camera = useThree((s) => s.camera);

  // Rail build (once). try/caught so a bad singleton/waypoint set skips to flight
  // instead of throwing inside render. railRef stays null on failure.
  const railRef = useRef<{ curve: CatmullRomCurve3; waypoints: OvertureWaypoints } | null>(null);
  const buildFailed = useRef(false);
  useMemo(() => {
    try {
      const waypoints = frameWaypoints(buildOvertureSources());
      railRef.current = { curve: createRail(waypoints), waypoints };
    } catch (err) {
      buildFailed.current = true;
      // eslint-disable-next-line no-console
      console.error('[overture] rail build failed — skipping to flight:', err);
    }
  }, []);

  const conductor = useRef(new Conductor());
  const tl = useRef({ t: 0, skipping: false, skipStartT: 0 });
  const handedOver = useRef(false);
  // last emitted hud state — onHud fires only on change (bounds DOM updates).
  const lastHud = useRef<OvertureHudState>({ fade: 0, text: '' });

  // Finding 6: hoist callbacks into refs updated EVERY render so handoverOnce + the
  // frame loop always call the LATEST prop identity. A parent re-render passing a new
  // onHandover/onBeat/onHud (App wiring is setState-driven) must not leave the
  // empty-dep skip effect or the frame loop calling a stale first-render closure.
  const onHandoverRef = useRef(onHandover);
  onHandoverRef.current = onHandover;
  const onBeatRef = useRef(onBeat);
  onBeatRef.current = onBeat;
  const onHudRef = useRef(onHud);
  onHudRef.current = onHud;

  // handoverOnce reads the ref, so it is safe to fire from any closure (the build-fail
  // path, the frame loop, the done step) and always invokes the current onHandover.
  const handoverOnce = () => {
    if (handedOver.current) return;
    handedOver.current = true;
    onHandoverRef.current();
  };

  // Any-input skip (spec: "any key/click → accelerated scrub"). Attached only in a
  // real browser; the listener flips `skipping`, scrubAdvance does the rest each
  // frame. Reduced-motion users never mount Overture (App-level route), so this is
  // the in-overture skip for everyone else.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const trigger = () => {
      const s = tl.current;
      if (!s.skipping && !handedOver.current) {
        s.skipping = true;
        s.skipStartT = s.t;
      }
    };
    window.addEventListener('keydown', trigger);
    window.addEventListener('pointerdown', trigger);
    return () => {
      window.removeEventListener('keydown', trigger);
      window.removeEventListener('pointerdown', trigger);
    };
  }, []);

  // Finding 4 (sole-camera-driver contract): default priority ON PURPOSE. In R3F,
  // ANY useFrame subscriber with priority > 0 increments internal.priority and
  // switches OFF automatic rendering ("takes rendering into its own hands" — fiber
  // Loop source); Overture never calls gl.render, so a positive priority would
  // black-screen the app. The contract is therefore enforced by App wiring alone:
  // Overture is the sole camera driver while mounted; CameraRig must NOT be
  // mounted concurrently (the mount point swaps one for the other on handover).
  useFrame((_, rawDt) => {
    // Error path: a failed rail build (or any throw below) → log + skip to flight.
    if (buildFailed.current || !railRef.current) {
      handoverOnce();
      return;
    }
    try {
      const dt = Math.min(rawDt, 1 / 30); // clamp lag spikes (world idiom)
      const s = tl.current;
      s.t = s.skipping ? scrubAdvance(s.t, dt, s.skipStartT) : s.t + dt / durationS;
      if (s.t > 1) s.t = 1;

      const step = conductor.current.step(s.t);

      // Drive the camera along the rail.
      camera.position.copy(railPointAt(railRef.current.curve, step.railParam));

      // Finding 5: the glide world keeps orbiting while the rail is baked, so nudge the
      // mid-glide camera onto the LIVE world. w is a triangle: 0 outside
      // [glide, handover), so the rail's start and (sacred) end poses are untouched.
      const driftW = glideDriftWeight(step.t);
      if (driftW > 0) {
        const liveGlide = getPlanetPositions()[GLIDE_WORLD_INDEX];
        if (liveGlide) {
          _drift.subVectors(liveGlide, railRef.current.waypoints.glideWorld);
          camera.position.addScaledVector(_drift, driftW);
        }
      }

      // Finding 1: look-at lerps STAR_ORIGIN → craftState.pos across the handover
      // phase (same ramp as the HUD fade). Before handover the camera looks at the
      // star (unchanged); at t=1 it looks at craftState.pos — exactly what CameraRig
      // imposes on mount (its look target damps toward craftState.pos) — so the
      // handover has no orientation pop. Module scratch _look, no per-frame alloc.
      const fade = handoverFade(step.t);
      _look.copy(STAR_ORIGIN).lerp(craftState.pos, fade);
      camera.lookAt(_look);

      // Emit newly-fired beats (future FX hook) + advance the HUD overlay state.
      // Finding 6: call through the refs so a re-rendered prop identity is used.
      for (const id of step.fired) onBeatRef.current?.(id);

      const hud: OvertureHudState = {
        fade,
        text: step.phase === 'handover' ? 'YOU HAVE THE CRAFT' : '',
      };
      if (hud.fade !== lastHud.current.fade || hud.text !== lastHud.current.text) {
        lastHud.current = hud;
        onHudRef.current?.(hud);
      }

      if (step.done) handoverOnce();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[overture] frame drive failed — skipping to flight:', err);
      handoverOnce();
    }
  });

  return null;
}
