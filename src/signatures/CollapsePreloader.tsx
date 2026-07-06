// CollapsePreloader — Nabhasa signature #1 (spec Task 8).
// Full-screen diegetic loader: progress IS the collapse, never a bar. A giant
// red supergiant compresses as real assets load → implosion → flash → reborn as
// the tiny blue-white neutron star → ENGAGE buttons (the click = the WebAudio
// unlock gesture).
//
// Owns its own R3F <Canvas> (signature isolation): the main NabhasaCanvas is NOT
// mounted during the burst, so the collapse owns the GPU and the perf probe is
// clean. Rapier (the real lazy payload) is warmed by App via a parallel dynamic
// import; `ready` is that signal. THREE.DefaultLoadingManager covers real
// three-asset loads (textures/models added by later tasks). A time floor plays
// the beats on fast machines; a safety timeout guarantees we never stall.
//
// TSL rules honored: refs + module-singleton uniforms only (no setState in
// useFrame except a single one-shot at the ENGAGE boundary); everything disposed
// on unmount. Static tier is skipped by App before this mounts.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree, extend } from '@react-three/fiber';
import { useControls } from 'leva';
import * as THREE from 'three/webgpu';
import { QUALITY } from '../core/quality';
import type { Tier } from '../core/tiers';
import { usePerfProbe } from '../core/perfProbe';
import { STAR_RADIUS } from '../world/scale';
import { createStarSurfaceMaterial } from '../shaders/starSurface';
import {
  collapseUniforms,
  createCollapseStarMaterial,
  createCollapseParticleMaterial,
  createShockwaveMaterial,
  createFlashMaterial,
} from '../shaders/collapse';

extend(THREE as any);

// Phase machine (spec locked sequence). LOAD = compress with progress; the rest
// are timed beats. ENGAGE exposes the buttons.
const PHASE = { LOAD: 0, IMPLODE: 1, BLACK: 2, SETTLE: 3, PULLBACK: 4, ENGAGE: 5 } as const;
const DUR = { IMPLODE: 0.3, BLACK: 0.12, SETTLE: 0.75, PULLBACK: 0.85 };
const MIN_LOAD_S = 2.2; // play the compression beat even on a fast machine
const SAFETY_S = 9; // never stall — proceed past a hung loader
const GIANT_SCALE = 3.4; // ×STAR_RADIUS(10) = 34 wu → fills the frame at z=60
const NEUTRON_SCALE = 0.1; // ×STAR_RADIUS = 1 wu → tiny blinding dot

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

// CPU-seeded spherical shell of collapse particles. Random once at build; the
// shader drifts them inward via positionNode (see shaders/collapse.ts). 0 on the
// static tier (App skips this component then, but guard anyway).
function buildShell(count: number, rMin: number, rMax: number): Float32Array {
  const arr = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const u = Math.random();
    const v = Math.random();
    const theta = 2 * Math.PI * u;
    const phi = Math.acos(2 * v - 1);
    const sx = Math.sin(phi) * Math.cos(theta);
    const sy = Math.cos(phi);
    const sz = Math.sin(phi) * Math.sin(theta);
    const r = rMin + Math.sqrt(Math.random()) * (rMax - rMin); // area-uniform shell
    arr[i * 3] = sx * r;
    arr[i * 3 + 1] = sy * r;
    arr[i * 3 + 2] = sz * r;
  }
  return arr;
}

type SceneProps = { tier: Tier; ready: boolean; dev: boolean; onEngageReady: () => void };

