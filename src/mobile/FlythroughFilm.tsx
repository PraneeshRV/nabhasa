// FlythroughFilm — Nabhasa Task 14 (mobile linear cut, designed-down).
//
// NOT a broken port of the flight sim. The mobile device gets a DIRECTED camera
// through the SAME world the desktop player flies: an authored Catmull-Rom path
// visiting the four set-pieces (arrival → lensing orbit → beam transit → swarm
// assembly), scrubbed/paused by touch-drag with inertia (GSAP timeline, never
// scroll). Same sound, same reveals, no Rapier/game fetch (invariant).
//
// HOW IT REUSES THE WORLD (the trick): PulsarBeams + DysonSwarm react to
// `craftState.pos` — the shared singleton the Rapier craft writes on desktop.
// The film writes craftState.pos = cameraPosition each frame, so the swarm
// ASSEMBLES as the camera approaches SWARM_CENTER and a beam TRANSITS exactly as
// it would for the craft. Same reveals, zero physics code. The Rapier-driven
// <Craft> + <CameraRig> are never mounted on mobile.
//
// TIER CAPS: coarse pointer already lands on webgpu-low/webgl2 via detectTier;
// the route additionally clamps webgpu-high → webgpu-low (spec: "webgpu-low-or-
// below"). DPR ≤1.5 comes from QUALITY[webgpu-low|webgl2].dpr. Collapse
// preloader (reveal #1 + the WebAudio gesture) gates entry unchanged.
//
// PERF RULES honored: dt clamped to 1/30; refs + module singletons only (no
// setState in useFrame); camera path sampled from a baked LUT (no per-frame
// alloc, no CatmullRom.getPoint API-surface risk); everything disposed on
// unmount; sonify + HUD DOM writes throttled to 10 Hz.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three/webgpu';
import gsap from 'gsap';
import { NabhasaCanvas } from '../core/renderer';
import { usePerfProbe } from '../core/perfProbe';
import { QUALITY } from '../core/quality';
import type { Tier } from '../core/tiers';
import { LensingSkybox } from '../signatures/LensingSkybox';
import { NeutronStar, starClock, starSpinAngle } from '../world/NeutronStar';
import { PulsarBeams, beamState } from '../signatures/PulsarBeams';
import { DysonSwarm, subscribeSwarmFlare } from '../signatures/DysonSwarm';
import { craftState } from '../flight/craftState';
import { regionAt, type RegionId } from '../world/regions';
import { timeDilation } from '../hud/physics-data';
import { initAudio, setMuted, getAudio } from '../audio/engine';
import { startAmbient } from '../audio/ambient';
import { initSonify, type SonifyHandle } from '../audio/sonify';

// ── Authored camera path (world units; star at origin, SWARM @ (900,0,0)) ──────
// Beats land roughly at: 0.0 arrival · 0.34 lensing orbit · 0.62 beam-transit
// dive · 0.88→1.0 swarm assembly. getSpacedPoints arc-length-parameterizes the
// curve → even camera speed across beats (a parameter-space curve would dwell
// in long segments and rush short ones).
const ANCHORS: ReadonlyArray<readonly [number, number, number]> = [
  [0, 220, 1700], // arrival — star a blip, lensing ring the anomaly
  [0, 130, 760], // approach
  [300, 95, 250], // lensing orbit (r≈405, ring blazes)
  [-260, 55, 170], // orbit back (r≈312)
  [25, 95, 25], // beam-transit dive (r≈100, near +Y pole)
  [520, 45, 210], // climb out toward swarm
  [815, 22, 120], // swarm approach (assembly rises)
  [900, 8, 35], // swarm core (full assembly, glitter wave)
];

const LUT_N = 512; // baked sample count — dense enough that p-step lookups are smooth
const LOOK_STEP = Math.max(1, Math.round(LUT_N * 0.03)); // look-ahead index delta
const FILM_DUR = 75; // seconds for a full unattended playthrough (contemplative)

// Look-target star bias: within STAR_BIAS_NEAR of origin the look target blends
// to the star so the beam-transit + lensing beats frame the source, not the path
// ahead. Beyond STAR_BIAS_FAR it's pure path look-ahead.
const STAR_BIAS_NEAR = 120;
const STAR_BIAS_FAR = 420;
const _origin = new THREE.Vector3(0, 0, 0); // look-bias target (the star); never mutated
const _look = new THREE.Vector3(); // frame scratch (computed look target)

// Scrub feel. SENS: drag across ~1.4× viewport width scrubs the whole film.
// INERTIA: release velocity (px/ms) → progress jump. MIN_VEL below = no inertia,
// just resume auto-play.
const SCRUB_SENS_FACTOR = 1.4;
const INERTIA = 0.8;
const MIN_VEL_PX_MS = 0.45;

// 10 Hz throttle for sonify + HUD DOM writes (spec perf rule: throttled sink).
const TICK_HZ = 10;
const TICK_DT = 1 / TICK_HZ;