function CollapseScene({ tier, ready, dev, onEngageReady }: SceneProps) {
  const camera = useThree((s) => s.camera);
  const emberMeshRef = useRef<THREE.Mesh>(null);
  const neutronMeshRef = useRef<THREE.Mesh>(null);
  const pointsRef = useRef<THREE.Points>(null);
  const ringRef = useRef<THREE.Mesh>(null);

  // Materials + geometries built once; disposed on unmount (spec perf rule).
  const assets = useMemo(() => {
    const starMat = createCollapseStarMaterial();
    const partMat = createCollapseParticleMaterial();
    const ringMat = createShockwaveMaterial();
    const flashMat = createFlashMaterial();
    const neutronMat = createStarSurfaceMaterial(); // reuse: blue-white #AFE3FF surface
    const starGeo = new THREE.SphereGeometry(STAR_RADIUS, 96, 96);
    const neutronGeo = new THREE.SphereGeometry(STAR_RADIUS, 48, 48);
    const ringGeo = new THREE.RingGeometry(0.8, 1.0, 128); // unit ring; scaled live
    const flashGeo = new THREE.PlaneGeometry(400, 400);
    const count = QUALITY[tier].collapseParticles;
    const pointsGeo = new THREE.BufferGeometry();
    pointsGeo.setAttribute('position', new THREE.BufferAttribute(buildShell(count, 12, 55), 3));
    pointsGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 80);
    return { starMat, partMat, ringMat, flashMat, neutronMat, starGeo, neutronGeo, ringGeo, flashGeo, pointsGeo };
  }, [tier]);

  useEffect(() => {
    const a = assets;
    return () => {
      a.starMat.dispose();
      a.partMat.dispose();
      a.ringMat.dispose();
      a.flashMat.dispose();
      a.neutronMat.dispose();
      a.starGeo.dispose();
      a.neutronGeo.dispose();
      a.ringGeo.dispose();
      a.flashGeo.dispose();
      a.pointsGeo.dispose();
    };
  }, [assets]);

  // Phase machine state (refs — never per-frame React state). Typed <number> so
  // PHASE literal enums can widen when reassigned in the machine.
  const phaseRef = useRef<number>(PHASE.LOAD);
  const phaseTRef = useRef<number>(0); // 0..1 within current phase
  const elapsedRef = useRef(0);
  const forcedGateRef = useRef(false); // safety-timeout gate
  const engageFiredRef = useRef(false);
  // LoadingManager exposes progress via callbacks only (no public counters)
  const loadCountsRef = useRef({ loaded: 0, total: 0 });
  useEffect(() => {
    const manager = THREE.DefaultLoadingManager;
    const prev = manager.onProgress; // save: a shared global — restore, don't noop
    manager.onProgress = (_url, loaded, total) => {
      loadCountsRef.current = { loaded, total };
    };
    return () => {
      manager.onProgress = prev;
    };
  }, []);

  // applyPhase writes the whole visual from (phase, phaseT). Shared by the auto
  // machine and the dev leva override so both drive identical uniforms.
  const applyPhase = (phase: number, phaseT: number) => {
    const U = collapseUniforms;
    U.uTime.value = elapsedRef.current;

    // Defaults — nothing showing.
    let emberScale = 0;
    let neutronScale = 0;
    let ringScale = 0;
    let emberVis = false;
    let neutronVis = false;
    let ringVis = false;
    let pointsVis = false;
    U.uImplosion.value = 0;
    U.uShockwave.value = 0;
    U.uFlash.value = 0;

    switch (phase) {
      case PHASE.LOAD: {
        const pr = U.uProgress.value;
        emberScale = lerp(GIANT_SCALE, 0.5, clamp01(pr));
        emberVis = true;
        break;
      }
      case PHASE.IMPLODE: {
        const pr = collapseUniforms.uProgress.value;
        emberScale = lerp(0.5, 0, phaseT) * (pr > 0 ? 1 : 0);
        emberVis = true;
        U.uImplosion.value = phaseT;
        U.uFlash.value = phaseT * 0.7;
        pointsVis = true;
        break;
      }
      case PHASE.BLACK: {
        U.uImplosion.value = 1;
        U.uFlash.value = lerp(0.7, 0, phaseT);
        pointsVis = true;
        break;
      }
      case PHASE.SETTLE: {
        neutronScale = lerp(0, NEUTRON_SCALE, phaseT);
        neutronVis = true;
        U.uShockwave.value = phaseT;
        ringScale = 8 + phaseT * 70;
        ringVis = true;
        break;
      }
      case PHASE.PULLBACK: {
        neutronScale = NEUTRON_SCALE;
        neutronVis = true;
        U.uShockwave.value = 1;
        ringScale = 78 + phaseT * 40;
        ringVis = true;
        camera.position.z = lerp(60, 150, phaseT);
        break;
      }
      case PHASE.ENGAGE: {
        neutronScale = NEUTRON_SCALE;
        neutronVis = true;
        U.uShockwave.value = 1;
        ringScale = 118;
        ringVis = true;
        camera.position.z = 150;
        break;
      }
    }

    if (emberMeshRef.current) {
      emberMeshRef.current.scale.setScalar(emberScale);
      emberMeshRef.current.visible = emberVis;
    }
    if (neutronMeshRef.current) {
      neutronMeshRef.current.scale.setScalar(neutronScale);
      neutronMeshRef.current.visible = neutronVis;
    }
    if (ringRef.current) {
      ringRef.current.scale.setScalar(ringScale);
      ringRef.current.visible = ringVis;
    }
    if (pointsRef.current) pointsRef.current.visible = pointsVis;
  };

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 30);
    elapsedRef.current += dt;

    if (dev) {
      // Manual art-direction path: phase/phaseT come from leva; progress was set
      // directly on the uniform by the dev controls.
      applyPhase(phaseRef.current, phaseTRef.current);
      return;
    }

    // --- Production progress (real signals, never faked) ---
    const { loaded, total: items } = loadCountsRef.current;
    const managerProgress = items > 0 ? loaded / items : 0;
    const managerIdle = items === 0 || loaded >= items;
    // Visual progress = real load signals only. MIN_LOAD_S still floors the
    // LOAD→IMPLODE transition below (so the beat plays on fast machines), but a
    // slow network never gets fake completion painted on the star.
    const progress = clamp01(Math.max(managerProgress, ready ? 1 : 0));
    collapseUniforms.uProgress.value = progress;

    // Safety: a hung loader must not stall the gate forever.
    if (elapsedRef.current > SAFETY_S) forcedGateRef.current = true;
    const gateMet = (ready && managerIdle) || forcedGateRef.current;

    // --- Auto phase advance ---
    let phase = phaseRef.current;
    let phaseT = phaseTRef.current;

    if (phase === PHASE.LOAD) {
      // Hold compressing until the star is fully compressed AND assets settled.
      if (progress >= 1 && gateMet && elapsedRef.current >= MIN_LOAD_S) {
        phase = PHASE.IMPLODE;
        phaseT = 0;
      }
    } else {
      phaseT += dt;
      const dur =
        phase === PHASE.IMPLODE
          ? DUR.IMPLODE
          : phase === PHASE.BLACK
            ? DUR.BLACK
            : phase === PHASE.SETTLE
              ? DUR.SETTLE
              : phase === PHASE.PULLBACK
                ? DUR.PULLBACK
                : Infinity;
      if (phaseT >= dur) {
        phaseT = 0;
        phase = Math.min(phase + 1, PHASE.ENGAGE);
      }
    }

    phaseRef.current = phase;
    phaseTRef.current = phaseT;
    applyPhase(phase, phaseT);

    // One-shot ENGAGE boundary → React state (a single transition, not per-frame).
    if (phase === PHASE.ENGAGE && !engageFiredRef.current) {
      engageFiredRef.current = true;
      onEngageReady();
    }
  });

  return (
    <group>
      <mesh ref={emberMeshRef} geometry={assets.starGeo} material={assets.starMat} />
      <mesh ref={neutronMeshRef} geometry={assets.neutronGeo} material={assets.neutronMat} visible={false} />
      <mesh ref={ringRef} geometry={assets.ringGeo} material={assets.ringMat} visible={false} />
      {/* Flash plane sits at the origin facing the camera; alpha gated by uFlash. */}
      <mesh geometry={assets.flashGeo} material={assets.flashMat} />
      <points ref={pointsRef} geometry={assets.pointsGeo} material={assets.partMat} visible={false} />
      {dev && <CollapseDevControls phaseRef={phaseRef} phaseTRef={phaseTRef} />}
    </group>
  );
}

// Leva harness for art-direction (spec Task 8 Step 1). Only mounted in dev mode.
// Structural `{ current: number }` sidesteps the React-19 MutableRefObject shift.
function CollapseDevControls({
  phaseRef,
  phaseTRef,
}: {
  phaseRef: { current: number };
  phaseTRef: { current: number };
}) {
  useControls({
    progress: {
      value: 0,
      min: 0,
      max: 1,
      step: 0.01,
      onChange: (v) => {
        collapseUniforms.uProgress.value = v;
      },
    },
    phase: {
      value: PHASE.LOAD,
      min: PHASE.LOAD,
      max: PHASE.ENGAGE,
      step: 1,
      onChange: (v) => {
        phaseRef.current = v;
      },
    },
    phaseT: {
      value: 0,
      min: 0,
      max: 1,
      step: 0.01,
      onChange: (v) => {
        phaseTRef.current = v;
      },
    },
  });
  return null;
}

function EngageGate({ show, onEnter }: { show: boolean; onEnter: (sound: boolean) => void }) {
  // The buttons are always mounted (show toggles opacity/pointerEvents), so
  // autoFocus={show} only fired on first mount — when the gate appears focus was
  // NOT moved to ENGAGE. Move it imperatively on each show→true transition so
  // keyboard users land on the primary action, not the browser default.
  const primaryRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (show) primaryRef.current?.focus();
  }, [show]);
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-end',
        paddingBottom: '14vh',
        gap: '0.75rem',
        pointerEvents: show ? 'auto' : 'none',
        opacity: show ? 1 : 0,
        transition: 'opacity 700ms ease',
        zIndex: 2,
      }}
    >
      <button
        ref={primaryRef}
        onClick={() => onEnter(true)}
        style={engageBtn(true)}
      >
        ENGAGE — sound on
      </button>
      <button onClick={() => onEnter(false)} style={engageBtn(false)}>
        enter silent
      </button>
    </div>
  );
}