const REGION_LABEL: Record<RegionId, string> = {
  arrival: 'ARRIVAL',
  nearStar: 'NEAR-STAR',
  swarm: 'SWARM',
};

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const clamp = (x: number, lo: number, hi: number) => (x < lo ? lo : x > hi ? hi : x);

function buildLUT(): THREE.Vector3[] {
  const pts = ANCHORS.map((a) => new THREE.Vector3(a[0], a[1], a[2]));
  const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5);
  return curve.getSpacedPoints(LUT_N); // arc-length even spacing; one-time alloc
}

// Shared mutable film state: scrub/auto-play progress + the audio-arm callback
// (stashed here by FilmCamera so the outer pointerdown handler can fire it in
// the user gesture without a React prop round-trip).
type Progress = { p: number; arm?: () => void };

// ── Film camera: drives the R3F camera + writes craftState.pos each frame ─────
type FilmCameraProps = {
  progress: React.RefObject<Progress>;
  hudEl: React.RefObject<HTMLDivElement | null>;
  railEl: React.RefObject<HTMLDivElement | null>;
  sound: boolean;
};

function FilmCamera({ progress, hudEl, railEl, sound }: FilmCameraProps) {
  const { camera } = useThree();
  const lut = useMemo(buildLUT, []); // baked once, stable across renders

  // Audio: built on first guarantee of a user gesture. The collapse ENGAGE click
  // is one, but CollapsePreloader defers onEnter 650 ms (outside the gesture
  // window for some browsers' resume()), so the canvas's first pointerdown is
  // the canonical arm. armAudio is idempotent and re-attempts ctx.resume() each
  // call: the best-effort mount-time arm leaves the ctx suspended (no gesture),
  // and the pointerdown arm lands inside a gesture → flips it to 'running'.
  const sonifyH = useRef<SonifyHandle | null>(null);
  const flare = useRef(false); // swarm flare rising-edge → sonify (consumed @10Hz)

  const armAudio = useCallback(() => {
    initAudio(); // idempotent
    // Re-attempt resume each call (NOT an early-return on a boolean): the
    // mount-time arm created the ctx suspended; the pointerdown gesture here is
    // what unlocks it. No-op once ctx.state === 'running'.
    const ctx = getAudio()?.ctx;
    if (ctx && ctx.state !== 'running') void ctx.resume();
    startAmbient();
    setMuted(!sound); // "sound on" → unmute; "enter silent" → stays muted
    if (!sonifyH.current) {
      sonifyH.current = initSonify({ getSpinPhase: () => starSpinAngle(starClock.t) });
    }
  }, [sound]);

  useEffect(() => {
    if (sound) armAudio(); // best-effort (may need the pointerdown gesture below)
    const unsub = subscribeSwarmFlare(() => {
      flare.current = true;
    });
    return () => {
      unsub();
      sonifyH.current?.dispose();
      sonifyH.current = null;
    };
  }, [armAudio, sound]);

  // Expose the arm fn to the outer pointer handlers via the shared progress ref,
  // so the parent's pointerdown can fire it inside the user gesture.
  useEffect(() => {
    progress.current.arm = armAudio;
  }, [progress, armAudio]);

  // frame scratch (never allocate in useFrame)
  const tickAcc = useRef(0);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30); // clamp (perf rule)
    const p = clamp01(progress.current.p);
    const i = Math.round(p * LUT_N);
    const here = lut[clamp(i, 0, LUT_N)];
    const ahead = lut[clamp(i + LOOK_STEP, 0, LUT_N)];

    // camera + world-pos write (the integration trick: world reacts to this)
    camera.position.copy(here);
    craftState.pos.copy(here);

    // look-ahead blended toward the star when close (frames the beam/lensing beats)
    const r = here.length();
    const starBias = clamp01((STAR_BIAS_FAR - r) / (STAR_BIAS_FAR - STAR_BIAS_NEAR));
    _look.copy(ahead).lerp(_origin, starBias);
    // p=1 (and any beat where ahead==here): looking at self → degenerate quaternion.
    // Fall back to the star — a clean closing framing from the swarm.
    if (_look.distanceToSquared(here) < 1) _look.copy(_origin);
    camera.lookAt(_look);

    // 10 Hz sink: sonify + HUD DOM writes + rail. No React state.
    tickAcc.current += dt;
    if (tickAcc.current < TICK_DT) return;
    tickAcc.current = 0;

    const h = sonifyH.current;
    if (h) {
      h.update({ rKm: r, beamAlignment: beamState.transit, flare: flare.current });
      flare.current = false;
    }

    const el = hudEl.current;
    if (el) {
      const reg = REGION_LABEL[regionAt(here)];
      const dil = timeDilation(r).toFixed(3);
      const transit = beamState.transit > 0.5 ? ' · BEAM TRANSIT' : '';
      el.textContent = `${reg} · t_surf/t_you ${dil}${transit}`;
    }
    const rail = railEl.current;
    if (rail) rail.style.transform = `scaleX(${p})`;
  });

  return null;
}

function PerfProbe({ label }: { label: string }) {
  usePerfProbe(label);
  return null;
}

// ── Outer shell: canvas + scrub surface + condensed HUD + progress rail ───────
export function FlythroughFilm({ tier, sound }: { tier: Tier; sound: boolean }) {
  // The shared scrub/auto-play state (ref — never React state; mutated by GSAP
  // and the pointer handlers, read in useFrame). Carries `arm` (audio gesture)
  // stashed by FilmCamera.
  const progress = useRef<Progress>({ p: 0 });
  const hudEl = useRef<HTMLDivElement | null>(null);
  const railEl = useRef<HTMLDivElement | null>(null);
  // Full-film scrub across ~SCRUB_SENS_FACTOR× viewport width of drag. Computed
  // once (innerWidth is stable for the film's lifetime; orientationchange would
  // need a re-read — deferred until a device test shows it matters).
  const [sens] = useState(() => SCRUB_SENS_FACTOR / window.innerWidth);

  // drag scratch (module-life; one film at a time)
  const drag = useRef({ active: false, startX: 0, lastT: 0, lastX: 0, vel: 0, pAtDown: 0 });

  const playFrom = useCallback((fromP: number) => {
    // Auto-advance to the end at a contemplative pace, then hold (scrubbable).
    gsap.killTweensOf(progress.current);
    const remain = Math.max(0.05, 1 - fromP) * FILM_DUR;
    gsap.to(progress.current, { p: 1, duration: remain, ease: 'none' });
  }, []);

  useEffect(() => {
    playFrom(0); // begin auto-playing on mount
    return () => {
      gsap.killTweensOf(progress.current); // no tween outlives the film
    };
  }, [playFrom]);

  // ── scrub handlers (pointer events: touch + coarse mouse) ──
  const onPointerDown = (e: React.PointerEvent) => {
    progress.current.arm?.(); // arm audio in this user gesture
    gsap.killTweensOf(progress.current); // pause auto-play
    drag.current = {
      active: true,
      startX: e.clientX,
      lastT: e.timeStamp,
      lastX: e.clientX,
      vel: 0,
      pAtDown: progress.current.p,
    };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d.active) return;
    const dx = e.clientX - d.startX;
    progress.current.p = clamp01(d.pAtDown + dx * sens);
    // track velocity (px/ms) for release inertia
    const dt = e.timeStamp - d.lastT;
    if (dt > 0) d.vel = (e.clientX - d.lastX) / dt;
    d.lastT = e.timeStamp;
    d.lastX = e.clientX;
  };

  const endDrag = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d.active) return;
    d.active = false;
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    const v = d.vel;
    if (Math.abs(v) > MIN_VEL_PX_MS) {
      // inertia: continue the scrub, then resume auto-play from the settled p
      const target = clamp01(progress.current.p + v * INERTIA);
      gsap.to(progress.current, {
        p: target,
        duration: 0.6,
        ease: 'power3.out',
        onComplete: () => playFrom(progress.current.p),
      });
    } else {
      playFrom(progress.current.p); // resume from the scrubbed position
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: '#030407', // --void
        touchAction: 'none', // touch drives scrub, never scroll
        overflow: 'hidden',
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <NabhasaCanvas tier={tier}>
        {/* Sky owner = lensing (every lensing tier is 'full'); Starfield would
            only own it on 'off'. Same sky-ownership rule as MainExperience. */}
        {QUALITY[tier].lensing === 'off' ? null : <LensingSkybox tier={tier} />}
        <NeutronStar />
        <PulsarBeams tier={tier} />
        <DysonSwarm tier={tier} />
        <FilmCamera progress={progress} hudEl={hudEl} railEl={railEl} sound={sound} />
        <PerfProbe label="film" />
      </NabhasaCanvas>

      {/* Condensed HUD — one readout line (spec). DOM, JetBrains Mono, --ui-cold.
          Written via textContent @10Hz (zero re-renders). aria-live off (too
          frequent) — Task 15 adds a static summary region sitewide. */}
      <div
        ref={hudEl}
        aria-live="off"
        style={{
          position: 'absolute',
          left: 14,
          top: 14,
          color: '#8A93A6', // --ui-cold
          font: '13px/1.4 "JetBrains Mono", ui-monospace, monospace',
          letterSpacing: '+0.08em',
          textTransform: 'uppercase',
          userSelect: 'none',
          pointerEvents: 'none',
        }}
      />

      {/* Progress rail — the only scrub affordance. Fills --star-hot to p. */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: 2,
          background: '#3A4150', // --ui-dim track
        }}
      >
        <div
          ref={railEl}
          style={{
            transformOrigin: '0 50%',
            width: '100%',
            height: '100%',
            background: '#AFE3FF', // --star-hot — the one accent
            transform: 'scaleX(0)',
          }}
        />
      </div>
    </div>
  );
}