const engageBtn = (primary: boolean): React.CSSProperties => ({
  fontFamily: '"JetBrains Mono", ui-monospace, monospace',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  fontSize: primary ? '14px' : '12px',
  color: primary ? '#030407' : '#8A93A6',
  background: primary ? '#AFE3FF' : 'transparent',
  border: primary ? 'none' : '1px solid #3A4150',
  padding: primary ? '14px 34px' : '10px 22px',
  borderRadius: '2px',
  cursor: 'pointer',
  // ponytail: no hover lib; minimal hover via CSS-in-JS is overkill here.
});

type Props = {
  tier: Tier;
  ready: boolean;
  onEnter: () => void; // delayed scene swap (fires 650ms after the gesture, in setTimeout)
  onSoundUnlock?: () => void; // synchronous WebAudio unlock, MUST fire inside the click
  dev?: boolean;
};

export function CollapsePreloader({ tier, ready, onEnter, onSoundUnlock, dev = false }: Props) {
  const [engage, setEngage] = useState(false);
  const [leaving, setLeaving] = useState(false);

  // Fade the overlay out BEFORE App swaps in the main scene, so the reborn
  // neutron star dissolves into the live experience instead of hard-cutting.
  // The audio unlock fires synchronously HERE (inside the click) — only the scene
  // swap is delayed. Autoplay policy: the user-gesture stack can't cross setTimeout.
  const handleEngage = (sound: boolean) => {
    if (sound) onSoundUnlock?.();
    setLeaving(true);
    window.setTimeout(onEnter, 650);
  };

  // WebGPU canvas mirror of core/renderer.tsx: AgX, sRGB out, forceWebGL on the
  // webgl2 tier. Referentially stable on `tier` (the renderer re-init gotcha).
  const gl = useMemo(
    () => async (props: unknown) => {
      const renderer = new THREE.WebGPURenderer({
        ...(props as any),
        antialias: true,
        forceWebGL: tier === 'webgl2',
      });
      await renderer.init();
      renderer.toneMapping = THREE.AgXToneMapping;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      return renderer;
    },
    [tier],
  );

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: '#030407', // --void; HTML bg pre-canvas, no white flash
        zIndex: 50,
        opacity: leaving ? 0 : 1,
        transition: 'opacity 650ms ease',
      }}
    >
      <Canvas
        dpr={QUALITY[tier].dpr as any}
        frameloop="always"
        camera={{ position: [0, 0, 60], fov: 60 }}
        gl={gl}
        onCreated={({ scene }) => {
          scene.background = new THREE.Color('#030407');
        }}
      >
        <CollapseScene tier={tier} ready={ready} dev={!!dev} onEngageReady={() => setEngage(true)} />
        <PerfProbe label="collapse" />
      </Canvas>
      <EngageGate show={engage} onEnter={handleEngage} />
    </div>
  );
}

// Tiny local PerfProbe wrapper so CollapseScene can drop it in the tree without
// importing the hook signature mismatch (usePerfProbe is a useFrame hook itself).
function PerfProbe({ label }: { label: string }) {
  usePerfProbe(label);
  return null;
}
